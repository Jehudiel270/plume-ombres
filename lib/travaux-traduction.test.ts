// ============================================================
// travaux-traduction.test.ts — Preuves de la persistance des travaux.
//
// Exécution : npx tsx --test lib/travaux-traduction.test.ts
// Aucun réseau, aucune base : le client Supabase est un double en
// mémoire (lib/faux-supabase-travaux.ts) qui imite les seules
// opérations utilisées par le module (filtres, tri, unicité 23505,
// trigger maj_le).
//
// La règle centrale prouvée ici : un travail `en_cours` au battement
// FRAIS appartient à un exécutant vivant (l'onglet) et ne doit pas être
// pris ; au battement PÉRIMÉ il est repris (le serveur prend le relais).
// ============================================================

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FauxSupabaseTravaux, clientFaux } from './faux-supabase-travaux';
import {
  SEUIL_BATTEMENT_MS,
  annulerTravail,
  assainirTravail,
  avancerTravail,
  creerTravail,
  estTravailActif,
  prochainTravail,
  progressionTravail,
} from './travaux-traduction';

const MINUTE = 60_000;

/** Date ISO située `ms` millisecondes dans le passé. */
function ilYa(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('prochainTravail — règle du battement', () => {
  test('ignore un en_cours dont le battement est frais', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.inserer({
      livre_id: 'livre-frais',
      statut: 'en_cours',
      battement_le: ilYa(20_000), // l'onglet bat toutes les 20 s
    });

    const pris = await prochainTravail(clientFaux(faux));

    assert.equal(pris, null, "un battement de 20 s doit protéger le travail");
  });

  test('reprend un en_cours dont le battement est périmé', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-abandonne',
      statut: 'en_cours',
      traites: 40,
      total: 120,
      battement_le: ilYa(SEUIL_BATTEMENT_MS + 5_000),
    });

    const pris = await prochainTravail(clientFaux(faux));

    assert.ok(pris, 'un travail abandonné doit être repris');
    assert.equal(pris.id, ligne.id);
    assert.equal(pris.traites, 40, 'la progression enregistrée est conservée');
    assert.equal(pris.statut, 'en_cours');
  });

  test('reprend un en_cours qui n’a jamais eu de battement', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-sans-battement',
      statut: 'en_cours',
      battement_le: null,
    });

    const pris = await prochainTravail(clientFaux(faux));

    assert.equal(pris?.id, ligne.id);
  });

  test('un battement juste en deçà du seuil protège encore le travail', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.inserer({
      livre_id: 'livre-limite',
      statut: 'en_cours',
      battement_le: ilYa(SEUIL_BATTEMENT_MS - 1_000),
    });

    assert.equal(await prochainTravail(clientFaux(faux)), null);
  });

  test('le seuil est réglable (2 min par défaut)', async () => {
    assert.equal(SEUIL_BATTEMENT_MS, 120_000);

    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-seuil-court',
      statut: 'en_cours',
      battement_le: ilYa(5_000),
    });

    assert.equal(await prochainTravail(clientFaux(faux)), null);
    const pris = await prochainTravail(clientFaux(faux), { seuilBattementMs: 1_000 });
    assert.equal(pris?.id, ligne.id);
  });
});

describe('prochainTravail — ordre et famine', () => {
  test('prend le plus ancien des en_attente', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.inserer({ livre_id: 'livre-recent', cree_le: ilYa(1 * MINUTE) });
    const ancien = faux.inserer({ livre_id: 'livre-ancien', cree_le: ilYa(30 * MINUTE) });
    faux.inserer({ livre_id: 'livre-moyen', cree_le: ilYa(10 * MINUTE) });

    const pris = await prochainTravail(clientFaux(faux));

    assert.equal(pris?.id, ancien.id);
  });

  test('prend le plus ancien, tous états libres confondus', async () => {
    const faux = new FauxSupabaseTravaux();
    const orphelin = faux.inserer({
      livre_id: 'livre-orphelin',
      statut: 'en_cours',
      cree_le: ilYa(40 * MINUTE),
      battement_le: ilYa(SEUIL_BATTEMENT_MS + 1_000),
    });
    faux.inserer({ livre_id: 'livre-neuf', cree_le: ilYa(2 * MINUTE) });

    const pris = await prochainTravail(clientFaux(faux));

    assert.equal(pris?.id, orphelin.id);
  });

  test('une file de en_cours frais ne masque pas un en_attente', async () => {
    // Régression : l'ancien balayage `.limit(20)` trié par création
    // ignorait les 20 premiers (tous frais) et renvoyait null, laissant
    // le en_attente en file POUR TOUJOURS.
    const faux = new FauxSupabaseTravaux();
    for (let index = 0; index < 25; index += 1) {
      faux.inserer({
        livre_id: `livre-occupe-${index}`,
        statut: 'en_cours',
        cree_le: ilYa((120 - index) * MINUTE),
        battement_le: ilYa(10_000),
      });
    }
    const enAttente = faux.inserer({
      livre_id: 'livre-a-prendre',
      statut: 'en_attente',
      cree_le: ilYa(1 * MINUTE),
    });

    const pris = await prochainTravail(clientFaux(faux));

    assert.equal(pris?.id, enAttente.id);
  });
});

