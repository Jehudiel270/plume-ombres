// ============================================================
// lib/traduction/groupes.test.ts — Tests du regroupement de segments.
//
// Lancement : npx tsx --test lib/traduction/groupes.test.ts
//
// Aucun réseau : le moteur est remplacé par un faux traducteur qui
// compte les appels. Ce que l'on vérifie ici, c'est le NOMBRE
// d'appels et l'ABSENCE de corruption (chaque traduction revient au
// bon segment, dans le bon ordre).
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CARACTERES_GROUPE,
  MAX_LONGUEUR_SEGMENT_GROUPE,
  MAX_SEGMENTS_GROUPE,
  assemblerGroupe,
  caracteresGroupe,
  decouperTraduction,
  regrouperSegments,
  type SegmentRegroupable,
} from './groupes';
import { traiterLotSegments, type SegmentLot, type TraducteurLot } from './lot';
import { ErreurChaineSecours, type ResultatTraductionSecours } from '@/lib/providers';

// ------------------------------------------------------------
// Outils de test
// ------------------------------------------------------------

function succes(traduit: string): ResultatTraductionSecours {
  return {
    traduit,
    fournisseur: 'gemini',
    nomFournisseur: 'Gemini',
    description: 'test',
    prive: false,
    priveStrict: false,
    essais: 1,
    tentatives: 1,
    dureeMs: 1,
  };
}

const MOTS = (
  'the quick brown fox jumps over a lazy dog while the old lighthouse keeper ' +
  'watches the tide roll in and remembers every ship that never came back home'
).split(' ');

/** Texte déterministe d'exactement `longueur` caractères (bornes de mot). */
function texteDeLongueur(longueur: number): string {
  let texte = '';
  let i = 0;
  while (texte.length < longueur) {
    texte += (texte ? ' ' : '') + MOTS[i % MOTS.length];
    i += 1;
  }
  return texte.slice(0, longueur).replace(/\s+\S*$/, '');
}

function segments(nombre: number, longueur: number): SegmentLot[] {
  return Array.from({ length: nombre }, (_, i) => ({
    id: `s${String(i).padStart(2, '0')}`,
    // Suffixe unique : un texte mal attribué serait détecté.
    texte: `${texteDeLongueur(longueur)} #${i}`,
  }));
}

/** Segments de longueur EXACTE (test des bornes). */
function segmentsExacts(nombre: number, longueur: number): SegmentLot[] {
  return Array.from({ length: nombre }, (_, i) => ({
    id: `s${String(i).padStart(2, '0')}`,
    texte: 'a'.repeat(longueur),
  }));
}

interface Compteur {
  traduire: TraducteurLot;
  appels: string[];
}

/** Faux moteur : compte les appels et transforme le texte reçu. */
function compteur(repondre: (texte: string) => string): Compteur {
  const appels: string[] = [];
  const traduire: TraducteurLot = async (texte) => {
    appels.push(texte);
    return succes(repondre(texte));
  };
  return { traduire, appels };
}

const ids = (groupes: SegmentLot[][]): string[][] =>
  groupes.map((groupe) => groupe.map((segment) => segment.id));

// ------------------------------------------------------------
// 1. Bornes du regroupement
// ------------------------------------------------------------

test('12 petits segments consécutifs → un seul groupe', () => {
  const lot = segments(MAX_SEGMENTS_GROUPE, 40);
  const groupes = regrouperSegments(lot);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].length, MAX_SEGMENTS_GROUPE);
  assert.equal(caracteresGroupe(groupes[0]), lot.reduce((n, s) => n + s.texte.length, 0));
});

test('jamais plus de 12 segments par groupe', () => {
  const lot = segments(MAX_SEGMENTS_GROUPE + 3, 20);
  const groupes = regrouperSegments(lot);
  assert.equal(groupes.length, 2);
  assert.equal(groupes[0].length, MAX_SEGMENTS_GROUPE);
  assert.equal(groupes[1].length, 3);
});

test('jamais plus de 4 500 caractères par groupe', () => {
  const lot = segmentsExacts(10, 500); // 4 500 = exactement la borne
  const groupes = regrouperSegments(lot);
  assert.equal(groupes.length, 2);
  assert.equal(caracteresGroupe(groupes[0]), MAX_CARACTERES_GROUPE);
  assert.equal(groupes[1].length, 1);
  for (const groupe of groupes) {
    assert.ok(caracteresGroupe(groupe) <= MAX_CARACTERES_GROUPE);
  }
});

test('un segment de 900 caractères n’est jamais regroupé', () => {
  const lot: SegmentLot[] = [
    { id: 'a', texte: texteDeLongueur(30) },
    { id: 'b', texte: texteDeLongueur(30) },
    { id: 'long', texte: texteDeLongueur(900) },
    { id: 'c', texte: texteDeLongueur(30) },
    { id: 'd', texte: texteDeLongueur(30) },
  ];
  const groupes = regrouperSegments(lot);
  assert.deepEqual(ids(groupes), [['a', 'b'], ['long'], ['c', 'd']]);
  assert.ok(900 > MAX_LONGUEUR_SEGMENT_GROUPE);
});

