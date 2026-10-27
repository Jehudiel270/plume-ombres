// Preuve de l'ACTIVATION après paiement réussi (chemin jamais exercé en prod :
// FedaPay ne peut envoyer un vrai `approved` qu'après un débit réel).
// On teste `traiterEvenement` avec les magasins mémoire injectables :
//  1. un paiement réussi active l'abonnement du compte ;
//  2. un webhook rejoué n'active pas deux fois (idempotence) ;
//  3. un échec ne touche PAS l'abonnement ;
//  4. un montant incohérent est refusé (anti-manipulation) ;
//  5. une référence inconnue lève une erreur claire.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MagasinPaiementMemoire,
  MagasinAbonnementMemoire,
  MagasinCreditsMemoire,
} from './magasin';
import { traiterEvenement, type ContextePaiement } from './service';
import type { Paiement } from './types';
import type { FournisseurPaiement } from './fournisseur';

const MAINTENANT = new Date('2026-10-27T12:00:00.000Z');

/** Contexte de test : magasins mémoire + horloge figée, aucun réseau. */
function contexte(): ContextePaiement {
  return {
    magasinPaiement: new MagasinPaiementMemoire(),
    magasinAbonnement: new MagasinAbonnementMemoire(),
    magasinCredits: new MagasinCreditsMemoire(),
    fournisseur: {} as FournisseurPaiement,
    maintenant: () => MAINTENANT,
  };
}

/** Trace locale d'un paiement en attente, comme après `initierPaiement`. */
function paiementEnAttente(montant = 5000): Paiement {
  return {
    reference: 'PLU-TEST-0001',
    reference_fournisseur: '900123',
    proprietaire_id: 'utilisateur-1',
    plan: 'lecteur_mensuel',
    montant,
    devise: 'XOF',
    telephone: '97000000',
    statut: 'en_attente',
    fournisseur: 'fedapay',
    url_paiement: 'https://process.fedapay.com/900123',
    operateur: null,
    created_at: MAINTENANT.toISOString(),
    updated_at: MAINTENANT.toISOString(),
  };
}

test('un paiement réussi active l’abonnement du compte', async () => {
  const ctx = contexte();
  await ctx.magasinPaiement.creer(paiementEnAttente());

  const resultat = await traiterEvenement(ctx, {
    referenceInterne: 'PLU-TEST-0001',
    referenceFournisseur: '900123',
    statut: 'reussi',
    montant: 5000,
    operateur: 'mtn',
  });

  assert.equal(resultat.paiement?.statut, 'reussi');
  assert.equal(resultat.applique, true);
  assert.equal(resultat.dejaTraite, false);
  assert.equal(resultat.statutAbonnement, 'actif');
  assert.equal(resultat.abonnement?.plan, 'lecteur_mensuel');
  assert.equal(resultat.abonnement?.paiement_reference, 'PLU-TEST-0001');
  assert.ok(resultat.abonnement?.periode_fin, 'une échéance est fixée');

  // L'abonnement est bien persisté, pas seulement retourné.
  const relu = await ctx.magasinAbonnement.lire('utilisateur-1');
  assert.equal(relu?.statut, 'actif');
});

test('un webhook rejoué n’active pas deux fois', async () => {
  const ctx = contexte();
  await ctx.magasinPaiement.creer(paiementEnAttente());

  await traiterEvenement(ctx, {
    referenceInterne: 'PLU-TEST-0001',
    statut: 'reussi',
    montant: 5000,
  });
  const rejeu = await traiterEvenement(ctx, {
    referenceInterne: 'PLU-TEST-0001',
    statut: 'reussi',
    montant: 5000,
  });

  assert.equal(rejeu.dejaTraite, true);
  assert.equal(rejeu.applique, false);
  assert.equal(rejeu.statutAbonnement, 'actif');
});

test('un paiement échoué ne touche pas l’abonnement', async () => {
  const ctx = contexte();
  await ctx.magasinPaiement.creer(paiementEnAttente());

  const resultat = await traiterEvenement(ctx, {
    referenceInterne: 'PLU-TEST-0001',
    statut: 'echoue',
  });

  assert.equal(resultat.paiement?.statut, 'echoue');
  assert.equal(resultat.applique, false);
  assert.equal(resultat.abonnement, null);
  assert.equal(await ctx.magasinAbonnement.lire('utilisateur-1'), null);
});

test('un montant incohérent est refusé', async () => {
  const ctx = contexte();
  await ctx.magasinPaiement.creer(paiementEnAttente(5000));

  await assert.rejects(
    () =>
      traiterEvenement(ctx, {
        referenceInterne: 'PLU-TEST-0001',
        statut: 'reussi',
        montant: 100,
      }),
    /Montant incohérent/
  );

  // Rien n'a été appliqué.
  const paiement = await ctx.magasinPaiement.lire('PLU-TEST-0001');
  assert.equal(paiement?.statut, 'en_attente');
  assert.equal(await ctx.magasinAbonnement.lire('utilisateur-1'), null);
});

test('une référence inconnue lève une erreur explicite', async () => {
  const ctx = contexte();
  await assert.rejects(
    () =>
      traiterEvenement(ctx, {
        referenceInterne: 'PLU-INEXISTANT',
        statut: 'reussi',
        montant: 5000,
      }),
    /Paiement inconnu/
  );
});