describe('prochainTravail — états finaux', () => {
  test('un travail termine, erreur ou annule n’est jamais proposé', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.inserer({ livre_id: 'livre-fini', statut: 'termine', cree_le: ilYa(60 * MINUTE) });
    faux.inserer({ livre_id: 'livre-rate', statut: 'erreur', cree_le: ilYa(50 * MINUTE) });
    faux.inserer({ livre_id: 'livre-annule', statut: 'annule', cree_le: ilYa(40 * MINUTE) });

    assert.equal(await prochainTravail(clientFaux(faux)), null);
  });

  test('un travail clos ne cache pas le suivant', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.inserer({ livre_id: 'livre-fini', statut: 'termine', cree_le: ilYa(60 * MINUTE) });
    const actif = faux.inserer({ livre_id: 'livre-actif', cree_le: ilYa(5 * MINUTE) });

    assert.equal((await prochainTravail(clientFaux(faux)))?.id, actif.id);
  });

  test('un travail annulé par avancerTravail sort de la file', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({ livre_id: 'livre-x', statut: 'en_cours', battement_le: null });

    await annulerTravail(clientFaux(faux), ligne.id);

    assert.equal(await prochainTravail(clientFaux(faux)), null);
    assert.equal(faux.parId(ligne.id).statut, 'annule');
  });
});

describe('creerTravail — idempotence', () => {
  test('crée un travail en_attente par défaut, sans battement', async () => {
    const faux = new FauxSupabaseTravaux();
    const travail = await creerTravail(clientFaux(faux), { livreId: 'livre-neuf' });

    assert.equal(travail.statut, 'en_attente');
    assert.equal(travail.battement_le, null);
    assert.equal(travail.traites, 0);
    assert.equal(faux.lignes.length, 1);
  });

  test('deux appels ne créent qu’un seul travail actif', async () => {
    const faux = new FauxSupabaseTravaux();
    const premier = await creerTravail(clientFaux(faux), { livreId: 'livre-double' });
    const second = await creerTravail(clientFaux(faux), { livreId: 'livre-double' });

    assert.equal(second.id, premier.id);
    assert.equal(faux.lignes.length, 1);
    assert.equal(faux.actifsDuLivre('livre-double').length, 1);
  });

  test('un travail terminé n’empêche pas de relancer une traduction', async () => {
    const faux = new FauxSupabaseTravaux();
    const fini = faux.inserer({ livre_id: 'livre-relance', statut: 'termine' });

    const neuf = await creerTravail(clientFaux(faux), { livreId: 'livre-relance' });

    assert.notEqual(neuf.id, fini.id);
    assert.equal(faux.actifsDuLivre('livre-relance').length, 1);
    assert.equal(faux.lignes.length, 2);
  });

  test('statutInitial en_cours pose le battement (le navigateur travaille)', async () => {
    const faux = new FauxSupabaseTravaux();
    const travail = await creerTravail(clientFaux(faux), {
      livreId: 'livre-navigateur',
      statutInitial: 'en_cours',
      proprietaireId: 'utilisateur-1',
    });

    assert.equal(travail.statut, 'en_cours');
    assert.equal(travail.proprietaire_id, 'utilisateur-1');
    assert.ok(travail.battement_le);
    assert.ok(Date.now() - Date.parse(travail.battement_le) < 5_000);
    assert.equal(faux.ecritures[0].valeurs.proprietaire_id, 'utilisateur-1');
  });

  test('le navigateur PROMEUT un en_attente existant en en_cours', async () => {
    // Sinon : l'onglet bat sur un travail resté en_attente et l'exécutant
    // serveur le prend aussitôt — les deux traduisent le même livre.
    const faux = new FauxSupabaseTravaux();
    const ancien = faux.inserer({
      livre_id: 'livre-partage',
      statut: 'en_attente',
      total: 80,
      battement_le: null,
    });

    const travail = await creerTravail(clientFaux(faux), {
      livreId: 'livre-partage',
      statutInitial: 'en_cours',
    });

    assert.equal(travail.id, ancien.id);
    assert.equal(travail.statut, 'en_cours');
    assert.equal(travail.total, 80, 'les compteurs existants sont conservés');
    assert.ok(travail.battement_le);
    assert.equal(await prochainTravail(clientFaux(faux)), null, 'le serveur ne prend pas');
  });

  test('course entre deux INSERT : 23505 renvoie le travail gagnant', async () => {
    const faux = new FauxSupabaseTravaux();
    faux.programmerCourse('livre-course');

    const travail = await creerTravail(clientFaux(faux), {
      livreId: 'livre-course',
      statutInitial: 'en_cours',
    });

    assert.equal(faux.lignes.length, 1, 'un seul travail en base');
    assert.equal(faux.actifsDuLivre('livre-course').length, 1);
    assert.equal(travail.id, faux.lignes[0].id);
    assert.equal(travail.statut, 'en_cours');
  });

  test('un livre vide est refusé', async () => {
    const faux = new FauxSupabaseTravaux();
    await assert.rejects(
      () => creerTravail(clientFaux(faux), { livreId: '   ' }),
      /Travail sans livre/
    );
    assert.ok(faux.ecrituresVides);
  });
});

