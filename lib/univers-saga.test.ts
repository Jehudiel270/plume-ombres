// ============================================================
// lib/univers-saga.test.ts — Preuves de la vue SAGA d'un univers
// (agrégation inter-tomes, anti-spoilers, liens, évolutions).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import type { GrapheFiltre, NoeudGraphe } from './graphe';
import {
  agregerSaga,
  evenementsDuTome,
  normaliserNom,
  personnagesDuTome,
  type SagaTomeSource,
} from './univers-saga';

function noeud(
  id: string,
  nom: string,
  importance: 1 | 2 | 3 = 2,
  role: NoeudGraphe['role'] = 'secondaire'
): NoeudGraphe {
  return {
    id,
    nom,
    role,
    importance,
    description: null,
    premierePosition: null,
  };
}

function grapheVide(): GrapheFiltre {
  return { noeuds: [], aretes: [], evenements: [], masquees: 0 };
}

function tome(
  rang: number,
  graphe: GrapheFiltre,
  extras: Partial<SagaTomeSource> = {}
): SagaTomeSource {
  return {
    id: `livre-${rang}`,
    titre: `Tome ${rang}`,
    auteur: 'A. Autrice',
    rang,
    totalChapitres: 10,
    chapitresLus: 10,
    totalPersonnages: graphe.noeuds.length,
    graphe,
    ...extras,
  };
}

test('normaliserNom ignore la casse, les accents et les espaces multiples', () => {
  assert.equal(normaliserNom('  Morana  '), 'morana');
  assert.equal(normaliserNom('Éléonore De  Verne'), 'eleonore de verne');
  assert.equal(normaliserNom('ELEONORE DE VERNE'), 'eleonore de verne');
});

test('agregerSaga regroupe un même personnage entre deux tomes (nom normalisé)', () => {
  const tome1 = tome(1, {
    ...grapheVide(),
    noeuds: [noeud('p1', 'Morana', 3, 'protagoniste')],
  });
  const tome2 = tome(2, {
    ...grapheVide(),
    noeuds: [noeud('p2', 'MORANA', 2)],
  });
  const saga = agregerSaga([tome1, tome2]);
  assert.equal(saga.personnages.length, 1);
  assert.equal(saga.personnages[0]!.nom, 'Morana');
  assert.equal(saga.personnages[0]!.role, 'protagoniste');
  assert.equal(saga.personnages[0]!.importance, 3);
  assert.deepEqual(saga.personnages[0]!.tomes, [1, 2]);
});

test('agregerSaga calcule les personnages communs entre tomes adjacents uniquement', () => {
  const tome1 = tome(1, {
    ...grapheVide(),
    noeuds: [noeud('a', 'Aldéric'), noeud('m', 'Morana')],
  });
  const tome2 = tome(2, {
    ...grapheVide(),
    noeuds: [noeud('b', 'Aldéric'), noeud('l', 'Lucan')],
  });
  const tome3 = tome(3, {
    ...grapheVide(),
    noeuds: [noeud('l2', 'Lucan')],
  });
  const saga = agregerSaga([tome1, tome2, tome3]);
  assert.equal(saga.liens.length, 2);
  assert.deepEqual(saga.liens[0]!.communs, ['Aldéric']);
  assert.deepEqual(saga.liens[1]!.communs, ['Lucan']);
});

test('agregerSaga ne révèle jamais un personnage masqué (anti-spoilers)', () => {
  // Le tome 2 contient officiellement 3 personnages mais le graphe
  // filtré n'en montre qu'UN (les autres n'ont pas été renvoyés).
  const tome2 = tome(
    2,
    { ...grapheVide(), noeuds: [noeud('x', 'Visible')], masquees: 2 },
    { totalPersonnages: 3 }
  );
  const saga = agregerSaga([tome2]);
  assert.deepEqual(
    saga.personnages.map((p) => p.nom),
    ['Visible']
  );
  assert.equal(saga.personnagesMasquesParTome[2], 2);
  assert.equal(saga.masqueesParTome[2], 2);
});

