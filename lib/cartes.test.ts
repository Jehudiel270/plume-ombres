// ============================================================
// lib/cartes.test.ts — Preuves des cartes (F13) : plafond strict,
// échappement SVG, découpe de lignes, attribution présente.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_EXTRAIT_CARTE,
  carteSvg,
  echapperSvg,
  extraitPourCarte,
  lignesPourSvg,
} from './cartes';

test('l’extrait est plafonné strictement à 280 caractères', () => {
  const court = 'La brume gardait le val.';
  assert.equal(extraitPourCarte(court), court);
  const long = 'mot '.repeat(200);
  const sorti = extraitPourCarte(long);
  assert.ok(sorti.length <= MAX_EXTRAIT_CARTE);
  assert.ok(sorti.endsWith('…'));
  // Coupe de préférence sur une frontière de mot (pas de mot tronqué).
  assert.ok(sorti.endsWith('mot…'));
});

test('les caractères sensibles du SVG sont échappés', () => {
  assert.equal(echapperSvg(`l'ombre & <la> "brume"`), 'l&#39;ombre &amp; &lt;la&gt; &quot;brume&quot;');
});

test('la découpe en lignes respecte la largeur et le plafond', () => {
  const lignes = lignesPourSvg('mot '.repeat(60), 34);
  assert.ok(lignes.length <= 10);
  for (const l of lignes) assert.ok(l.length <= 36);
  assert.deepEqual(lignesPourSvg(''), []);
});

test('la carte porte l’extrait plafonné, la référence et l’attribution', () => {
  const svg = carteSvg({
    extrait: 'La brume gardait le val, et personne ne parlait du seuil.',
    titreLivre: 'Couronne de brume',
    chapitre: 'Chapitre 3 — Le val',
  });
  assert.ok(svg.includes('La brume gardait le val'));
  assert.ok(svg.includes('Couronne de brume — Chapitre 3 — Le val'));
  assert.ok(svg.includes('PLUME D' + "'"));
  assert.ok(svg.includes('usage privé'));
  assert.ok(svg.includes('<svg'));
});
