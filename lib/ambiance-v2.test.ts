// ============================================================
// lib/ambiance-v2.test.ts — Preuves de la fiche d'ambiance RICHE
// (F5 v2) : palette nommée, playlist, textes plafonnés, lignes de
// promesses, score de recommandation, libellés de rythme.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dureePlaylist,
  estHexCouleur,
  ficheVide,
  libelleRythme,
  lignesListe,
  nettoyerPalette,
  nettoyerPlaylist,
  propreTexteRiche,
  scoreRecommandation,
} from './ambiance';

// ---------- Palette ----------

test('estHexCouleur : #rrggbb seulement', () => {
  assert.equal(estHexCouleur('#3b3236'), true);
  assert.equal(estHexCouleur('#D9C3A0'), true);
  assert.equal(estHexCouleur('3b3236'), false);
  assert.equal(estHexCouleur('#3b32'), false);
  assert.equal(estHexCouleur('cendre'), false);
});

test('nettoyerPalette : 5 couleurs nommées max, entrées invalides ignorées', () => {
  const palette = nettoyerPalette([
    { nom: 'Cendre', hex: '#3b3236' },
    { nom: 'Cire rouge', hex: '#9E1B32' },
    { nom: '', hex: '#14101a' }, // sans nom → ignorée
    { nom: 'Sans hex', hex: 'rouge' }, // hex invalide → ignorée
    { nom: 'Encre', hex: '#14101a' },
    { nom: 'Parchemin', hex: '#d9c3a0' },
    { nom: 'Or terni', hex: '#a98a4a' },
    { nom: 'Sixième', hex: '#ffffff' }, // au-delà de 5 → ignorée
  ]);
  assert.equal(palette.length, 5);
  assert.equal(palette[0].nom, 'Cendre');
  assert.equal(palette[1].hex, '#9e1b32'); // normalisé minuscule
  assert.deepEqual(nettoyerPalette('pas une liste'), []);
  assert.deepEqual(nettoyerPalette([null, 3]), []);
});

// ---------- Playlist ----------

test('nettoyerPlaylist : titre requis, minutes bornées 1 → 30, max 8', () => {
  const pistes = nettoyerPlaylist([
    { titre: 'Cire et chandelles', humeur: 'Cordes graves', minutes: 4 },
    { titre: '', humeur: 'sans titre → ignorée', minutes: 3 },
    { titre: 'Page arrachée', humeur: '', minutes: 99 },
    { titre: 'Les cloches de minuit', humeur: 'Orgue lointain', minutes: 0 },
    { titre: 'Sans minutes', humeur: 'défaut', minutes: undefined },
  ]);
  assert.equal(pistes.length, 4);
  assert.equal(pistes[1].minutes, 30); // plafonné
  assert.equal(pistes[2].minutes, 1); // plancher
  assert.equal(pistes[3].minutes, 3); // défaut
  const tropLongue = nettoyerPlaylist(
    Array.from({ length: 12 }, (_, i) => ({ titre: `p${i}`, humeur: '', minutes: 2 }))
  );
  assert.equal(tropLongue.length, 8);
});

test('dureePlaylist : total des minutes', () => {
  assert.equal(
    dureePlaylist([
      { titre: 'a', humeur: '', minutes: 4 },
      { titre: 'b', humeur: '', minutes: 3 },
    ]),
    7
  );
  assert.equal(dureePlaylist([]), 0);
});

// ---------- Textes plafonnés ----------

test('propreTexteRiche : trim, espaces réduits, null si vide', () => {
  assert.equal(propreTexteRiche('  Sombre,   élégant  ', 120), 'Sombre, élégant');
  assert.equal(propreTexteRiche('   ', 120), null);
  assert.equal(propreTexteRiche(undefined, 120), null);
  const plafonne = propreTexteRiche('x'.repeat(200), 80);
  assert.ok(plafonne !== null);
  assert.equal(plafonne.length, 80);
});

test('lignesListe : une promesse par ligne, plafonnée', () => {
  assert.deepEqual(
    lignesListe('  Une lente montée de tension \nDes intrigues de palais\n\n', 6),
    ['Une lente montée de tension', 'Des intrigues de palais']
  );
  assert.deepEqual(lignesListe(null, 6), []);
});

// ---------- Recommandations ----------

test('scoreRecommandation : genres ×2 + tropes ×1, zéro si rien', () => {
  const source = { genres: ['Gothique'], tropes: ['Château hanté'] };
  const proche = { genres: ['Gothique', 'Mystère'], tropes: ['Château hanté', 'Famille'] };
  const r = scoreRecommandation(source, proche);
  assert.equal(r.score, 3); // 1 genre ×2 + 1 trope
  assert.deepEqual(r.genres, ['Gothique']);
  assert.deepEqual(r.tropes, ['Château hanté']);
  assert.equal(scoreRecommandation(source, { genres: ['SF'], tropes: ['Espace'] }).score, 0);
});

// ---------- Rythme ----------

test('libelleRythme : libellés du cahier, borné 1 → 5', () => {
  assert.equal(libelleRythme(1), 'Très posé');
  assert.equal(libelleRythme(3), 'Mesuré');
  assert.equal(libelleRythme(5), 'Très rapide');
  assert.equal(libelleRythme(9), 'Très rapide');
  assert.equal(libelleRythme(0), '');
});

// ---------- Fiche vide ----------

test('ficheVide : socle posé, richesse neutre', () => {
  const fiche = ficheVide('livre-1');
  assert.equal(fiche.livre_id, 'livre-1');
  assert.equal(fiche.intensite, 3);
  assert.deepEqual(fiche.palette, []);
  assert.deepEqual(fiche.playlist, []);
  assert.equal(fiche.atmosphere, null);
  assert.deepEqual(fiche.motsCles, []);
});