test('agregerSaga compte les apparitions (événements) et les liens (relations)', () => {
  const t = tome(1, {
    ...grapheVide(),
    noeuds: [noeud('p', 'Morana'), noeud('q', 'Lucan')],
    evenements: [
      {
        id: 'e1',
        position: 2,
        genre: 'rencontre',
        titre: 'Rencontre',
        texte: null,
        relationId: null,
        personnageIds: ['p', 'q'],
      },
      {
        id: 'e2',
        position: 5,
        genre: 'rupture',
        titre: 'Rupture',
        texte: null,
        relationId: null,
        personnageIds: ['p'],
      },
    ],
    aretes: [
      {
        id: 'r1',
        origineId: 'p',
        destinationId: 'q',
        libelle: 'épouse',
        type: 'amour',
        sens: 'none',
        intensite: 3,
        etat: 'tendre',
        fiabilite: 'fait',
        premierePosition: 2,
      },
    ],
  });
  const saga = agregerSaga([t]);
  const morana = personnagesDuTome(saga, 1)[0]!;
  assert.equal(morana.nom, 'Morana');
  assert.equal(morana.apparitions[1], 2);
  assert.equal(morana.liens[1], 1);
  const lucan = saga.personnages.find((p) => p.nom === 'Lucan')!;
  assert.equal(lucan.apparitions[1], 1);
  assert.equal(lucan.liens[1], 1);
});

test('agregerSaga groupe les évolutions de relations par paire ordonnée et stable', () => {
  const t1 = tome(1, {
    ...grapheVide(),
    noeuds: [noeud('p', 'Morana'), noeud('q', 'Lucan')],
    aretes: [
      {
        id: 'r1',
        origineId: 'p',
        destinationId: 'q',
        libelle: 'épouse',
        type: 'amour',
        sens: 'none',
        intensite: 3,
        etat: 'tendre',
        fiabilite: 'fait',
        premierePosition: 2,
      },
    ],
  });
  const t2 = tome(2, {
    ...grapheVide(),
    noeuds: [noeud('p2', 'Morana'), noeud('q2', 'Lucan')],
    aretes: [
      {
        id: 'r2',
        origineId: 'q2',
        destinationId: 'p2',
        libelle: 'trompe',
        type: 'trahison',
        sens: 'ab',
        intensite: 4,
        etat: 'rompue',
        fiabilite: 'deduction',
        premierePosition: 8,
      },
    ],
  });
  const saga = agregerSaga([t1, t2]);
  assert.equal(saga.evolutions.length, 1);
  const evolution = saga.evolutions[0]!;
  assert.equal(evolution.nomA, 'Lucan');
  assert.equal(evolution.nomB, 'Morana');
  assert.equal(evolution.etapes.length, 2);
  assert.equal(evolution.etapes[0]!.tome, 1);
  assert.equal(evolution.etapes[0]!.type, 'amour');
  assert.equal(evolution.etapes[1]!.type, 'trahison');
  assert.equal(evolution.etapes[1]!.chapitre, 8);
});

test('agregerSaga assemble la chronologie inter-tomes triée par tome puis chapitre', () => {
  const t1 = tome(1, {
    ...grapheVide(),
    noeuds: [noeud('p', 'Morana')],
    evenements: [
      {
        id: 'e2',
        position: 6,
        genre: 'revelation',
        titre: 'Révélation',
        texte: 'Un aveu.',
        relationId: null,
        personnageIds: ['p'],
      },
      {
        id: 'e1',
        position: 2,
        genre: 'rencontre',
        titre: 'Rencontre',
        texte: null,
        relationId: null,
        personnageIds: ['p'],
      },
    ],
  });
  const t2 = tome(2, {
    ...grapheVide(),
    noeuds: [noeud('p2', 'Morana')],
    evenements: [
      {
        id: 'e3',
        position: 1,
        genre: 'etat',
        titre: 'Exil',
        texte: null,
        relationId: null,
        personnageIds: ['p2'],
      },
    ],
  });
  const saga = agregerSaga([t1, t2]);
  assert.deepEqual(
    saga.evenements.map((e) => [e.tome, e.chapitre]),
    [
      [1, 2],
      [1, 6],
      [2, 1],
    ]
  );
  assert.equal(evenementsDuTome(saga, 1).length, 2);
  assert.equal(evenementsDuTome(saga, 2).length, 1);
  assert.deepEqual(saga.evenements[0]!.personnages, ['Morana']);
  assert.equal(saga.evenements[2]!.tomeTitre, 'Tome 2');
});

test('agregerSaga trie les personnages par importance puis par nom', () => {
  const t = tome(1, {
    ...grapheVide(),
    noeuds: [
      noeud('b', 'Bruno', 1),
      noeud('a', 'Adele', 2),
      noeud('z', 'Zoran', 3),
      noeud('y', 'Yrsa', 3),
    ],
  });
  const saga = agregerSaga([t]);
  assert.deepEqual(
    saga.personnages.map((p) => p.nom),
    ['Yrsa', 'Zoran', 'Adele', 'Bruno']
  );
});

test('agregerSaga gère une saga vide ou à un seul tome sans lien', () => {
  const vide = agregerSaga([]);
  assert.deepEqual(vide.personnages, []);
  assert.deepEqual(vide.liens, []);
  const un = agregerSaga([tome(1, grapheVide())]);
  assert.deepEqual(un.liens, []);
});
