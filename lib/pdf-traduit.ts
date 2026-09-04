// ============================================================
// pdf-traduit.ts — Génère le PDF TRADUIT du livre.
//
// Sortie : un PDF lisible « façon livre » qui reprend la
// GÉOMÉTRIE de l'original si elle est connue (taille de page,
// marges d'en-bloc), sinon un cadet A4 confortable. Police serif
// (Times), texte JUSTIFIÉ, titres de chapitres centrés,
// lettrine en tête de chapitre. 100% pdf-lib : fonctionne dans le
// navigateur (téléchargement direct) comme dans Node (tests).
//
// NOTE HONNÊTE : une traduction en français est plus longue que
// l'anglais, les coupures de page suivent donc le texte français
// (inévitable pour une traduction) ; en revanche la taille de
// page, les marges et la mise en forme « livre » sont reprises de
// l'original quand il est un PDF.
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

export interface ChapitrePdf {
  titre: string;
  /** Texte traduit (ou source si non traduit). Les paragraphes sont
   *  séparés par un (ou plusieurs) sauts de ligne. */
  texte: string;
}

/** Géométrie de page en points (1 pt = 1/72 po). */
export interface GeoOrigine {
  largeur: number;
  hauteur: number;
  margeGauche: number;
  margeDroite: number;
  margeHaut: number;
  margeBas: number;
}

export interface OptionsPdfTraduit {
  titreLivre: string;
  auteur?: string | null;
  chapitres: ChapitrePdf[];
  /** Géométrie de l'original (si import PDF) pour la reprendre. */
  geo?: GeoOrigine;
  /** Taille de corps en points (défaut 10.5). */
  tailleBase?: number;
  /** Facteur d'interligne (défaut 1.6). */
  interligne?: number;
  /** Justification du texte (défaut true). */
  justification?: boolean;
  /** Lettrine en tête de chapitre (défaut true). */
  lettrine?: boolean;
  /** Progression : (chapitre traité, total). */
  onChapitre?: (traites: number, total: number) => void;
}

// Couleurs « paper book » (neutres chauds, pas du noir brouillon).
const TEXTE = rgb(0.16, 0.13, 0.14);
const TITRE = rgb(0.10, 0.08, 0.10);
const LETTRINE = rgb(0.52, 0.10, 0.18); // grenat
const GRISE = rgb(0.40, 0.40, 0.44);

/** Cadet A4 + marges de lecture confortables (quand pas d'original). */
export function geoDefaut(): GeoOrigine {
  return {
    largeur: 595.28, // A4
    hauteur: 841.89,
    margeGauche: 72,
    margeDroite: 72,
    margeHaut: 82,
    margeBas: 74,
  };
}

/** Découpe un texte en paragraphes non vides. */
function paragraphes(texte: string): string[] {
  return texte
    .replace(/\r\n?/g, '\n')
    .split(/\n{1,}/)
    .map((p) => assainir(p).trim())
    .filter((p) => p.length > 0);
}

/** Caractères invisibles non codables en WinAnsi (explosent pdf-lib). */
const INVISIBLES = /[\u200b\u200c\u200d\u2060\ufeff\u00ad\u180e]/g;

/** Nettoie un texte de ses signes invisibles + espaces multiples. */
function assainir(texte: string): string {
  return texte.replace(INVISIBLES, '').replace(/[ \t]+/g, ' ');
}

/**
 * Enveloppe un texte en MOTS PAR LIGNE selon la largeur disponible.
 * Renvoie des tableaux de mots (pas encore espacés) — l'espacement
 * (justifié) est décidé au dessin.
 */
function envelopperMots(
  police: PDFFont,
  texte: string,
  taille: number,
  maxWidth: number
): string[][] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[][] = [];
  let courant: string[] = [];
  let largeur = 0;
  const espace = police.widthOfTextAtSize(' ', taille);

  for (const mot of mots) {
    const w = police.widthOfTextAtSize(mot, taille);
    if (courant.length > 0 && largeur + espace + w > maxWidth + 0.5) {
      lignes.push(courant);
      courant = [mot];
      largeur = w;
    } else {
      largeur += courant.length > 0 ? espace + w : w;
      courant.push(mot);
    }
  }
  if (courant.length > 0) lignes.push(courant);
  return lignes;
}

