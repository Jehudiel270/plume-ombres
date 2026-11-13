// ============================================================
// lib/defis.test.ts — Preuves des défis de lecture (F14) :
// bornes, progression calculée, états non punitifs.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  borneCible,
  dateSeule,
  etatDefi,
  joursDistincts,
  progressionDefi,
  propreTitre,
  type Defi,
} from './defis';

const defi = (partiel: Partial<Defi> = {}): Defi => ({
  id: 'd1',
  titre: 'Vingt chapitres ce mois',
  genre: 'chapitres',
  cible: 20,
  livreId: null,
  echeance: null,
  termineLe: null,
  creeLe: '2026-11-01',
  ...partiel,
});

test('bornes de la cible saisie', () => {
  assert.equal(borneCible(10), 10);
  assert.equal(borneCible('7'), 7);
  assert.equal(borneCible(0), null);
  assert.equal(borneCible(1001), null);
  assert.equal(borneCible('beaucoup'), null);
  assert.equal(borneCible(12.4), 12);
});

test('titres nettoyés et plafonnés', () => {
  assert.equal(propreTitre('  lire   la nuit  '), 'lire la nuit');
  assert.equal(propreTitre(42), '');
  assert.equal(propreTitre('x'.repeat(300)).length, 120);
});

test('date seule ISO stricte', () => {
  assert.equal(dateSeule('2026-11-30'), '2026-11-30');
  assert.equal(dateSeule('30/11/2026'), null);
  assert.equal(dateSeule(''), null);
  assert.equal(dateSeule('2026-13-40'), null);
});

test('progression calculée, plafonnée à la cible', () => {
  const d = defi();
  assert.equal(progressionDefi(d, { chapitres: 7, livres: 0, jours: 0 }), 7);
  assert.equal(progressionDefi(d, { chapitres: 45, livres: 0, jours: 0 }), 20);
  assert.equal(
    progressionDefi(defi({ genre: 'jours', cible: 5 }), {
      chapitres: 0,
      livres: 0,
      jours: 3,
    }),
    3
  );
});

test('états : en cours, atteint, au repos — jamais punitif', () => {
  const d = defi({ echeance: '2026-11-10' });
  assert.equal(
    etatDefi(d, { chapitres: 4, livres: 0, jours: 0 }, '2026-11-05').etat,
    'en_cours'
  );
  assert.equal(
    etatDefi(d, { chapitres: 20, livres: 0, jours: 0 }, '2026-11-20').etat,
    'atteint'
  );
  const auRepos = etatDefi(d, { chapitres: 4, livres: 0, jours: 0 }, '2026-11-20');
  assert.equal(auRepos.etat, 'au_repos');
  assert.equal(auRepos.valeur, 4);
  // Une échéance passée ne retire RIEN : la valeur reste positive.
  assert.ok(auRepos.valeur > 0);
});

test('jours de lecture distincts', () => {
  assert.equal(
    joursDistincts([
      '2026-11-10T21:00:00Z',
      '2026-11-10T23:30:00Z',
      '2026-11-11T08:00:00Z',
      'nonsense',
    ]),
    2
  );
  assert.equal(joursDistincts([]), 0);
});
