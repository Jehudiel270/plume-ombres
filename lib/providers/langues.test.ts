// ============================================================
// lib/providers/langues.test.ts — Catalogue de langues (vague 7).
// Lancement : npx tsx --test lib/providers/langues.test.ts
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUES,
  CODES_LANGUES,
  LANGUES_MOTEUR_PRIVE,
  langueConnue,
  libelleLangue,
  servieParMoteurPrive,
} from '@/lib/types';

test('catalogue étendu : au moins 60 langues, libellés uniques et non vides', () => {
  const codes = CODES_LANGUES;
  assert.ok(codes.length >= 60, `seulement ${codes.length} langues`);
  assert.equal(new Set(codes).size, codes.length, 'codes en double');
  for (const c of codes) {
    const libelle = LANGUES[c];
    assert.equal(typeof libelle, 'string');
    assert.ok(libelle.trim().length > 0, `libellé vide pour ${c}`);
  }
});

test('les défauts du produit sont en tête de liste', () => {
  assert.equal(CODES_LANGUES[0], 'fr');
  assert.equal(CODES_LANGUES[1], 'en');
  assert.equal(LANGUES.fr, 'Français');
  assert.equal(LANGUES.en, 'Anglais');
});

test('les langues africaines du marché sont présentes', () => {
  for (const code of ['sw', 'ha', 'yo', 'ig', 'am', 'wo', 'bm', 'ff', 'ln', 'rw', 'zu']) {
    assert.ok(langueConnue(code), `langue africaine manquante : ${code}`);
  }
});

test('langueConnue / libelleLangue : repli sûr sur le code', () => {
  assert.equal(langueConnue('fr'), true);
  assert.equal(langueConnue('sw'), true);
  assert.equal(langueConnue('xx'), false);
  assert.equal(langueConnue(null), false);
  assert.equal(libelleLangue('sw'), 'Swahili');
  assert.equal(libelleLangue('xx'), 'XX', 'un code inconnu ne doit pas rendre undefined');
  assert.equal(libelleLangue(null), '');
});

test('moteur privé : la couverture est un sous-ensemble du catalogue', () => {
  for (const c of LANGUES_MOTEUR_PRIVE) {
    assert.ok(langueConnue(c), `${c} hors catalogue`);
  }
  assert.equal(servieParMoteurPrive('fr'), true);
  assert.equal(servieParMoteurPrive('es'), true);
  assert.equal(servieParMoteurPrive('sw'), false, 'sw est servi par repli, pas en privé');
  assert.equal(servieParMoteurPrive('xx'), false);
});