describe('avancerTravail — écriture partielle', () => {
  test('{ battement: true } n’écrit QUE battement_le', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-battement',
      statut: 'en_cours',
      traites: 3,
      total: 10,
      erreurs: 1,
      cree_le: ilYa(20 * MINUTE),
      maj_le: ilYa(20 * MINUTE),
      battement_le: ilYa(30_000),
    });

    const avant = { ...faux.parId(ligne.id) };
    const apres = await avancerTravail(clientFaux(faux), ligne.id, { battement: true });

    assert.equal(faux.ecritures.length, 1);
    assert.deepEqual(Object.keys(faux.ecritures[0].valeurs), ['battement_le']);
    assert.deepEqual(faux.ecritures[0].ids, [ligne.id]);

    assert.equal(apres.traites, avant.traites);
    assert.equal(apres.total, avant.total);
    assert.equal(apres.erreurs, avant.erreurs);
    assert.equal(apres.statut, avant.statut);
    assert.equal(apres.cree_le, avant.cree_le);
    assert.notEqual(apres.battement_le, avant.battement_le);
    assert.ok(Date.parse(apres.maj_le) >= Date.parse(avant.maj_le));
  });

  test('les compteurs fournis sont écrits, les autres champs intacts', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-compteurs',
      statut: 'en_cours',
      traites: 0,
      total: 100,
      erreurs: 0,
      battement_le: ilYa(30_000),
    });
    const battementAvant = faux.parId(ligne.id).battement_le;

    const apres = await avancerTravail(clientFaux(faux), ligne.id, {
      traites: 40,
      erreurs: 2,
    });

    assert.deepEqual(Object.keys(faux.ecritures[0].valeurs).sort(), ['erreurs', 'traites']);
    assert.equal(apres.traites, 40);
    assert.equal(apres.erreurs, 2);
    assert.equal(apres.total, 100, 'total non fourni → non réécrit');
    assert.equal(apres.statut, 'en_cours');
    assert.equal(apres.battement_le, battementAvant);
  });

  test('sans aucun champ : aucune écriture, état renvoyé tel quel', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({ livre_id: 'livre-inchange', traites: 7, total: 9 });

    const avant = { ...faux.parId(ligne.id) };
    const apres = await avancerTravail(clientFaux(faux), ligne.id, {});

    assert.ok(faux.ecrituresVides);
    assert.deepEqual(apres, avant);
  });

  test('identifiant inconnu : erreur explicite, aucune écriture', async () => {
    const faux = new FauxSupabaseTravaux();
    await assert.rejects(
      () => avancerTravail(clientFaux(faux), 'travail-inexistant', { traites: 1 }),
      /Travail introuvable/
    );
  });

  test('clore un travail le sort définitivement de la file', async () => {
    const faux = new FauxSupabaseTravaux();
    const ligne = faux.inserer({
      livre_id: 'livre-clos',
      statut: 'en_cours',
      battement_le: null,
    });

    await avancerTravail(clientFaux(faux), ligne.id, {
      statut: 'termine',
      traites: 42,
      total: 42,
      erreurs: 0,
    });

    assert.equal(await prochainTravail(clientFaux(faux)), null);
    // Même très ancien, il ne revient jamais.
    faux.parId(ligne.id).cree_le = ilYa(24 * 60 * MINUTE);
    assert.equal(await prochainTravail(clientFaux(faux)), null);
  });
});

describe('outils de présentation', () => {
  test('progressionTravail borne à [0, 100] et gère total inconnu', () => {
    assert.deepEqual(progressionTravail({ traites: 0, total: 0 }), {
      pourcentage: 0,
      restants: 0,
    });
    assert.deepEqual(progressionTravail({ traites: 50, total: 200 }), {
      pourcentage: 25,
      restants: 150,
    });
    assert.deepEqual(progressionTravail({ traites: 500, total: 200 }), {
      pourcentage: 100,
      restants: 0,
    });
  });

  test('estTravailActif distingue vivant et clos', () => {
    assert.equal(estTravailActif('en_attente'), true);
    assert.equal(estTravailActif('en_cours'), true);
    assert.equal(estTravailActif('termine'), false);
    assert.equal(estTravailActif('erreur'), false);
    assert.equal(estTravailActif('annule'), false);
  });

  test('assainirTravail refuse une ligne sans identité', () => {
    assert.equal(assainirTravail(null), null);
    assert.equal(assainirTravail({ livre_id: 'l', proprietaire_id: 'p' }), null);
    assert.equal(assainirTravail({ id: 'i', livre_id: 'l', proprietaire_id: 'p' })?.statut,
      'en_attente');
  });
});
