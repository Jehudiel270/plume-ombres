// ============================================================
// lib/lecture-vocale.test.ts — Découpage de lecture et choix de voix
// (F9). Logique pure : la synthèse navigateur n'est pas testée ici.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITE_ENONCE,
  decouperPourLecture,
  choisirVoix,
  voixTriees,
  normaliserVitesse,
  estVitesse,
} from './lecture-vocale';

test('le texte devient des segments de lecture, séparateurs de scène exclus', () => {
  const texte = [
    'Premier paragraphe.',
    '',
    '* * *',
    '',
    'Deuxième paragraphe.',
  ].join('\n');
  const segments = decouperPourLecture(texte);
  assert.deepEqual(segments, ['Premier paragraphe.', 'Deuxième paragraphe.']);
});

test('un paragraphe long est découpé aux phrases, sans dépasser la limite', () => {
  const phrase = 'Voici une phrase assez longue pour construire un paragraphe. ';
  const texte = phrase.repeat(200); // ≈ 12 000 caractères
  const segments = decouperPourLecture(texte);
  assert.ok(segments.length > 1, 'un long paragraphe doit être découpé');
  for (const segment of segments) {
    assert.ok(
      segment.length <= LIMITE_ENONCE,
      `segment trop long : ${segment.length}`
    );
  }
  // Rien ne se perd (hors blancs rognés).
  assert.equal(
    segments.join(' ').replace(/\s+/g, ' ').trim(),
    texte.replace(/\s+/g, ' ').trim()
  );
});

test('un paragraphe sans ponctuation est découpé de force à la limite', () => {
  const texte = 'a'.repeat(LIMITE_ENONCE + 3_000);
  const segments = decouperPourLecture(texte);
  assert.ok(segments.length === 2);
  for (const segment of segments) assert.ok(segment.length <= LIMITE_ENONCE);
});

test('texte vide ou blancs : aucun segment', () => {
  assert.deepEqual(decouperPourLecture(''), []);
  assert.deepEqual(decouperPourLecture('   \n\n  * * *  \n\n '), []);
});

test('choisirVoix : française d’abord, puis préférée, puis défaut', () => {
  const voix = [
    { name: 'Google US English', lang: 'en-US', default: true },
    { name: 'Thomas', lang: 'fr_FR' },
    { name: 'Amélie', lang: 'fr-CA' },
    { name: 'Marie', lang: 'fr-FR' },
  ];
  // fr-FR avant les autres françaises (ordre du navigateur conservé :
  // la première fr-fr de la liste gagne).
  assert.equal(choisirVoix(voix, null)?.name, 'Thomas');
  // La voix préférée gagne si elle existe encore.
  assert.equal(choisirVoix(voix, 'Amélie')?.name, 'Amélie');
  // Voix préférée disparue : retour au choix automatique.
  assert.equal(choisirVoix(voix, 'Voix disparue')?.name, 'Thomas');
  // Sans voix française : défaut du navigateur.
  const anglophones = [
    { name: 'A', lang: 'en-GB' },
    { name: 'B', lang: 'en-US', default: true },
  ];
  assert.equal(choisirVoix(anglophones, null)?.name, 'B');
  // Aucune voix du tout.
  assert.equal(choisirVoix([], null), null);
});

test('voixTriees : françaises d’abord, noms triés', () => {
  const trie = voixTriees([
    { name: 'Zed', lang: 'en-US' },
    { name: 'Zoé', lang: 'fr-BE' },
    { name: 'Alain', lang: 'fr_FR' },
    { name: 'Marie', lang: 'fr-FR' },
  ]);
  assert.deepEqual(
    trie.map((v) => v.name),
    ['Alain', 'Marie', 'Zoé', 'Zed']
  );
  assert.ok(voixTriees([], 30).length === 0);
  // La borne max est respectée.
  const beaucoup = Array.from({ length: 50 }, (_, i) => ({
    name: `Voix ${i}`,
    lang: 'en-US',
  }));
  assert.equal(voixTriees(beaucoup, 30).length, 30);
});

test('vitesses : normalisation prudente', () => {
  assert.equal(normaliserVitesse(1.25), 1.25);
  assert.equal(normaliserVitesse(7), 1);
  assert.equal(normaliserVitesse('rapide'), 1);
  assert.equal(estVitesse(0.75), true);
  assert.equal(estVitesse(0.5), false);
});
