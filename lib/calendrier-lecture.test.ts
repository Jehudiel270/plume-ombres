// ============================================================
// lib/calendrier-lecture.test.ts — Preuves du calendrier de
// lecture (variante atelier) : agrégation mensuelle, série avec
// jours de repos, manipulation des mois.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregerMois,
  decalerMois,
  joursDansMois,
  libelleMois,
  serieActuelle,
} from './calendrier-lecture';

test('jours du mois, années bissextiles comprises', () => {
  assert.equal(joursDansMois('2026-11'), 30);
  assert.equal(joursDansMois('2026-02'), 28);
  assert.equal(joursDansMois('2024-02'), 29);
  assert.equal(joursDansMois('bizarre'), 30);
});

test('agrégation des chapitres par jour d’un mois', () => {
  const jours = aggregerMois('2026-11', [
    '2026-11-03T21:10:00Z',
    '2026-11-03T22:40:00Z',
    '2026-11-04T08:00:00Z',
    '2026-10-31T23:00:00Z', // autre mois : ignoré
    'nonsense',
  ]);
  assert.equal(jours.length, 30);
  assert.deepEqual(jours[2], { jour: '2026-11-03', chapitres: 2 });
  assert.deepEqual(jours[3], { jour: '2026-11-04', chapitres: 1 });
  assert.equal(jours[0].chapitres, 0);
});

test('série consécutive avec jours de repos, sans punition', () => {
  const lectures = [
    '2026-11-08T20:00:00Z',
    '2026-11-09T20:00:00Z',
    // 10 = jour de repos toléré
    '2026-11-11T20:00:00Z',
    '2026-11-12T20:00:00Z',
  ];
  assert.equal(serieActuelle(lectures, '2026-11-12', 1), 4);
  // Strict (0 repos) : la série casse au 10.
  assert.equal(serieActuelle(lectures, '2026-11-12', 0), 2);
  // Aujourd'hui non lu : la journée n'est pas finie, la série tient.
  assert.equal(serieActuelle(lectures, '2026-11-13', 1), 4);
  assert.equal(serieActuelle([], '2026-11-12', 1), 0);
});

test('manipulation des mois', () => {
  assert.equal(decalerMois('2026-11', -1), '2026-10');
  assert.equal(decalerMois('2026-01', -1), '2025-12');
  assert.equal(decalerMois('2025-12', 2), '2026-02');
  assert.equal(libelleMois('2026-11'), 'novembre 2026');
});
