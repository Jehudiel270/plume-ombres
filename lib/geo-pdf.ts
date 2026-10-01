// ============================================================
// geo-pdf.ts — Calcul de la géométrie d'un PDF (source unique).
//
// Le calcul de la géométrie (dimensions de page + marges d'en-bloc)
// est DÉCOUPLÉ de l'extraction pdf.js : il reçoit des mesures brutes
// normalisées et renvoie un GeoOrigine. Ainsi il est :
//  - testable en Node (sans navigateur ni worker),
//  - réutilisable côté navigateur : mesurerOriginalPdf le fed À
//    L'IMPORT PDF (fichier en mémoire) ; `resumerGeo` en tire les 3
//    nombres stockés en base, que l'export relit via
//    `geoDepuisLivre` — le binaire n'est plus nécessaire.
//
// Une « page mesurée » est exprimée en points PDF (1 pt = 1/72 po),
// origine en BAS-GAUCHE, axes positifs x à droite et y en haut :
//   - largeur / hauteur : boiter de la page (médiabox),
//   - items : boiter de chaque morceau de texte lisible (x,y = coin
//     bas-gauche, w,h = dimension, dy = hauteur de la boîte text).
// Les marges d'en-bloc = distance entre le bord de la page et la
// box convexe de tous les items (bornée à 25 % de la page).
// La taille du corps et l'interligne sont estimés sur les pages
// « pleines » (≥ 30 items de texte) : pages de corps typiques.
// ============================================================

import type { GeoOrigine } from './pdf-traduit';
export type { GeoOrigine } from './pdf-traduit';

export interface ItemBrut {
  /** x du coin bas-gauche de la boîte de texte (points). */
  x: number;
  /** y du coin bas-gauche de la boîte de texte (points). */
  y: number;
  /** largeur de la boîte (points). */
  w: number;
  /** hauteur de la boîte (points). */
  h: number;
  /** hauteur de la boîte de texte selon le moteur (≈ taille de police). */
  dy: number;
}

export interface PageBrute {
  /** largeur de la page (points). */
  largeur: number;
  /** hauteur de la page (points). */
  hauteur: number;
  /** boiter des morceaux de texte lisible (origine bas-gauche). */
  items: ItemBrut[];
}

/**
 * Calcule la géométrie (dimension + marges d'en-bloc) d'un PDF à partir
 * des pages mesurées. Retourne null si aucune page ne contient de texte.
 * @param pages  mesures brutes des pages (≥ 1 recommandée, 6~20 idéales)
 */
export function calculerGeo(pages: PageBrute[]): GeoOrigine | null {
  // On considère uniquement les pages avec au moins un item de texte.
  const utiles = pages.filter((p) => p.items.length > 0);
  if (utiles.length === 0) return null;

  let lg = 0;
  let hg = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of utiles) {
    lg = Math.max(lg, p.largeur);
    hg = Math.max(hg, p.hauteur);
    for (const it of p.items) {
      minX = Math.min(minX, it.x);
      maxX = Math.max(maxX, it.x + it.w);
      minY = Math.min(minY, it.y);
      maxY = Math.max(maxY, it.y + it.h);
    }
  }
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    return null;
  }

  // Borne les marges : jamais < 20 pts (confort) ni > 25 % de la page
  // (évite qu'une page quasi vide ne gonfle la marge).
  const borne = (valeur: number, dimension: number) =>
    Math.round(Math.min(Math.max(valeur, 20), dimension * 0.25));

  // --- Taille du corps, mesurée sur les pages « pleines » (≥ 30 items) ---
  // dy ≈ taille de police (échelle de l'objet de texte). On prend la
  // médiane des valeurs dominantes : les pages de corps l'emportent
  // numériquement sur les pages de titres.
  const pagesPleines = pages.filter((p) => p.items.length >= 30);
  let tailleCorps: number | undefined;
  if (pagesPleines.length > 0) {
    const tousDy = pagesPleines
      .flatMap((p) => p.items.map((it) => it.dy))
      .filter((v) => v > 0);
    if (tousDy.length > 0) {
      // Plus fréquente (arrondie au 0.5 pt), puis médiane de ce groupe.
      const parCle = new Map<number, number[]>();
      for (const v of tousDy) {
        const cle = Math.round(v * 2) / 2;
        const liste = parCle.get(cle) ?? [];
        liste.push(v);
        parCle.set(cle, liste);
      }
      const dominante = [...parCle.entries()].sort(
        (a, b) => b[1].length - a[1].length
      )[0];
      if (dominante) {
        const valeurs = [...dominante[1]].sort((a, b) => a - b);
        tailleCorps = Math.round(valeurs[Math.floor(valeurs.length / 2)] * 10) / 10;
      }
    }
  }

  // --- Hauteur de ligne : médiane des pas entre baselines (pages pleines). ---
  // it.y est la baseline dans la convention pdf.js/PDF utilisée ici.
  let hauteurLigne: number | undefined;
  if (pagesPleines.length > 0) {
    const tousPas: number[] = [];
    for (const p of pagesPleines) {
      const ys = [
        ...new Set(p.items.map((it) => Math.round(it.y * 10) / 10)),
      ].sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        const pas = ys[i] - ys[i - 1];
        // Pas « normaux » : >= corps (interligne) mais pas un saut de bloc
        // (pas > corps x 1.8 serait un espace de paragraphe / de titre).
        if (tailleCorps ? pas >= tailleCorps * 0.9 && pas <= tailleCorps * 1.8 : true) {
          tousPas.push(Math.round(pas * 10) / 10);
        }
      }
    }
    if (tousPas.length > 0) {
      const pas = [...tousPas].sort((a, b) => a - b);
      hauteurLigne = Math.round(pas[Math.floor(pas.length / 2)] * 10) / 10;
    }
  }

  return {
    largeur: Math.round(lg),
    hauteur: Math.round(hg),
    margeGauche: borne(minX, lg),
    margeDroite: borne(lg - maxX, lg),
    // pdf.js exprime y depuis le bas : marge haute (depuis le haut) = hg - maxY.
    margeHaut: borne(hg - maxY, hg),
    margeBas: borne(minY, hg),
    ...(tailleCorps !== undefined ? { tailleCorps } : {}),
    ...(hauteurLigne !== undefined ? { hauteurLigne } : {}),
  };
}

