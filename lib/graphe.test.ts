// ============================================================
// lib/graphe.test.ts — Preuves du filtrage ANTI-SPOILERS (F25),
// du layout (cercle, anneaux par importance), de la phrase de
// relation et des bornes d'intensité/importance.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  borneImportance,
  borneIntensite,
  calculerSuggestions,
  estFiabilite,
  estGenreEvenement,
  estRole,
  estSens,
  estTypeRelation,
  filtrerGraphe,
  libelleGenre,
  libelleRole,
  phraseRelation,
  positionsCercle,
  positionsToile,
  TYPES_RELATION,
  type AreteGraphe,
  type EvenementGraphe,
  type GrapheFiltre,
  type NoeudGraphe,
} from './graphe';

const noeud = (id: string, premierePosition: number | null): NoeudGraphe => ({
  id,
  nom: id,
  role: 'secondaire',
  importance: 2,
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
  type: 'autre',
  sens: 'none',
  intensite: 2,
  etat: null,
  fiabilite: 'fait',
  premierePosition,
});

const evenement = (
  id: string,
  position: number,
  personnageIds: string[]
): EvenementGraphe => ({
  id,
  position,
  genre: 'rencontre',
  titre: `Événement ${id}`,
  texte: null,
  relationId: null,
  personnageIds,
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

test('les événements suivent le même filtrage que le reste', () => {
  const noeuds = [noeud('a', null), noeud('b', 4)];
  const evenements = [
    evenement('e1', 2, ['a']),
    evenement('e2', 6, ['a', 'b']), // b apparaît au chapitre 4 : couvert au ch. 6
  ];

  const jusqu5 = filtrerGraphe(noeuds, [], 5, evenements);
  assert.deepEqual(jusqu5.evenements.map((e) => e.id), ['e1']);

  const jusqu7 = filtrerGraphe(noeuds, [], 7, evenements);
  assert.deepEqual(jusqu7.evenements.map((e) => e.id), ['e1', 'e2']);
  assert.equal(jusqu7.masquees, 0);

  // Un événement citant un personnage non couvert reste caché
  // (le personnage d caché + l'événement e3 caché = 2 masqués).
  const piege = filtrerGraphe([noeud('a', null), noeud('d', 9)], [], 5, [
    evenement('e3', 2, ['a', 'd']),
  ]);
  assert.deepEqual(piege.evenements, []);
  assert.equal(piege.masquees, 2);
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

test('le nombre de masqués compte nœuds, arêtes ET événements', () => {
  const filtre = filtrerGraphe(
    [noeud('a', null), noeud('b', 3)],
    [arete('r1', 'a', 'b', 3)],
    null,
    [evenement('e1', 3, ['a'])]
  );
  // b caché + r1 cachée (b non couvert) + e1 caché (b non couvert) = 3.
  assert.equal(filtre.masquees, 3);
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

test('la toile place les principaux au centre, les secondaires autour', () => {
  const pos = positionsToile([
    { id: 'p1', importance: 3 },
    { id: 'p2', importance: 3 },
    { id: 'n1', importance: 2 },
    { id: 's1', importance: 1 },
    { id: 's2', importance: 1 },
  ]);
  const centre = { x: 500, y: 350 };
  const dist = (id: string) =>
    Math.hypot(pos[id].x - centre.x, pos[id].y - centre.y);
  // Principaux sur l'anneau interne (rayon 130, aplati à 0.82) : ≤ 130.
  assert.ok(dist('p1') < 140 && dist('p2') < 140, 'principaux sur l’anneau interne');
  // Un groupe d'un seul membre reste SUR son anneau (jamais au centre).
  assert.ok(dist('n1') > 180 && dist('n1') < 260, 'notables sur l’anneau médian');
  assert.ok(dist('s1') > 250 && dist('s2') > 250, 'secondaires en périphérie');
  // Une toile d'un seul personnage occupe le centre exact.
  const seul = positionsToile([{ id: 'x', importance: 2 }]);
  assert.deepEqual(seul.x, { x: 500, y: 350 });
});

test('phraseRelation respecte le sens du lien', () => {
  const nomDe = (id: string) => (id === 'a' ? 'Elwenn' : 'Thaddeus');
  const base = { origineId: 'a', destinationId: 'b', libelle: 'sœur de' };
  assert.equal(
    phraseRelation({ ...base, sens: 'ab' }, nomDe),
    'Elwenn sœur de Thaddeus'
  );
  assert.equal(
    phraseRelation({ ...base, sens: 'ba' }, nomDe),
    'Thaddeus sœur de Elwenn'
  );
  assert.equal(
    phraseRelation({ ...base, sens: 'none', libelle: 'alliés' }, nomDe),
    'Elwenn et Thaddeus — alliés'
  );
  assert.equal(
    phraseRelation({ ...base, sens: 'both', libelle: 'liés par le sang' }, nomDe),
    'Elwenn et Thaddeus — liés par le sang'
  );
});

test('validateurs fermés pour les valeurs venues du client', () => {
  assert.equal(estTypeRelation('trahison'), true);
  assert.equal(estTypeRelation('amour_fou'), false);
  assert.equal(estSens('ab'), true);
  assert.equal(estSens('diagonal'), false);
  assert.equal(estFiabilite('hypothese'), true);
  assert.equal(estFiabilite('sur'), false);
  assert.equal(estGenreEvenement('revelation'), true);
  assert.equal(estGenreEvenement('fete'), false);
  assert.equal(libelleGenre('rupture'), 'Rupture');
  // Palette : chaque type a une couleur et un libellé.
  for (const t of Object.keys(TYPES_RELATION) as Array<keyof typeof TYPES_RELATION>) {
    assert.ok(TYPES_RELATION[t].couleur.startsWith('#'));
    assert.ok(TYPES_RELATION[t].libelle.length > 0);
  }
});

test('bornes d\'intensité et d\'importance', () => {
  assert.equal(borneIntensite(3), 3);
  assert.equal(borneIntensite(99), 5);
  assert.equal(borneIntensite(-2), 1);
  assert.equal(borneIntensite('x'), 2);
  assert.equal(borneImportance(1), 1);
  assert.equal(borneImportance(7), 3);
  assert.equal(borneImportance(undefined), 2);
});

// ---------- SUGGESTIONS LOCALES (sans IA) ----------

function noeudTest(id: string, nom: string): NoeudGraphe {
  return {
    id,
    nom,
    role: 'secondaire',
    importance: 2,
    description: null,
    premierePosition: null,
  };
}

function areteTest(id: string, origine: string, destination: string): AreteGraphe {
  return {
    id,
    origineId: origine,
    destinationId: destination,
    libelle: 'alliés',
    type: 'alliance',
    sens: 'none',
    intensite: 2,
    etat: null,
    fiabilite: 'fait',
    premierePosition: 1,
  };
}

test('calculerSuggestions propose les paires co-apparentées sans relation', () => {
  const graphe: GrapheFiltre = {
    noeuds: [
      noeudTest('a', 'Aldéric'),
      noeudTest('b', 'Morana'),
      noeudTest('c', 'Lucan'),
    ],
    aretes: [areteTest('r1', 'a', 'b')],
    evenements: [
      {
        id: 'e1',
        position: 2,
        genre: 'rencontre',
        titre: 'Scène',
        texte: null,
        relationId: null,
        personnageIds: ['a', 'b', 'c'],
      },
    ],
    masquees: 0,
  };
  const suggestions = calculerSuggestions(graphe);
  // a-b sont reliés : pas de suggestion ; a-c et b-c sont proposés.
  assert.equal(suggestions.pairesSansLien.length, 2);
  assert.deepEqual(
    suggestions.pairesSansLien.map((p) => [p.nomOrigine, p.nomDestination]),
    [
      ['Aldéric', 'Lucan'],
      ['Morana', 'Lucan'],
    ]
  );
  // Personnages isolés : tous de degré 0 sauf a et b.
  assert.deepEqual(
    suggestions.isoles.map((n) => n.nom),
    ['Lucan']
  );
  assert.equal(suggestions.fragiles.length, 0);
});

test('calculerSuggestions liste les relations fragiles et ignore les paires déjà reliées', () => {
  const fragile: AreteGraphe = {
    ...areteTest('r2', 'b', 'c'),
    libelle: 'rumeurs',
    fiabilite: 'hypothese',
  };
  const graphe: GrapheFiltre = {
    noeuds: [noeudTest('a', 'Aldéric'), noeudTest('b', 'Morana'), noeudTest('c', 'Lucan')],
    aretes: [areteTest('r1', 'a', 'b'), fragile],
    evenements: [
      {
        id: 'e1',
        position: 1,
        genre: 'rencontre',
        titre: 'Scène',
        texte: null,
        relationId: null,
        personnageIds: ['a', 'b'],
      },
    ],
    masquees: 0,
  };
  const suggestions = calculerSuggestions(graphe);
  // a-b déjà reliés → aucune paire suggérée malgré la co-apparition.
  assert.equal(suggestions.pairesSansLien.length, 0);
  assert.equal(suggestions.fragiles.length, 1);
  assert.equal(suggestions.fragiles[0]!.libelle, 'rumeurs');
  assert.equal(suggestions.fragiles[0]!.fiabilite, 'hypothese');
});
