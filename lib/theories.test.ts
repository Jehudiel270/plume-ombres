// ============================================================
// lib/theories.test.ts — Preuves des helpers des théories (F8) et
// du comparateur (F19).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_ETIQUETTES,
  analyserEtiquettes,
  estStatut,
  libelleStatut,
  normaliserTerme,
} from './theories';

test('les étiquettes sont nettoyées, bornées à cinq', () => {
  assert.deepEqual(analyserEtiquettes(' lucan , archives ,  '), ['lucan', 'archives']);
  assert.deepEqual(
    analyserEtiquettes('a,b,c,d,e,f,g'),
    ['a', 'b', 'c', 'd', 'e']
  );
  assert.equal(analyserEtiquettes('').length, 0);
  // Une étiquette trop longue est tronquée, pas rejetée.
  assert.equal(analyserEtiquettes(`${'x'.repeat(100)},ok`)[0].length, 40);
  assert.ok(MAX_ETIQUETTES >= 1);
});

test('les statuts sont fermés et libellés en français', () => {
  assert.equal(estStatut('ouverte'), true);
  assert.equal(estStatut('confirmee'), true);
  assert.equal(estStatut('infirmee'), true);
  assert.equal(estStatut('gagnée'), false);
  assert.equal(estStatut(null), false);
  assert.equal(libelleStatut('ouverte'), 'Ouverte');
  assert.equal(libelleStatut('confirmee'), 'Confirmée');
  assert.equal(libelleStatut('infirmee'), 'Infirmée');
});

test('le terme du comparateur est normalisé et borné', () => {
  assert.equal(normaliserTerme('  Kaelen  '), 'Kaelen');
  assert.equal(normaliserTerme('a'), null);
  assert.equal(normaliserTerme(''), null);
  assert.equal((normaliserTerme('x'.repeat(200)) ?? '').length, 80);
});
