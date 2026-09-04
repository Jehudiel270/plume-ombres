// ============================================================
// geo-pdf.ts — Calcul de la géométrie d'un PDF (source unique).
//
// Le calcul de la géométrie (dimensions de page + marges d'en-bloc)
// est DÉCOUPLÉ de l'extraction pdf.js : il reçoit des mesures brutes
// normalisées et renvoie un GeoOrigine. Ainsi il est :
//  - testable en Node (sans navigateur ni worker),
//  - réutilisable côté navigateur (mesurerOriginalPdf le fed).
//
// Une « page mesurée » est exprimée en points PDF (1 pt = 1/72 po),
// origine en BAS-GAUCHE, axes positifs x à droite et y en haut :
//   - largeur / hauteur : boiter de la page (médiabox),
//   - items : boiter de chaque morceau de texte lisible (x,y = coin
//     bas-gauche, w,h = dimension).
// Les marges d'en-bloc = distance entre le bord de la page et la
// boiter convexe de tous les items (bornée à 25 % de la page).
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

  return {
    largeur: Math.round(lg),
    hauteur: Math.round(hg),
    margeGauche: borne(minX, lg),
    margeDroite: borne(lg - maxX, lg),
    // pdf.js exprime y depuis le bas : marge haute (depui le haut) = hg - maxY.
    margeHaut: borne(hg - maxY, hg),
    margeBas: borne(minY, hg),
  };
}