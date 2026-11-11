// Preuve du choix du moyen de paiement :
//  1. Mobile Money SANS numéro → refus explicite ;
//  2. Carte bancaire SANS numéro → paiement créé, aucun téléphone transmis ;
//  3. Mobile Money AVEC numéro → numéro conservé et transmis.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MagasinAbonnementMemoire,
  MagasinCreditsMemoire,
  MagasinPaiementMemoire,
} from './magasin';
import { initierPaiement, type ContextePaiement } from './service';
import type { DemandePaiement, ResultatPaiement } from './types';
import type { FournisseurPaiement } from './fournisseur';

function contexte() {
  const demandes: DemandePaiement[] = [];
  const fournisseur: FournisseurPaiement = {
    id: 'test',
    nom: 'Test',
    mode: 'simulation',
    estConfigure: () => true,
    creerPaiement: async (demande): Promise<ResultatPaiement> => {
      demandes.push(demande);
      return {
        url: 'https://exemple.test/payer',
        referenceFournisseur: 'REF-TEST',
        fournisseur: 'test',
      };
    },
    verifierPaiement: async () => ({ statut: 'en_attente' }),
    verifierSignature: () => true,
    extraireEvenement: () => null,
  };
  const ctx: ContextePaiement = {
    magasinPaiement: new MagasinPaiementMemoire(),
    magasinAbonnement: new MagasinAbonnementMemoire(),
    magasinCredits: new MagasinCreditsMemoire(),
    fournisseur,
    maintenant: () => new Date('2026-11-11T10:00:00.000Z'),
  };
  return { ctx, demandes };
}

test('Mobile Money sans numéro : refus explicite', async () => {
  const { ctx } = contexte();
  await assert.rejects(
    () =>
      initierPaiement(ctx, {
        proprietaireId: 'u1',
        plan: 'credits_250',
        moyen: 'mobile_money',
      }),
    /Numéro Mobile Money invalide/
  );
});

test('Carte bancaire sans numéro : paiement créé sans téléphone', async () => {
  const { ctx, demandes } = contexte();
  const r = await initierPaiement(ctx, {
    proprietaireId: 'u1',
    plan: 'credits_250',
    moyen: 'carte',
    email: 'lecteur@example.com',
  });
  assert.equal(r.paiement.moyen, 'carte');
  assert.equal(r.paiement.telephone, null);
  assert.equal(demandes.length, 1);
  assert.equal(demandes[0].moyen, 'carte');
  assert.equal(demandes[0].telephone ?? null, null);
});

test('Mobile Money avec numéro : numéro normalisé et transmis', async () => {
  const { ctx, demandes } = contexte();
  const r = await initierPaiement(ctx, {
    proprietaireId: 'u1',
    plan: 'credits_250',
    moyen: 'mobile_money',
    telephone: '+229 97 00 00 00',
    pays: 'bj',
  });
  assert.equal(r.paiement.telephone, '+22997000000');
  assert.equal(demandes[0].telephone, '+22997000000');
});
