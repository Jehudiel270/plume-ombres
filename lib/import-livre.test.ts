// ============================================================
// import-livre.test.ts — Preuves que l'import réécrit
// `chapitres.texte_source` (correctif du texte vide silencieux).
//
// Exécution : npx tsx --test lib/import-livre.test.ts
// Aucun réseau, aucune base : uniquement le pipeline de préparation.
//
// Règle prouvée : chaque chapitre préparé porte un `texte_source`
// STRING, jamais `undefined` — sinon `components/ZoneImport.tsx` insère
// `undefined`, la clé est omise par JSON, le défaut SQL '' s'applique et
// toute la page livre (lecture source, exports fidèles, glossaire,
// repères, total de caractères) lit une colonne vide sans aucune erreur.
// ============================================================

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  preparerLivre,
  preparerLivreDepuisChapitres,
  type ChapitrePret,
} from './import-livre';
import { normaliserSouple } from './segmenter';

/** Paragraphe d'une seule ligne, largement au-dessus du seuil de chapitre. */
function paragraphe(n: number): string {
  return (
    `Paragraphe ${n} : la nuit tombait sur la lande et le vent portait des ` +
    'odeurs de pluie froide, tandis que les lanternes du village ' +
    's’allumaient une à une. Un chien aboya au loin, puis le silence ' +
    'revint, plus dense encore qu’avant. Elle referma la porte sans bruit.'
  );
}

/** Deux chapitres titrés, texte séparé par des lignes vides. */
const TEXTE_LIVRE = [
  'Chapter 1',
  '',
  paragraphe(1),
  '',
  paragraphe(2),
  '',
  'Chapter 2',
  '',
  paragraphe(3),
  '',
].join('\n');

/** Texte du chapitre tel que les segments le restituent (1:1 `source`+`suite`). */
function reconstitution(chapitre: ChapitrePret): string {
  return chapitre.segments.map((s) => s.source + s.suite).join('');
}

describe('preparerLivre — texte_source réécrit à l’import', () => {
  test('chaque chapitre a un texte_source non vide', () => {
    const livre = preparerLivre(TEXTE_LIVRE, 'livre.txt');

    assert.ok(livre.chapitres.length >= 2, 'le livre doit avoir ses chapitres');
    for (const chapitre of livre.chapitres) {
      // `undefined` est l'ancien bug : la clé serait omise par JSON.
      assert.equal(
        typeof chapitre.texte_source,
        'string',
        `texte_source manquant sur « ${chapitre.titre} »`
      );
      assert.notEqual(
        chapitre.texte_source.trim().length,
        0,
        `texte_source vide sur « ${chapitre.titre} »`
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(chapitre, 'texte_source'),
        'la clé texte_source doit être présente dans l’objet inséré'
      );
    }
  });

  test('texte_source est la reconstitution 1:1 des segments', () => {
    const livre = preparerLivre(TEXTE_LIVRE, 'livre.txt');

    for (const chapitre of livre.chapitres) {
      const texte = reconstitution(chapitre);
      assert.ok(texte.length > 0, 'les segments doivent porter le texte');

      // `texte_source` conserve le texte BRUT du chapitre (exigé par
      // l'alignement de lib/pdf-fidele.ts sur le flux d'import) ; les
      // segments en sont la forme NORMALISÉE (retours à la ligne « mous »
      // réunis en espaces, cf. normaliserSouple). L'égalité stricte vaut
      // donc sur le texte normalisé — c'est l'invariant garanti par
      // `verifierIntegrite` dans lib/segmenter.ts et par
      // `reconstituer_source` en base.
      assert.equal(normaliserSouple(chapitre.texte_source), texte);

      // Preuve au caractère près : le texte brut et la reconstitution ne
      // diffèrent QUE par le blanc final (le découpage en chapitres ajoute
      // un '\n' terminal ; la normalisation le rend en ' ').
      assert.equal(chapitre.texte_source.trimEnd(), texte.trimEnd());
    }
  });

  test('un chapitre sans texte donne texte_source === "" (pas undefined)', () => {
    const livre = preparerLivre('', 'vide.txt');

    assert.equal(livre.chapitres.length, 1);
    const [chapitre] = livre.chapitres;
    assert.equal(chapitre.texte_source, '');
    assert.equal(typeof chapitre.texte_source, 'string');
    assert.deepEqual(chapitre.segments, []);
  });
});

describe('preparerLivreDepuisChapitres — égalité stricte avec les segments', () => {
  test('texte_source est exactement segments.map(source + suite).join("")', () => {
    // Chapitres fournis déjà au format normalisé (une ligne par paragraphe,
    // séparés par une ligne vide) : aucune normalisation ne s'applique, donc
    // l'égalité est stricte, caractère pour caractère.
    const livre = preparerLivreDepuisChapitres(
      [
        { titre: 'Chapitre I', texte: `${paragraphe(4)}\n\n${paragraphe(5)}` },
        { titre: 'Chapitre II', texte: paragraphe(6) },
      ],
      'Livre de test',
      'Autrice'
    );

    assert.equal(livre.chapitres.length, 2);
    for (const chapitre of livre.chapitres) {
      assert.equal(chapitre.texte_source, reconstitution(chapitre));
      assert.ok(chapitre.texte_source.length > 0);
    }
  });

  test('un chapitre vide reste une chaîne vide, jamais undefined', () => {
    const livre = preparerLivreDepuisChapitres(
      [{ titre: 'Vide', texte: '' }],
      'Livre vide',
      ''
    );

    const [chapitre] = livre.chapitres;
    assert.strictEqual(chapitre.texte_source, '');
    assert.deepEqual(chapitre.segments, []);
  });
});
