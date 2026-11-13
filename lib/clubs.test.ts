// ============================================================
// lib/clubs.test.ts — Preuves des clubs privés (F11) : code
// d'invitation lisible, plafond anti-spoilers, bornes propres.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bornePosition,
  codeInvitation,
  estCodeValide,
  libellePlafond,
  MAX_MESSAGE,
  messageVisiblePour,
  propreMessage,
  propreTexte,
} from './clubs';

test('code d’invitation : 8 caractères lisibles, sans ambiguïté', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = codeInvitation();
    assert.match(code, /^[A-Z2-9]{8}$/);
    assert.doesNotMatch(code, /[0O1IL]/);
  }
});

test('code déterministe avec un aléatoire injecté', () => {
  assert.equal(codeInvitation(() => 0), 'AAAAAAAA');
  assert.equal(codeInvitation(() => 0.999), '99999999');
});

test('validation d’un code saisi', () => {
  assert.equal(estCodeValide('AB23CD56'), true);
  assert.equal(estCodeValide('ab23cd56'), false);
  assert.equal(estCodeValide('AB23CD5'), false);
  assert.equal(estCodeValide('AB23CD5O'), false);
  assert.equal(estCodeValide(42), false);
});

test('plafond anti-spoilers : rien au-delà de la lecture', () => {
  assert.equal(messageVisiblePour(0, 0), true); // hors intrigue
  assert.equal(messageVisiblePour(12, 5), false); // chapitre 12, lu 5
  assert.equal(messageVisiblePour(12, 12), true);
  assert.equal(messageVisiblePour(12, 40), true);
  assert.equal(messageVisiblePour(-3, 0), true); // borne : hors intrigue
});

test('libellé du plafond', () => {
  assert.equal(libellePlafond(0), 'Hors intrigue');
  assert.equal(libellePlafond(7), 'Jusqu’au chapitre 7');
});

test('messages et textes nettoyés, plafonnés', () => {
  const long = 'a'.repeat(MAX_MESSAGE + 50);
  assert.equal(propreMessage('  bonjour   \n tout le monde '), 'bonjour\n tout le monde');
  assert.equal(propreMessage(long).length, MAX_MESSAGE);
  assert.equal(propreTexte('  club   du soir  ', 120), 'club du soir');
  assert.equal(propreTexte(null, 120), '');
});

test('position de lecture déclarée, bornée', () => {
  assert.equal(bornePosition(12), 12);
  assert.equal(bornePosition(-5), 0);
  assert.equal(bornePosition('9'), 9);
  assert.equal(bornePosition(9999), 2000);
});
