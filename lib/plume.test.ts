// ============================================================
// lib/plume.test.ts — Preuves de la plume évolutive et des
// familiers (A17) : une apparence par rang, déblocage cumulatif.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPARENCES_PLUME,
  apparencePourNiveau,
  familierParCode,
  familiersDebloques,
} from './plume';
import { RANGS } from './xp';

test('une apparence par rang, alignée sur les douze rangs', () => {
  assert.equal(RANGS.length, 12);
  assert.equal(APPARENCES_PLUME.length, 12);
  RANGS.forEach((rang, i) => {
    const apparence = apparencePourNiveau(rang.niveau);
    assert.equal(apparence.niveau, rang.niveau);
    assert.equal(apparence.nom, rang.nom);
    assert.match(APPARENCES_PLUME[i].du, /^#[0-9a-f]{6}$/i);
    assert.match(APPARENCES_PLUME[i].vers, /^#[0-9a-f]{6}$/i);
  });
});

test('niveaux hors intervalle bornés', () => {
  assert.equal(apparencePourNiveau(0).niveau, 1);
  assert.equal(apparencePourNiveau(-4).niveau, 1);
  assert.equal(apparencePourNiveau(99).niveau, 12);
  assert.equal(apparencePourNiveau(2.7).niveau, 3);
});

test('familiers débloqués par rang, rien ne se perd', () => {
  assert.equal(familiersDebloques(1).length, 1);
  assert.equal(familiersDebloques(4).length, 2);
  assert.equal(familiersDebloques(12).length, 6);
  const codes = familiersDebloques(12).map((f) => f.code);
  assert.ok(codes.includes('ombre'));
  // Cumulatif : tout débloqué au rang 12 l'était déjà au rang 9.
  assert.ok(
    familiersDebloques(9).every((f) => codes.includes(f.code))
  );
});

test('familier retrouvé par code', () => {
  assert.equal(familierParCode('chat')?.nom, 'Chat des rayons');
  assert.equal(familierParCode('dragon'), undefined);
});
