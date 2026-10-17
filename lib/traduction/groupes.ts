// ============================================================
// lib/traduction/groupes.ts — Regroupement de segments courts.
//
// Constat mesuré : sur 20 528 segments en attente, la longueur
// moyenne est de 215 caractères et 8 293 font moins de 100
// caractères. Avec un appel moteur PAR segment, la latence d'appel
// écrase le débit (29 car/s mesurés). On regroupe donc les petits
// segments CONSÉCUTIFS dans un seul appel, séparés par une sentinelle
// que le moteur doit recopier telle quelle :
//
//     texte du segment 0
//     ⟦PLUME:1⟧
//     texte du segment 1
//     ⟦PLUME:2⟧
//     texte du segment 2
//
// Deux garde-fous encadrent l'usage :
//  • le regroupement est BORNÉ (12 segments, 4 500 caractères) pour
//    rester dans les limites des moteurs et ne pas dégrader la
//    qualité par un contexte trop long ;
//  • un découpage douteux est REJETÉ (null) : l'appelant retombe
//    alors sur un appel par segment. Aucun texte n'est jamais
//    attribué au mauvais segment.
//
// Aucun nom de fournisseur n'apparaît ici : ce module est purement
// textuel (aucun réseau, aucune I/O).
// ============================================================

/** Nombre maximal de segments dans un groupe. */
export const MAX_SEGMENTS_GROUPE = 12;
/** Nombre maximal de caractères (somme des textes) dans un groupe. */
export const MAX_CARACTERES_GROUPE = 4_500;
/** Au-delà de cette longueur, un segment reste SEUL dans son groupe. */
export const MAX_LONGUEUR_SEGMENT_GROUPE = 600;

/** Segment minimal attendu par le regroupement. */
export interface SegmentRegroupable {
  texte: string;
  /** Contexte glissant : deux segments ne sont groupés que s'il est identique. */
  contexte?: string;
}

export interface OptionsRegroupement {
  /** 12 par défaut. */
  maxSegments?: number;
  /** 4 500 par défaut. */
  maxCaracteres?: number;
  /** 600 par défaut : au-delà, le segment reste seul. */
  maxLongueurSegment?: number;
}

/**
 * Sentinelle séparant deux segments d'un groupe. L'index est la
 * POSITION DU SEGMENT QUI SUIT la sentinelle (1..n-1) : la première
 * partie d'un groupe n'est donc précédée d'aucune sentinelle.
 */
export function marqueurGroupe(index: number): string {
  return `\n⟦PLUME:${index}⟧\n`;
}

/**
 * Répartit des segments en groupes de segments CONSÉCUTIFS (dans
 * l'ordre du tableau). Un groupe ne dépasse jamais `maxSegments`
 * segments ni `maxCaracteres` caractères.
 *
 * Restent SEULS dans leur groupe :
 *  • un segment vide (rien à traduire) ;
 *  • un segment de plus de `maxLongueurSegment` caractères (600 par
 *    défaut) : il est déjà assez long pour être un appel à lui seul ;
 *  • un segment de plus de `maxCaracteres` caractères (il ne peut
 *    tenir dans aucun groupe) ;
 *  • tout segment dont le contexte diffère de celui du groupe courant.
 *
 * Comme un segment isolé referme le groupe courant, l'ordre du
 * tableau d'entrée est intégralement préservé à la sortie.
 */
