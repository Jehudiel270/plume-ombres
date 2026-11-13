// ============================================================
// lib/xp.test.ts — Preuves de la progression (A17) : rangs, jauge,
// badges (non punitifs, exclusifs cosmétiques).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BADGES,
  RANGS,
  XP_PAR_CHAPITRE,
  badgesPour,
  progressionRang,
  rangDepuisXp,
} from './xp';

test('l’XP ne baisse jamais : rangs croissants et seuils croissants', () => {
  for (let i = 1; i < RANGS.length; i++) {
    assert.ok(RANGS[i].seuil > RANGS[i - 1].seuil);
    assert.equal(RANGS[i].niveau, RANGS[i - 1].niveau + 1);
  }
  assert.ok(XP_PAR_CHAPITRE >= 1);
});

test('le rang suit l’XP, de l’encre pâle au maître du seuil', () => {
  assert.equal(rangDepuisXp(0).niveau, 1);
  assert.equal(rangDepuisXp(74).niveau, 1);
  assert.equal(rangDepuisXp(75).niveau, 2);
  assert.equal(rangDepuisXp(6_500).niveau, 12);
  assert.equal(rangDepuisXp(1_000_000).niveau, 12);
  assert.equal(rangDepuisXp(-5).niveau, 1);
  assert.equal(rangDepuisXp(Number.NaN).niveau, 1);
});

test('la jauge est bornée entre 0 et 1', () => {
  assert.equal(progressionRang(0), 0);
  assert.ok(progressionRang(74) > 0 && progressionRang(74) < 1);
  assert.equal(progressionRang(6_500), 1);
  assert.equal(progressionRang(9_999), 1);
});

test('les badges obéissent aux compteurs, pas au hasard', () => {
  const codes = badgesPour({
    chapitres: 10,
    carnet: 1,
    theories: 0,
    personnages: 0,
    livresTraduits: 0,
    abonne: false,
  });
  assert.deepEqual(codes.sort(), ['nuit_blanche', 'premier_chapitre', 'premiere_note']);
});

test('le badge exclusif ne vient QUE du plan (cosmétique)', () => {
  const sans = badgesPour({ chapitres: 999, carnet: 999, theories: 9, personnages: 9, livresTraduits: 9, abonne: false });
  assert.ok(!sans.includes('scelle_par_le_seuil'));
  const avec = badgesPour({ chapitres: 0, carnet: 0, theories: 0, personnages: 0, livresTraduits: 0, abonne: true });
  assert.deepEqual(avec, ['scelle_par_le_seuil']);
});

test('la table des badges est fermée et documentée', () => {
  const codes = new Set(BADGES.map((b) => b.code));
  assert.equal(codes.size, BADGES.length);
  for (const b of BADGES) {
    assert.ok(b.nom.length >= 2);
    assert.ok(b.description.length >= 10);
  }
});
