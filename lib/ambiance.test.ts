// ============================================================
// lib/ambiance.test.ts — Preuves des fiches d'ambiance (F5).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_GENRES,
  MAX_TROPES,
  analyserListe,
  estIntensite,
  libelleIntensite,
} from './ambiance';

test('l’intensité est fermée et libellée en français', () => {
  assert.equal(estIntensite(1), true);
  assert.equal(estIntensite(5), true);
  assert.equal(estIntensite(0), false);
  assert.equal(estIntensite(6), false);
  assert.equal(estIntensite(2.5), false);
  assert.equal(libelleIntensite(1), 'Discret');
  assert.equal(libelleIntensite(5), 'Très sombre');
});

test('les listes sont nettoyées et plafonnées', () => {
  assert.deepEqual(
    analyserListe(' gothique , ennemis à amants ,  ', MAX_GENRES),
    ['gothique', 'ennemis à amants']
  );
  assert.equal(analyserListe('a,b,c,d,e,f,g', MAX_GENRES).length, MAX_GENRES);
  assert.equal(analyserListe('x'.repeat(100), MAX_TROPES)[0].length, 40);
  assert.equal(analyserListe('', MAX_TROPES).length, 0);
});
