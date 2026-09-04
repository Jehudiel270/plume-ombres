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