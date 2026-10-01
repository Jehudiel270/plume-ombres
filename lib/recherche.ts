// ============================================================
// recherche.ts — Recherche plein texte dans un texte de chapitre.
//
// 100 % déterministe et testable en Node (aucune dépendance
// DOM) : le moteur produit des plages de caractères [debut, fin)
// positionnées dans le TEXTE BRUT ; le composant lecteur s'en
// charge de la navigation et du surlignage visuel.
//
// Règles :
//  - insensible à la casse et aux accents (normalisation NFD,
//    suppression des diacritiques),
//  - recherche dans le mot (ex. « ombre » trouve « ombres »),
//  - résultats triés par position, sans chevauchement.
// ============================================================

/** Plage [début, fin) dans le texte brut. */
export interface Plaque {
  debut: number;
  fin: number;
}

/**
 * Normalise une chaîne pour la comparaison : minuscules, sans
 * diacritiques. Renvoie aussi une TABLE D'INDEX :
 * `table[i]` = position (en unités de code) dans le TEXTE ORIGINAL
 * du caractère `i` de la chaîne normalisée. La table compense la
 * disparition des diacritiques (décomposition NFD : caractère
 * combiné → caractère de base + marque, seule la base survit).
 */
export function normaliser(texte: string): {
  normalise: string;
  table: number[];
} {
  const table: number[] = [];
  let normalise = '';
  // Par POINTS DE CODE (les paires de suppléants restent entières).
  let position = 0;
  for (const codePoint of Array.from(texte)) {
    const nfd = codePoint.normalize('NFD');
    for (const car of Array.from(nfd)) {
      const code = car.codePointAt(0) ?? 0;
      // Marque diacritique (U+0300 → U+036f) : elle ne survit pas à
      // la normalisation, elle ne fait donc pas avancer la position.
      if (code >= 0x0300 && code <= 0x036f) continue;
      table.push(position);
      normalise += car.toLowerCase();
    }
    position += codePoint.length;
  }
  return { normalise, table };
}

/**
 * Trouve toutes les occurrences de `terme` dans `texte`.
 * @returns plages [debut, fin) dans le texte brut, triées, sans
 * chevauchement.
 */
export function chercherTermes(texte: string, terme: string): Plaque[] {
  const requete = terme.trim();
  if (requete.length < 2) return []; // 1 caractère = trop de bruit

  const { normalise, table } = normaliser(texte);
  const requeteNorm = normaliser(requete).normalise;
  if (requeteNorm.length === 0) return [];
  const resultats: Plaque[] = [];

  let position = 0;
  while (position <= normalise.length - requeteNorm.length) {
    const trouve = normalise.indexOf(requeteNorm, position);
    if (trouve === -1) break;
    const debut = table[trouve];
    const fin = table[trouve + requeteNorm.length - 1] + 1;
    resultats.push({ debut, fin });
    // Saut anti-chevauchement : on repart après la fin trouvée.
    position = trouve + requeteNorm.length;
  }
  return resultats;
}

/**
 * Extrait un contexte lisible (une ligne) autour d'une plaque,
 * pour la liste des résultats et l'accessibilité.
 */
export function extraireContexte(
  texte: string,
  plaque: Plaque,
  marge = 80
): string {
  const debut = Math.max(0, plaque.debut - marge);
  const fin = Math.min(texte.length, plaque.fin + marge);
  return (
    (debut > 0 ? '…' : '') +
    texte.slice(debut, fin).replace(/\s+/g, ' ') +
    (fin < texte.length ? '…' : '')
  );
}

// ============================================================
// Recherche PLEIN LIVRE (tous les chapitres d'un coup).
//
// Le moteur réutilise `chercherTermes` (accents ignorés, casse
// ignorée) et agrège les occurrences par chapitre, avec pour
// chaque chapitre :
//  - son identifiant et sa position (→ lien direct),
//  - une ancre stable (`chapitre-<position>`) pour le saut,
//  - le NOMBRE TOTAL d'occurrences (comptage exact),
//  - des EXTRAITS avec contexte (plafonnés pour la charge utile).
// ============================================================

