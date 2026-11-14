// ============================================================
// lib/clubs-v4.test.ts — Preuves du chantier « discussion complète »
// (F11 v4) : rôles, programme par étapes (4 chapitres/semaine),
// plafond croisé, sondages, rencontres, signalements.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAPITRES_PAR_ETAPE,
  estModeRencontre,
  estMotifValide,
  estRoleClub,
  estStaff,
  genererEtapes,
  libelleRole,
  nettoyerOptionsSondage,
  plafondEffectif,
  propreMotif,
  sondageOuvert,
} from './clubs';

// ---------- Rôles ----------

test('estRoleClub n’accepte que les trois rôles posés', () => {
  assert.equal(estRoleClub('admin'), true);
  assert.equal(estRoleClub('moderateur'), true);
  assert.equal(estRoleClub('membre'), true);
  assert.equal(estRoleClub('superadmin'), false);
  assert.equal(estRoleClub(null), false);
  assert.equal(estRoleClub(42), false);
});

test('estStaff : admin et moderateur oui, membre non', () => {
  assert.equal(estStaff('admin'), true);
  assert.equal(estStaff('moderateur'), true);
  assert.equal(estStaff('membre'), false);
});

test('libelleRole : libellés humains, sans jargon', () => {
  assert.equal(libelleRole('admin'), 'Administrateur');
  assert.equal(libelleRole('moderateur'), 'Modérateur');
  assert.equal(libelleRole('membre'), 'Membre');
});

// ---------- Programme par étapes ----------

test('genererEtapes : 4 chapitres par semaine, du début à la fin', () => {
  const programme = genererEtapes(24);
  assert.equal(programme.length, 6);
  assert.equal(CHAPITRES_PAR_ETAPE, 4);
  assert.deepEqual(
    programme.map((e) => [e.chapitreDe, e.chapitreA]),
    [
      [1, 4],
      [5, 8],
      [9, 12],
      [13, 16],
      [17, 20],
      [21, 24],
    ]
  );
  assert.equal(programme[0].numero, 1);
  assert.equal(programme[5].numero, 6);
});

test('genererEtapes : dernier lot incomplet couvert, focus en cycle', () => {
  const programme = genererEtapes(26);
  assert.equal(programme.length, 7);
  assert.equal(programme[6].chapitreDe, 25);
  assert.equal(programme[6].chapitreA, 26);
  // Le focus revient au début du cycle à la 11e étape.
  const onze = genererEtapes(44);
  assert.equal(onze.length, 11);
  assert.equal(onze[10].focus, onze[0].focus);
});

test('genererEtapes : bornes défendues (0 chapitre, taille absurde)', () => {
  assert.equal(genererEtapes(0).length, 1);
  assert.equal(genererEtapes(-5).length, 1);
  assert.equal(genererEtapes(24, 0).length, 6); // retombe à 4/semaine
  assert.equal(genererEtapes(24, -2).length, 6);
});

test('plafondEffectif : sans programme, la position seule décide', () => {
  assert.equal(plafondEffectif(15, null), 15);
});

test('plafondEffectif : avec programme, le plus petit des deux', () => {
  // Le groupe est allé plus loin que moi : MA lecture plafonne.
  assert.equal(plafondEffectif(9, 16), 9);
  // J'ai lu plus loin que l'étape ouverte : le rythme du groupe
  // plafonne la discussion commune.
  assert.equal(plafondEffectif(30, 16), 16);
  assert.equal(plafondEffectif(0, 16), 0);
});

// ---------- Sondages ----------

test('nettoyerOptionsSondage : bornée, sans vide ni doublon, max 4', () => {
  assert.deepEqual(
    nettoyerOptionsSondage(['  Appel vocal ', 'Salon écrit', '', 'Appel vocal', 'Les deux', '5e']),
    ['Appel vocal', 'Salon écrit', 'Les deux', '5e']
  );
  // Cinquième option : ignorée (plafond du cahier).
  assert.equal(
    nettoyerOptionsSondage(['a', 'b', 'c', 'd', 'e']).length,
    4
  );
  assert.deepEqual(nettoyerOptionsSondage('pas une liste'), []);
  assert.deepEqual(nettoyerOptionsSondage([42, null]), []);
});

test('sondageOuvert : ouvert avant la clôture, clos après', () => {
  const maintenant = Date.now();
  assert.equal(sondageOuvert(new Date(maintenant + 86_400_000).toISOString(), maintenant), true);
  assert.equal(sondageOuvert(new Date(maintenant - 1000).toISOString(), maintenant), false);
  assert.equal(sondageOuvert('pas une date', maintenant), false);
});

// ---------- Rencontres ----------

test('estModeRencontre : en ligne et salon écrit, rien d’autre', () => {
  assert.equal(estModeRencontre('en ligne'), true);
  assert.equal(estModeRencontre('salon écrit'), true);
  assert.equal(estModeRencontre('appel vidéo'), false);
  assert.equal(estModeRencontre(undefined), false);
});

// ---------- Signalements ----------

test('estMotifValide : motifs de la liste seulement', () => {
  assert.equal(estMotifValide('Spoiler non signalé'), true);
  assert.equal(estMotifValide('Autre'), true);
  assert.equal(estMotifValide('Je n’aime pas cet auteur'), false);
  assert.equal(estMotifValide(3), false);
});

test('propreMotif : trims, plafonné, jamais de contenu vide', () => {
  assert.equal(propreMotif('  Message répété  '), 'Message répété');
  assert.equal(propreMotif('x'.repeat(400)).length, 200);
  assert.equal(propreMotif(123), '');
});