test('l’ordre des segments est préservé, sans perte ni doublon', () => {
  const lot = segments(37, 55);
  lot[9] = { id: 'long', texte: texteDeLongueur(700) };
  const groupes = regrouperSegments(lot);
  const aplat = groupes.flat().map((segment) => segment.id);
  assert.deepEqual(aplat, lot.map((segment) => segment.id));
});

test('un contexte différent sépare les groupes (pas de mélange de scène)', () => {
  const lot: SegmentLot[] = [
    { id: 'a', texte: 'bonjour', contexte: 'scène 1' },
    { id: 'b', texte: 'encore', contexte: 'scène 1' },
    { id: 'c', texte: 'ailleurs', contexte: 'scène 2' },
  ];
  assert.deepEqual(ids(regrouperSegments(lot)), [['a', 'b'], ['c']]);
});

test('un segment vide reste seul (il ne sera jamais envoyé au moteur)', () => {
  const lot: SegmentLot[] = [
    { id: 'a', texte: 'bonjour' },
    { id: 'vide', texte: '   ' },
    { id: 'b', texte: 'soir' },
  ];
  assert.deepEqual(ids(regrouperSegments(lot)), [['a'], ['vide'], ['b']]);
});

// ------------------------------------------------------------
// 2. Sentinelle : assemblage et découpage
// ------------------------------------------------------------

test('assemblerGroupe joint les textes par ⟦PLUME:<index>⟧', () => {
  const groupe: SegmentRegroupable[] = [
    { texte: 'un' },
    { texte: 'deux' },
    { texte: 'trois' },
  ];
  assert.equal(assemblerGroupe(groupe), 'un\n⟦PLUME:1⟧\ndeux\n⟦PLUME:2⟧\ntrois');
});

test('découpage : aller-retour fidèle sur 12 segments', () => {
  const lot = segments(12, 90);
  const texte = assemblerGroupe(lot);
  const parties = decouperTraduction(texte, lot.length);
  assert.ok(parties);
  assert.deepEqual(parties, lot.map((segment) => segment.texte));
});

test('découpage tolérant : espaces et casse du marqueur acceptés', () => {
  const variantes = [
    'a\n⟦ plume : 1 ⟧\nb\n⟦Plume:2⟧\nc',
    'a\n【PLUME:1】\nb\n【plume : 2】\nc',
    'a\n[[PLUME:1]]\nb\n[PLUME:2]\nc',
  ];
  for (const variante of variantes) {
    assert.deepEqual(decouperTraduction(variante, 3), ['a', 'b', 'c'], variante);
  }
});

test('découpage : marqueur 0 superflu en tête accepté', () => {
  assert.deepEqual(decouperTraduction('⟦PLUME:0⟧\na\n⟦PLUME:1⟧\nb', 2), ['a', 'b']);
});

test('découpage refusé : nombre de marqueurs faux', () => {
  // Un marqueur manquant.
  assert.equal(decouperTraduction('a\n⟦PLUME:1⟧\nb\nc', 3), null);
  // Un marqueur de trop.
  assert.equal(decouperTraduction('a\n⟦PLUME:1⟧\nb\n⟦PLUME:2⟧\nc\n⟦PLUME:3⟧\nd', 3), null);
  // Aucun marqueur du tout.
  assert.equal(decouperTraduction('a b c', 3), null);
});

test('découpage refusé : ordre non respecté ou doublon', () => {
  assert.equal(decouperTraduction('a\n⟦PLUME:2⟧\nb\n⟦PLUME:1⟧\nc', 3), null);
  assert.equal(decouperTraduction('a\n⟦PLUME:1⟧\nb\n⟦PLUME:1⟧\nc', 3), null);
});

test('découpage refusé : une partie vide', () => {
  assert.equal(decouperTraduction('a\n⟦PLUME:1⟧\n\n⟦PLUME:2⟧\nc', 3), null);
  assert.equal(decouperTraduction('\n⟦PLUME:1⟧\nb\n⟦PLUME:2⟧\nc', 3), null);
});

// ------------------------------------------------------------
// 3. Intégration dans traiterLotSegments
// ------------------------------------------------------------

test('12 petits segments → UN SEUL appel moteur, 12 traductions correctes', async () => {
  const lot = segments(12, 60);
  const { traduire, appels } = compteur((texte) => texte.toUpperCase());
  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
  });

  assert.equal(appels.length, 1, 'un seul appel moteur pour 12 segments');
  assert.equal(echecs.length, 0);
  assert.deepEqual(resultats.map((r) => r.id), lot.map((s) => s.id));
  // Aucune corruption : chaque texte revient à son segment, entier.
  for (const [index, resultat] of resultats.entries()) {
    assert.equal(resultat.traduit, lot[index].texte.toUpperCase());
  }
});