/** Chapitre minimal attendu par la recherche plein livre. */
export interface ChapitreRecherche {
  /** Identifiant du chapitre en base. */
  id: string;
  /** Position dans le livre (0 = premier). */
  position: number;
  /** Titre affiché. */
  titre: string;
  /** Texte à parcourir (traduit de préférence). */
  texte: string;
}

/** Un extrait : plaque (pour surligner) + contexte textuel. */
export interface ExtraitRecherche {
  /** Plage [debut, fin) dans le texte du chapitre. */
  plaque: Plaque;
  /** Contexte lisible autour de l'occurrence. */
  contexte: string;
}

/** Résultat de recherche pour un chapitre donné. */
export interface ResultatChapitreRecherche {
  chapitreId: string;
  position: number;
  titre: string;
  /** Ancre de lien direct (ex. « chapitre-3 »). */
  ancre: string;
  /** Nombre TOTAL d'occurrences dans ce chapitre. */
  nbOccurrences: number;
  /** Extraits avec contexte (plafonnés). */
  extraits: ExtraitRecherche[];
}

/** Résultat global d'une recherche plein livre. */
export interface ResultatRechercheLivre {
  /** Terme recherché (tel que saisi, rogné). */
  terme: string;
  /** Somme des occurrences sur tout le livre. */
  totalOccurrences: number;
  /** Nombre de chapitres contenant au moins une occurrence. */
  nbChapitresTouches: number;
  /** Chapitres touchés, dans l'ordre de lecture. */
  chapitres: ResultatChapitreRecherche[];
}

/** Préfixe des ancres de chapitre (liens directs). */
export const ANCRE_CHAPITRE_PREFIXE = 'chapitre-';

/** Ancre de lien direct vers un chapitre (position 0 → « chapitre-1 »). */
export function ancreChapitre(position: number): string {
  return `${ANCRE_CHAPITRE_PREFIXE}${position + 1}`;
}

/**
 * Recherche un terme dans TOUS les chapitres d'un livre.
 *
 * @param chapitres chapitres du livre (tout ordre ; triés par position)
 * @param terme     terme recherché (accents/casse ignorés, min. 2 car.)
 * @param options   `maxExtraitsParChapitre` (défaut 20) et `marge` du
 *                  contexte (défaut 80) — le comptage reste exact même
 *                  quand les extraits sont plafonnés.
 */
export function chercherDansLivre(
  chapitres: ChapitreRecherche[],
  terme: string,
  options: { maxExtraitsParChapitre?: number; marge?: number } = {}
): ResultatRechercheLivre {
  const requete = terme.trim();
  const maxExtraits = Math.max(1, options.maxExtraitsParChapitre ?? 20);
  const marge = options.marge ?? 80;

  const vide: ResultatRechercheLivre = {
    terme: requete,
    totalOccurrences: 0,
    nbChapitresTouches: 0,
    chapitres: [],
  };
  if (requete.length < 2) return vide;

  const ordonnes = [...chapitres].sort((a, b) => a.position - b.position);
  const resultats: ResultatChapitreRecherche[] = [];
  let total = 0;

  for (const chapitre of ordonnes) {
    const plaques = chercherTermes(chapitre.texte, requete);
    if (plaques.length === 0) continue;
    total += plaques.length;
    resultats.push({
      chapitreId: chapitre.id,
      position: chapitre.position,
      titre: chapitre.titre,
      ancre: ancreChapitre(chapitre.position),
      nbOccurrences: plaques.length,
      extraits: plaques.slice(0, maxExtraits).map((plaque) => ({
        plaque,
        contexte: extraireContexte(chapitre.texte, plaque, marge),
      })),
    });
  }

  return {
    terme: requete,
    totalOccurrences: total,
    nbChapitresTouches: resultats.length,
    chapitres: resultats,
  };
}