/** Enveloppe un texte en LIGNES de CHAÎNES (pour centrage simple). */
function envelopperChaines(
  police: PDFFont,
  texte: string,
  taille: number,
  maxWidth: number
): string[] {
  return envelopperMots(police, texte, taille, maxWidth).map((l) =>
    l.join(' ')
  );
}

export async function genererPdfTraduit(
  opts: OptionsPdfTraduit
): Promise<Uint8Array> {
  const geo = opts.geo ?? geoDefaut();
  const taille = opts.tailleBase ?? 10.5;
  const interligne = opts.interligne ?? 1.6;
  const justifier = opts.justification ?? true;
  const avecLettrine = opts.lettrine ?? true;

  const doc = await PDFDocument.create();
  doc.setTitle(opts.titreLivre);
  doc.setAuthor(opts.auteur || "Plume d'Ombres");
  doc.setCreator("Plume d'Ombres");

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifGras = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItal = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const titreLivre = assainir(opts.titreLivre);
  const auteur = opts.auteur ? assainir(opts.auteur).trim() : '';
  const zoneLargeur = geo.largeur - geo.margeGauche - geo.margeDroite;
  const zoneHauteur = geo.hauteur - geo.margeHaut - geo.margeBas;
  const hautZone = geo.hauteur - geo.margeHaut;
  const basZone = geo.margeBas;
  const lineH = taille * interligne;
  const descente = taille * 0.22;
  const x0 = geo.margeGauche;

  // Pointeur vertical « courant » + gestion des sauts de page.
  let page: PDFPage = doc.addPage([geo.largeur, geo.hauteur]);
  let y = hautZone - taille * 0.82;

  const nouvellePage = () => {
    page = doc.addPage([geo.largeur, geo.hauteur]);
    y = hautZone - taille * 0.82;
  };
  const reserveLigne = () => {
    if (y - lineH < basZone + descente) nouvellePage();
    y -= lineH;
  };
  const reserveEspace = (points: number) => {
    if (y - points < basZone + descente) nouvellePage();
  };

  /** Tiret décoratif centré. */
  const liseret = (cy: number, largeur = 120) => {
    page.drawLine({
      start: { x: geo.largeur / 2 - largeur / 2, y: cy },
      end: { x: geo.largeur / 2 + largeur / 2, y: cy },
      thickness: 0.8,
      color: GRISE,
    });
  };

  // ---------- PAGE DE TITRE ----------
  {
    const tailleTitre = Math.min(30, Math.max(22, zoneLargeur / 14));
    const cy0 = geo.hauteur * 0.64;
    const lignesTitre = envelopperChaines(
      serifGras,
      opts.titreLivre,
      tailleTitre,
      zoneLargeur * 0.82
    );
    let cy = cy0;
    for (const l of lignesTitre) {
      page.drawText(l, {
        x: geo.largeur / 2 - serifGras.widthOfTextAtSize(l, tailleTitre) / 2,
        y: cy,
        size: tailleTitre,
        font: serifGras,
        color: TITRE,
      });
      cy -= tailleTitre * 1.35;
    }
    cy -= 16;
    const sous = 'Traduction française';
    page.drawText(sous, {
      x: geo.largeur / 2 - serifItal.widthOfTextAtSize(sous, 13) / 2,
      y: cy,
      size: 13,
      font: serifItal,
      color: GRISE,
    });
    if (opts.auteur && opts.auteur.trim()) {
      cy -= 28;
      page.drawText(opts.auteur.trim(), {
        x: geo.largeur / 2 - serif.widthOfTextAtSize(opts.auteur.trim(), 12) / 2,
        y: cy,
        size: 12,
        font: serif,
        color: GRISE,
      });
    }
    cy -= 44;
    liseret(cy, 140);
  }

  nouvellePage();

  // ---------- CHAPITRES ----------
  const total = opts.chapitres.length;
  for (let ci = 0; ci < total; ci++) {
    // Titre assaini (un caractère invisible casserait l'encodage).
    const chapitre: ChapitrePdf = {
      ...opts.chapitres[ci],
      titre: assainir(opts.chapitres[ci].titre),
    };
    opts.onChapitre?.(ci, total);

    // Titre de chapitre centré + filets.
    const tailleCh = Math.min(20, Math.max(15, zoneLargeur / 20));
    reserveEspace(tailleCh * 2.2 + 30);
    y -= 10;
    liseret(y, 70);
    y -= tailleCh * 1.5;
    const lignesCh = envelopperChaines(
      serifGras,
      chapitre.titre,
      tailleCh,
      zoneLargeur * 0.8
    );
    for (const l of lignesCh) {
      page.drawText(l, {
        x: geo.largeur / 2 - serifGras.widthOfTextAtSize(l, tailleCh) / 2,
        y,
        size: tailleCh,
        font: serifGras,
        color: TITRE,
      });
      y -= tailleCh * 1.3;
    }
    y -= 8;
    liseret(y, 70);
    y -= taille * 1.3;

    const par = paragraphes(chapitre.texte);
    let premierParagraphe = true;

    for (const paragraphe of par) {
      const estPremier = avecLettrine && premierParagraphe && paragraphe.length > 3;
      premierParagraphe = false;

      // Le corps du paragraphe (moins la lettrine si activée).
      const corps = estPremier ? paragraphe.slice(1) : paragraphe;
      const initiale = estPremier ? paragraphe.charAt(0) : '';

      const lignes = envelopperMots(serif, corps, taille, zoneLargeur);
      if (lignes.length === 0) continue;

      // Largeur réservée pour la lettrine (≈ 2 lignes).
      const dropW = taille * 3 * 0.62;
      const dropH = taille * 3;

      for (let li = 0; li < lignes.length; li++) {
        reserveLigne();
        const mots = lignes[li];
        const estDerniereLigne = li === lignes.length - 1;
        const estDansDrop = estPremier && li < 2;
        const xDebut = estDansDrop ? x0 + dropW : x0;
        const lLargeur = estDansDrop ? zoneLargeur - dropW : zoneLargeur;

        // Lettrine : on la dessine une fois, au niveau de la 1re ligne.
        if (estPremier && li === 0) {
          page.drawText(initiale, {
            x: x0,
            y: y + dropH * 0.18,
            size: taille * 3,
            font: serifGras,
            color: LETTRINE,
          });
        }

        // Mot plus large que la ligne (rare) : on le laisse déborder.
        if (estDerniereLigne || !justifier) {
          // Alignement gauche.
          const texte = mots.join(' ');
          page.drawText(texte, {
            x: xDebut,
            y,
            size: taille,
            font: serif,
            color: TEXTE,
          });
        } else {
          // JUSTIFICATION : répartir l'espace entre chaque mot.
          const totalMots = mots.reduce(
            (s, m) => s + serif.widthOfTextAtSize(m, taille),
            0
          );
          const nbEspaces = mots.length - 1;
          const espaceMots =
            nbEspaces > 0 ? (lLargeur - totalMots) / nbEspaces : 0;
          let cx = xDebut;
          for (let mi = 0; mi < mots.length; mi++) {
            const w = serif.widthOfTextAtSize(mots[mi], taille);
            page.drawText(mots[mi], {
              x: cx,
              y,
              size: taille,
              font: serif,
              color: TEXTE,
            });
            cx += w + espaceMots;
          }
        }
      }

      // Espace inter-paragraphes (saut de page géré par réserve ligne).
      reserveEspace(taille * 0.55);
    }

    // Saut de page entre chapitres (pas après le dernier, cosmétique).
    if (ci < total - 1) nouvellePage();
  }

  // Numéro de page au pied (champs simples).
  for (const p of doc.getPages()) {
    const num = doc.getPages().indexOf(p) + 1;
    const label = String(num);
    p.drawText(label, {
      x: p.getWidth() / 2 - serif.widthOfTextAtSize(label, 9) / 2,
      y: 40,
      size: 9,
      font: serifItal,
      color: GRISE,
    });
  }

  return await doc.save();
}