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