export function regrouperSegments<T extends SegmentRegroupable>(
  segments: readonly T[],
  options: OptionsRegroupement = {}
): T[][] {
  const maxSegments = entierPositif(options.maxSegments, MAX_SEGMENTS_GROUPE);
  const maxCaracteres = entierPositif(options.maxCaracteres, MAX_CARACTERES_GROUPE);
  const maxLongueurSegment = entierPositif(
    options.maxLongueurSegment,
    MAX_LONGUEUR_SEGMENT_GROUPE
  );

  const groupes: T[][] = [];
  let courant: T[] = [];
  let caracteresCourant = 0;

  const fermer = (): void => {
    if (courant.length > 0) {
      groupes.push(courant);
      courant = [];
      caracteresCourant = 0;
    }
  };

  for (const segment of segments) {
    const longueur = segment.texte.trim().length;
    const isole =
      longueur === 0 || longueur > maxLongueurSegment || longueur > maxCaracteres;
    if (isole) {
      fermer();
      groupes.push([segment]);
      continue;
    }
    const contexteCourant = courant[0]?.contexte ?? '';
    const contexteDifferent =
      courant.length > 0 && contexteCourant !== (segment.contexte ?? '');
    if (
      courant.length >= maxSegments ||
      caracteresCourant + longueur > maxCaracteres ||
      contexteDifferent
    ) {
      fermer();
    }
    courant.push(segment);
    caracteresCourant += longueur;
  }
  fermer();

  return groupes;
}

/** Caractères réellement envoyés pour un groupe (textes découpés). */
export function caracteresGroupe(groupe: readonly SegmentRegroupable[]): number {
  return groupe.reduce((somme, segment) => somme + segment.texte.trim().length, 0);
}

/**
 * Assemble un groupe en un seul texte : les segments sont joints par
 * la sentinelle `\n⟦PLUME:<index>⟧\n`.
 */
export function assemblerGroupe(groupe: readonly SegmentRegroupable[]): string {
  return groupe
    .map((segment, index) =>
      index === 0
        ? segment.texte.trim()
        : `${marqueurGroupe(index)}${segment.texte.trim()}`
    )
    .join('');
}

/**
 * Motif TOLÉRANT de sentinelle : accepte les espaces autour des
 * deux-points et dans les crochets, ainsi que la casse (les moteurs
 * reformatent parfois la sortie). Le nombre, lui, reste strict : la
 * séquence attendue est vérifiée plus bas.
 */
function motifMarqueur(): RegExp {
  return /(?:⟦|【|\[\[|\[)\s*PLUME\s*:\s*(\d{1,4})\s*(?:⟧|】|\]\]|\])/gi;
}

/**
 * Découpe la traduction d'un groupe en `attendus` textes, ou renvoie
 * `null` si le découpage n'est pas sûr :
 *  • nombre de sentinelles incorrect ;
 *  • indices dans le désordre, dupliqués ou manquants ;
 *  • partie vide.
 *
 * L'appelant doit alors retraduire les segments du groupe un par un :
 * mieux vaut un appel de plus qu'un texte attribué au mauvais segment.
 *
 * Tolérance : une sentinelle `⟦PLUME:0⟧` en tête de réponse est
 * acceptée (certains moteurs étiquettent aussi la première partie).
 */
export function decouperTraduction(
  texte: string,
  attendus: number
): string[] | null {
  if (typeof texte !== 'string') return null;
  if (!Number.isInteger(attendus) || attendus < 1) return null;

  const morceaux: string[] = [];
  const indices: number[] = [];
  let curseur = 0;
  for (const trouve of texte.matchAll(motifMarqueur())) {
    const position = trouve.index ?? 0;
    morceaux.push(texte.slice(curseur, position));
    indices.push(Number(trouve[1]));
    curseur = position + trouve[0].length;
  }
  morceaux.push(texte.slice(curseur));

  if (indices.length === 0) {
    if (attendus === 1 && texte.trim() !== '') return [texte.trim()];
    return null;
  }

  // Sentinelle superflue en tête (index 0, rien avant) : on l'ignore.
  if (
    indices.length === attendus &&
    indices[0] === 0 &&
    morceaux[0] !== undefined &&
    morceaux[0].trim() === ''
  ) {
    indices.shift();
    morceaux.shift();
  }

  if (indices.length !== attendus - 1) return null;
  if (morceaux.length !== attendus) return null;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) return null;
  }

  const parties = morceaux.map((morceau) => morceau.trim());
  if (parties.some((partie) => partie === '')) return null;
  return parties;
}

function entierPositif(valeur: number | undefined, defaut: number): number {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return defaut;
  const entier = Math.floor(valeur);
  return entier >= 1 ? entier : defaut;
}
