// ============================================================
// lib/plages-texte.test.ts — Preuves de la fusion des plages du
// lecteur : couverture complète, primauté de la recherche, fusion
// des segments adjacents, bornage des plages hors texte.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fusionnerPlages,
  indiceSegment,
  trouverExtrait,
  type PlageSurlignage,
  type PlageTexte,
} from './plages-texte';

test('sans aucune plage, le texte entier est un seul segment', () => {
  const segments = fusionnerPlages(10, [], []);
  assert.deepEqual(segments, [{ type: 'texte', debut: 0, fin: 10 }]);
});

test('un texte vide ne produit aucun segment', () => {
  assert.deepEqual(fusionnerPlages(0, [{ debut: 0, fin: 5 }], []), []);
});

test('les occurrences de recherche découpent le texte', () => {
  const occ: PlageTexte[] = [
    { debut: 3, fin: 6 },
    { debut: 8, fin: 9 },
  ];
  const segments = fusionnerPlages(12, occ, []);
  assert.deepEqual(segments, [
    { type: 'texte', debut: 0, fin: 3 },
    { type: 'recherche', debut: 3, fin: 6, actif: false },
    { type: 'texte', debut: 6, fin: 8 },
    { type: 'recherche', debut: 8, fin: 9, actif: false },
    { type: 'texte', debut: 9, fin: 12 },
  ]);
});

test('l occurrence active est marquée, les autres non', () => {
  const occ: PlageTexte[] = [
    { debut: 0, fin: 2 },
    { debut: 5, fin: 7 },
  ];
  const segments = fusionnerPlages(9, occ, [], 1);
  const marques = segments.filter((s) => s.type === 'recherche');
  assert.deepEqual(
    marques.map((m) => (m as { actif: boolean }).actif),
    [false, true]
  );
});

test('la recherche prime sur le surlignage, qui est rogné autour', () => {
  const occ: PlageTexte[] = [{ debut: 4, fin: 6 }];
  const surl: PlageSurlignage[] = [{ debut: 2, fin: 8, id: 'a1' }];
  const segments = fusionnerPlages(10, occ, surl);
  assert.deepEqual(segments, [
    { type: 'texte', debut: 0, fin: 2 },
    { type: 'surlignage', debut: 2, fin: 4, id: 'a1' },
    { type: 'recherche', debut: 4, fin: 6, actif: false },
    { type: 'surlignage', debut: 6, fin: 8, id: 'a1' },
    { type: 'texte', debut: 8, fin: 10 },
  ]);
});

test('les segments adjacents de même nature sont fusionnés', () => {
  const occ: PlageTexte[] = [
    { debut: 1, fin: 3 },
    { debut: 3, fin: 5 },
  ];
  const segments = fusionnerPlages(6, occ, []);
  const marques = segments.filter((s) => s.type === 'recherche');
  assert.equal(marques.length, 1);
  assert.deepEqual(marques[0], { type: 'recherche', debut: 1, fin: 5, actif: false });
});

test('deux surlignages voisins mais distincts ne fusionnent pas', () => {
  const surl: PlageSurlignage[] = [
    { debut: 0, fin: 4, id: 'a' },
    { debut: 4, fin: 9, id: 'b' },
  ];
  const segments = fusionnerPlages(9, [], surl);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { type: 'surlignage', debut: 0, fin: 4, id: 'a' });
  assert.deepEqual(segments[1], { type: 'surlignage', debut: 4, fin: 9, id: 'b' });
});

test('les plages hors bornes sont rognées, les vides ignorées', () => {
  const occ: PlageTexte[] = [
    { debut: -5, fin: 3 },
    { debut: 7, fin: 7 },
    { debut: 90, fin: 120 },
  ];
  const segments = fusionnerPlages(10, occ, []);
  assert.deepEqual(segments, [
    { type: 'recherche', debut: 0, fin: 3, actif: false },
    { type: 'texte', debut: 3, fin: 10 },
  ]);
});

test('indiceSegment retrouve le premier segment couvrant un offset', () => {
  const occ: PlageTexte[] = [{ debut: 3, fin: 6 }];
  const segments = fusionnerPlages(10, occ, []);
  assert.equal(indiceSegment(segments, 0), 0);
  assert.equal(indiceSegment(segments, 2), 0);
  assert.equal(indiceSegment(segments, 3), 1);
  assert.equal(indiceSegment(segments, 5), 1);
  assert.equal(indiceSegment(segments, 6), 2);
  assert.equal(indiceSegment(segments, 99), 2);
});

test('surlignage sans identifiant est ignoré', () => {
  const surl = [{ debut: 0, fin: 4, id: '' }] as unknown as PlageSurlignage[];
  const segments = fusionnerPlages(6, [], surl);
  assert.deepEqual(segments, [{ type: 'texte', debut: 0, fin: 6 }]);
});

test('trouverExtrait retrouve un passage en ignorant les blancs', () => {
  const brut = 'La brume\n  gardait   le val.';
  assert.deepEqual(trouverExtrait(brut, 'La brume gardait le val.'), {
    debut: 0,
    fin: brut.length,
  });
  assert.deepEqual(trouverExtrait(brut, 'gardait le'), { debut: 11, fin: 23 });
  assert.equal(trouverExtrait(brut, 'passage absent'), null);
  assert.equal(trouverExtrait(brut, '   '), null);
});
