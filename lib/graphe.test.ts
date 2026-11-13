// ============================================================
// lib/graphe.test.ts — Preuves du filtrage ANTI-SPOILERS (F25) et
// du layout circulaire.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estRole,
  filtrerGraphe,
  libelleRole,
  positionsCercle,
  type AreteGraphe,
  type NoeudGraphe,
} from './graphe';

const noeud = (id: string, premierePosition: number | null): NoeudGraphe => ({
  id,
  nom: id,
  role: 'secondaire',
  description: null,
  premierePosition,
});

const arete = (
  id: string,
  origineId: string,
  destinationId: string,
  premierePosition: number | null
): AreteGraphe => ({
  id,
  origineId,
  destinationId,
  libelle: 'lié à',
  premierePosition,
});

test('le filtrage ne révèle que ce qui est couvert par la lecture', () => {
  const noeuds = [noeud('a', null), noeud('b', 1), noeud('c', 5), noeud('d', 9)];
  const aretes = [arete('r1', 'a', 'b', 2), arete('r2', 'a', 'c', 6)];

  // Jusqu'au chapitre 5 : a, b, c visibles ; d et r2 cachés.
  const jusqu5 = filtrerGraphe(noeuds, aretes, 5);
  assert.deepEqual(jusqu5.noeuds.map((n) => n.id).sort(), ['a', 'b', 'c']);
  assert.deepEqual(jusqu5.aretes.map((a) => a.id), ['r1']);
  assert.equal(jusqu5.masquees, 2);

  // Rien lu : seulement ce qui est présent dès le début (null).
  const rien = filtrerGraphe(noeuds, aretes, null);
  assert.deepEqual(rien.noeuds.map((n) => n.id), ['a']);
  assert.deepEqual(rien.aretes, []);
});

test('une arête ne peut pas révéler un personnage non couvert', () => {
  // r3 relie a (début) et d (chapitre 9) : tant que d est caché,
  // l'arête est cachée, même si sa propre apparition est tôt.
  const aretes = [arete('r3', 'a', 'd', null)];
  const jusqu5 = filtrerGraphe([noeud('a', null), noeud('d', 9)], aretes, 5);
  assert.deepEqual(jusqu5.aretes, []);
  const toutLu = filtrerGraphe([noeud('a', null), noeud('d', 9)], aretes, 9);
  assert.deepEqual(toutLu.aretes.map((a) => a.id), ['r3']);
});

test('le nombre de masqués compte nœuds ET arêtes', () => {
  const filtre = filtrerGraphe(
    [noeud('a', null), noeud('b', 3)],
    [arete('r1', 'a', 'b', 3)],
    null
  );
  // b caché + r1 cachée (b non couvert) = 2.
  assert.equal(filtre.masquees, 2);
});

test('rôles fermés et libellés français', () => {
  assert.equal(estRole('protagoniste'), true);
  assert.equal(estRole('méchant'), false);
  assert.equal(libelleRole('allie'), 'Allié');
  assert.equal(libelleRole('secondaire'), 'Secondaire');
});

test('le cercle répartit uniformément (et gère 0, 1, 2)', () => {
  assert.deepEqual(positionsCercle(0), []);
  assert.deepEqual(positionsCercle(1), [{ x: 0, y: 0 }]);
  const deux = positionsCercle(2);
  assert.equal(deux.length, 2);
  // Points opposés sur le cercle unité.
  assert.ok(Math.abs(deux[0].x + deux[1].x) < 1e-9);
  assert.ok(Math.abs(deux[0].y + deux[1].y) < 1e-9);
  const cinq = positionsCercle(5);
  for (const p of cinq) {
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-9);
  }
});