test('sentinelle abîmée → repli un par un, aucune corruption', async () => {
  const lot = segments(12, 60);
  const { traduire, appels } = compteur((texte) =>
    // Le marqueur est perdu, comme avec un moteur sans prompt.
    texte.replace(/⟦PLUME:\d+⟧/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
  );
  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
  });

  assert.equal(appels.length, 1 + lot.length, 'le groupe puis les 12 segments');
  assert.equal(echecs.length, 0);
  assert.equal(resultats.length, lot.length);
  assert.deepEqual(resultats.map((r) => r.id), lot.map((s) => s.id));
  for (const [index, resultat] of resultats.entries()) {
    assert.equal(
      resultat.traduit,
      lot[index].texte.toUpperCase(),
      'texte attribué au bon segment'
    );
  }
});

test('le repli ne concerne QUE le groupe fautif', async () => {
  // Deux groupes : le premier casse sa sentinelle, le second la garde.
  const lot = [
    ...segments(6, 50),
    { id: 'long', texte: texteDeLongueur(900) },
    ...segments(6, 50).map((s) => ({ ...s, id: `t${s.id}` })),
  ];
  let appels = 0;
  let groupesAvecMarqueur = 0;
  const traduire: TraducteurLot = async (texte) => {
    appels += 1;
    if (texte.includes('⟦PLUME:')) {
      groupesAvecMarqueur += 1;
      // Le premier groupe perd sa sentinelle, le second la conserve.
      return succes(groupesAvecMarqueur === 1 ? `[fr]${texte.replace(/⟦PLUME:\d+⟧/g, ' ')}` : `[fr]${texte}`);
    }
    return succes(`[fr]${texte}`);
  };
  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
  });

  assert.equal(echecs.length, 0);
  assert.equal(resultats.length, lot.length);
  // 1 groupe cassé + 6 replis + 1 segment long + 1 groupe réussi.
  assert.equal(groupesAvecMarqueur, 2);
  assert.equal(appels, 1 + 6 + 1 + 1);
});

test('un segment de 900 caractères n’est jamais envoyé avec d’autres', async () => {
  const lot: SegmentLot[] = [
    { id: 'a', texte: texteDeLongueur(40) },
    { id: 'b', texte: texteDeLongueur(40) },
    { id: 'long', texte: texteDeLongueur(900) },
    { id: 'c', texte: texteDeLongueur(40) },
    { id: 'd', texte: texteDeLongueur(40) },
  ];
  const { traduire, appels } = compteur((texte) => `[fr]${texte}`);
  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
  });

  assert.equal(echecs.length, 0);
  assert.equal(appels.length, 3, 'deux groupes de deux + le segment long seul');
  assert.equal(appels[1], lot[2].texte, 'le segment long part seul');
  assert.equal(resultats.find((r) => r.id === 'long')?.traduit, `[fr]${lot[2].texte}`);
});

test('échec moteur d’un groupe → TOUS ses segments en échec, sans repli', async () => {
  const lot = segments(4, 45);
  const liberations: number[] = [];
  const { traduire, appels } = compteur(() => {
    throw new ErreurChaineSecours([{ id: 'gemini', categorie: 'quota' }]);
  });

  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
    libererCaracteres: async (n) => {
      liberations.push(n);
    },
  });

  assert.equal(appels.length, 1, 'aucun appel supplémentaire : le groupe a échoué');
  assert.equal(resultats.length, 0);
  assert.deepEqual(echecs.map((e) => e.id), lot.map((s) => s.id));
  assert.deepEqual(echecs.map((e) => e.raison), ['limite', 'limite', 'limite', 'limite']);
  const attendu = lot.reduce((n, s) => n + s.texte.length, 0);
  assert.deepEqual(liberations, [attendu], 'seuls les caractères en échec sont libérés');
});

test('au moins 5× moins d’appels sur 24 segments réalistes', async () => {
  // Longueurs calquées sur la mesure réelle : moyenne ≈ 215 caractères,
  // un tiers sous 100 caractères.
  const longueurs = [48, 92, 210, 305, 160, 118, 420, 76, 215, 88, 340, 150];
  const lot: SegmentLot[] = Array.from({ length: 24 }, (_, i) => ({
    id: `r${String(i).padStart(2, '0')}`,
    texte: `${texteDeLongueur(longueurs[i % longueurs.length])} #${i}`,
  }));
  assert.ok(lot.every((s) => s.texte.length <= MAX_LONGUEUR_SEGMENT_GROUPE));

  const { traduire, appels } = compteur((texte) => texte.toUpperCase());
  const { resultats, echecs } = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    traduire,
  });

  const avant = lot.length;
  const apres = appels.length;
  assert.equal(echecs.length, 0);
  assert.equal(resultats.length, lot.length);
  assert.ok(
    avant / apres >= 5,
    `réduction insuffisante : ${avant} appels avant, ${apres} après`
  );
  assert.deepEqual(resultats.map((r) => r.id), lot.map((s) => s.id));
  for (const [index, resultat] of resultats.entries()) {
    assert.equal(resultat.traduit, lot[index].texte.toUpperCase());
  }
});