// ============================================================
// Géométrie STOCKÉE EN BASE — 3 nombres, plus aucun binaire.
//
// À l'import d'un PDF (fichier en mémoire), on mesure la géométrie
// (calculerGeo) puis on la RÉSUME en 3 nombres enregistrés sur la
// ligne `livres` : largeur, hauteur, marge d'en-bloc. À l'export, on
// relit ces 3 nombres et on RECONSTRUIT une GeoOrigine complète —
// jamais depuis un fichier stocké côté serveur.
//
// NB : la marge d'en-bloc est unique (appliquée aux 4 bords) ; c'est
// le contrat « 3 nombres ». Une restitution fidèle par bord
// (G/D/H/B) serait une suite possible, hors périmètre.
// ============================================================

/** Colonnes `public.livres` portant la géométrie résumée. */
export const COLONNES_GEOMETRIE = [
  'pdf_largeur',
  'pdf_hauteur',
  'pdf_marge',
] as const;

/** Les 3 nombres tels qu'enregistrés sur la ligne `livres`. */
export interface GeometrieStockee {
  /** Largeur de page (points). */
  largeur: number;
  /** Hauteur de page (points). */
  hauteur: number;
  /** Marge d'en-bloc, appliquée aux 4 bords (points). */
  margeEnBloc: number;
}

/** Ligne `livres` réduite aux 3 colonnes de géométrie. */
export interface LigneGeometrie {
  pdf_largeur: number | null;
  pdf_hauteur: number | null;
  pdf_marge: number | null;
}

/**
 * Résume une géométrie mesurée en 3 nombres STOCKABLES.
 * Retourne null si la géométrie est absente (import non-PDF, PDF
 * sans texte) — dans ce cas rien n'est écrit en base.
 */
export function resumerGeo(geo: GeoOrigine | null): GeometrieStockee | null {
  if (!geo) return null;
  if (!(geo.largeur > 0) || !(geo.hauteur > 0)) return null;
  // La marge latérale (gauche) représente l'en-bloc : pages de corps
  // justifiées → margeGauche ≈ margeDroite ≈ bord du bloc de texte.
  return {
    largeur: Math.round(geo.largeur),
    hauteur: Math.round(geo.hauteur),
    margeEnBloc: Math.round(geo.margeGauche),
  };
}

/**
 * Reconstruit une GeoOrigine depuis les 3 nombres stockés.
 * Retourne null si l'un des 3 manque (→ l'export retombe sur A4).
 */
export function geoDepuisStockage(
  g: GeometrieStockee | null | undefined
): GeoOrigine | null {
  if (!g) return null;
  const { largeur, hauteur, margeEnBloc } = g;
  if (!Number.isFinite(largeur) || largeur <= 0) return null;
  if (!Number.isFinite(hauteur) || hauteur <= 0) return null;
  const marge = Number.isFinite(margeEnBloc) ? Math.max(0, margeEnBloc) : 0;
  return {
    largeur: Math.round(largeur),
    hauteur: Math.round(hauteur),
    margeGauche: marge,
    margeDroite: marge,
    margeHaut: marge,
    margeBas: marge,
  };
}

/** Reconstruit la géométrie depuis une ligne `livres` (lecture export). */
export function geoDepuisLivre(l: LigneGeometrie): GeoOrigine | null {
  if (l.pdf_largeur == null || l.pdf_hauteur == null || l.pdf_marge == null) {
    return null;
  }
  return geoDepuisStockage({
    largeur: l.pdf_largeur,
    hauteur: l.pdf_hauteur,
    margeEnBloc: l.pdf_marge,
  });
}