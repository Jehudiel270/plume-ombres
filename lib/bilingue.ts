// ============================================================
// lib/bilingue.ts — Vue bilingue alignée (F7).
//
// La traduction est produite SEGMENT par SEGMENT (lib/segmenter.ts,
// table `segments`) : chaque segment porte sa source et sa traduction.
// L'alignement le plus fidèle est donc SEGMENT par SEGMENT — c'est
// exactement la définition de F7 (« Comparateur de traduction :
// texte source + texte traduit alignés, alignement segment par
// segment »).
//
// Repli : quand les segments sont indisponibles, les deux textes
// assemblés (chapitres.texte_source / texte_traduit) sont appariés
// paragraphe par paragraphe — correct tant que la traduction
// respecte le découpage de paragraphes de la source.
//
// Logique PURE : testée par lib/bilingue.test.ts, consommée par
// EspaceLivre (fetch des segments) et Lecteur (rendu des paires).
// ============================================================

import { decouperEnParagraphes } from '@/lib/pagination';

/** Une paire alignée : source en face de la traduction. */
export interface PaireBilingue {
  /** Texte source du segment (jamais vide). */
  source: string;
  /** Traduction du segment ('' si non traduit ou indisponible). */
  traduit: string;
  /** Offset du texte traduit dans le chapitre assemblé (-1 si inconnu :
   *  la recherche ne surligne alors pas cette paire). */
  debutTraduit: number;
}

/** Ramène une chaîne à un texte de colonne (blancs réduits, bord rogné). */
function propre(texte: string): string {
  return texte.replace(/\s+/g, ' ').trim();
}

/**
 * Appariement SEGMENT par SEGMENT (F7, voie exacte) : une ligne de la
 * table `segments` (déjà triée par position) devient une paire.
 *   * segment non traduit → paire avec traduit '' (la colonne traduite
 *     reste vide : rien n'est inventé) ;
 *   * segments sans source ni traduction → ignorés ;
 *   * `debutTraduit` est inconnu ici (offsets d'un assemblage qui
 *     appartient au moteur de traduction) : -1, pas de surlignage.
 */
export function apparierDepuisSegments(
  lignes: ReadonlyArray<{ source: string | null; traduit: string | null }>
): PaireBilingue[] {
  const paires: PaireBilingue[] = [];
  for (const ligne of lignes) {
    const source = propre(ligne.source ?? '');
    const traduit = propre(ligne.traduit ?? '');
    if (!source && !traduit) continue;
    paires.push({ source, traduit, debutTraduit: -1 });
  }
  return paires;
}

/**
 * Appariement PARAGRAPHE par PARAGRAPHE (repli) : les deux textes
 * assemblés sont découpés avec le même outil typographique que le
 * rendu (séparateurs de scène exclus des deux côtés), puis appariés
 * par index. Ce qui dépasse d'un côté reste affiché, seul dans sa
 * colonne : jamais de texte perdu, jamais de fausse correspondance.
 * `debutTraduit` porte l'offset EXACT dans le texte traduit assemblé
 * (la recherche surligne donc correctement le côté traduit).
 */
export function apparierParagraphes(
  source: string,
  traduit: string
): PaireBilingue[] {
  const blocsSource = decouperEnParagraphes(source).filter(
    (b) => b.type !== 'scene' && propre(b.texte) !== ''
  );
  const blocsTraduit = decouperEnParagraphes(traduit).filter(
    (b) => b.type !== 'scene' && propre(b.texte) !== ''
  );
  const longueur = Math.max(blocsSource.length, blocsTraduit.length);
  const paires: PaireBilingue[] = [];
  for (let i = 0; i < longueur; i += 1) {
    paires.push({
      source: propre(blocsSource[i]?.texte ?? ''),
      traduit: propre(blocsTraduit[i]?.texte ?? ''),
      debutTraduit: blocsTraduit[i]?.debut ?? -1,
    });
  }
  return paires;
}
