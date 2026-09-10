// ============================================================
// texte-pdf.ts — Extraction du texte d'un PDF (cœur partagé).
// Ne dépend d'aucun module pdf.js : il reçoit un « document »
// compatible (PDFDocumentProxy de pdf.js, navigateur ou Node).
//
// En plus de la lecture des lignes (hasEOL de pdf.js), ce module
// DÉTECTE LES PARAGRAPHES par deux signaux universels :
//   1. le RETRAIT de première ligne (indentation à gauche) ;
//   2. le SAUT VERTICAL anormal entre deux lignes (interligne
//      nettement supérieur au pas courant — paragraphes séparés
//      par un espacement vertical plutôt que par indentation).
// Les deux conventions d'édition sont donc couvertes, sans aucun
// réglage propre à un livre : tout est mesuré sur le document.
// ============================================================

interface PageTexte {
  getTextContent(): Promise<{ items: unknown[] }>;
}

export interface DocumentPdf {
  numPages: number;
  getPage(numero: number): Promise<PageTexte>;
  destroy?(): Promise<void>;
}

export interface OptionsExtraction {
  /** Page de départ (0 = première). */
  debut?: number;
  /** Dernière page à traiter (exclue) — défaut : toutes. */
  fin?: number;
  /** Progression : (pageCourante, totalPages). */
  onPage?: (page: number, total: number) => void;
}

/** Item brut sorti de pdf.js (sous-ensemble des champs utilisés). */
export interface ItemPdf {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
}

/** Ligne visuelle reconstruite (mots joints, position mesurée). */
export interface LignePdf {
  texte: string;
  /** x (points) du premier caractère — la marge gauche de la ligne. */
  x: number;
  /** y (points) de la baseline — la position verticale de la ligne. */
  y: number;
}

/** Lignes parasites typiques des PDF « gratuits » (filigranes…). */
const LIGNE_PARASITE =
  /^(oceanofpdf\.com|www\.[^\s]+|downloaded from[^\n]*|scan(ner|ned)? (by|from)[^\n]*)$/i;

/** Nettoie le texte extrait d'une page (filigranes, espaces multiples). */
export function nettoyerTextePdf(texte: string): string {
  return texte
    .split('\n')
    .filter((l) => !LIGNE_PARASITE.test(l.trim()))
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');
}

/**
 * Regroupe les items pdf.js en lignes visuelles (frontière = hasEOL),
 * en mémorisant la position (x, y) de chaque ligne. C'est la donnée
 * nécessaire à la détection des paragraphes par indentation ET par
 * saut vertical.
 */
export function grouperLignes(items: ItemPdf[]): LignePdf[] {
  const lignes: LignePdf[] = [];
  let texte = '';
  let x = 0;
  let y = 0;
  let origine = false;
  for (const brut of items) {
    const mot = brut.str ?? '';
    if (!origine && mot.trim() !== '') {
      x = brut.transform?.[4] ?? 0;
      y = brut.transform?.[5] ?? 0;
      origine = true;
    }
    texte += (texte !== '' && mot !== '' ? ' ' : '') + mot;
    if (brut.hasEOL) {
      lignes.push({ texte, x, y });
      texte = '';
      x = 0;
      y = 0;
      origine = false;
    }
  }
  if (texte.trim() !== '') lignes.push({ texte, x, y });
  return lignes;
}

/** Retrait minimal (points) signalant un début de paragraphe. */
const SEUIL_INDENT = 8;
/** Longueur minimale (car.) d'une ligne de corps pour la détection. */
const LONGUEUR_CORPS = 30;
/** Rapport gap/interligne au-delà duquel on considère un saut de ¶. */
const RAPPORT_SAUT = 1.6;

/** Valeur dominante (mode) d'une liste, arrondie au demi-point. */
function mode(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const freq = new Map<number, number>();
  for (const v of valeurs) {
    const cle = Math.round(v * 2) / 2;
    freq.set(cle, (freq.get(cle) ?? 0) + 1);
  }
  let meilleur: number | null = null;
  let max = 0;
  for (const [cle, n] of freq) if (n > max) { max = n; meilleur = cle; }
  return meilleur;
}

/**
 * Insère les séparateurs de paragraphe (ligne vide) dans une liste de
 * lignes. Deux signaux, mesurés sur le document (aucun réglage par
 * livre) :
 *   - indentation : une ligne dont la marge gauche dépasse la marge de
 *     corps (mode des x) du retrait est un début de paragraphe ;
 *   - saut vertical : une ligne dont l'écart à la ligne précédente est
 *     nettement supérieur à l'interligne courant (mode des pas) est un
 *     début de paragraphe (convention « ligne vide »).
 * Les lignes vides réellement présentes dans le flux sont conservées.
 */
export function insererParagraphes(lignes: LignePdf[]): string {
  const propres = lignes.filter((l) => !LIGNE_PARASITE.test(l.texte.trim()));
  const pleines = propres.filter(
    (l) => l.texte.trim().length >= LONGUEUR_CORPS
  );
  if (pleines.length < 3) {
    // Pas assez de corps de texte : comportement historique (lignes
    // simplement jointes — page de garde, sommaire, etc.).
    return propres.map((l) => l.texte).join('\n');
  }

  // Marge de corps = position gauche dominante (mode des x).
  const marge = mode(pleines.map((l) => l.x)) ?? 0;

  // Interligne courant = mode des pas verticaux entre lignes pleines
  // successives (dans l'ordre de lecture). Un pas anormalement grand
  // (> RAPPORT_SAUT × interligne) signale un saut de paragraphe.
  const pas: number[] = [];
  for (let i = 1; i < pleines.length; i++) {
    const d = Math.abs(pleines[i].y - pleines[i - 1].y);
    if (d > 0.5) pas.push(d);
  }
  const interligne = mode(pas);
  const seuilSaut = interligne !== null ? interligne * RAPPORT_SAUT : null;

  // Lignes pleines marquées « début de paragraphe » par le saut vertical.
  const debutParSaut = new Set<LignePdf>();
  if (seuilSaut !== null) {
    for (let i = 1; i < pleines.length; i++) {
      const d = Math.abs(pleines[i].y - pleines[i - 1].y);
      if (d > seuilSaut) debutParSaut.add(pleines[i]);
    }
  }

  const morceaux: string[] = [];
  for (const l of propres) {
    const t = l.texte.trim();
    if (t === '') {
      // Ligne vide réelle = séparateur de paragraphe explicite.
      if (morceaux.length > 0 && morceaux[morceaux.length - 1] !== '') {
        morceaux.push('');
      }
      continue;
    }
    const lignePleine = t.length >= LONGUEUR_CORPS;
    const indente = lignePleine && l.x > marge + SEUIL_INDENT;
    const saut = lignePleine && debutParSaut.has(l);
    const debutParagraphe = indente || saut;
    if (
      debutParagraphe &&
      morceaux.length > 0 &&
      morceaux[morceaux.length - 1] !== ''
    ) {
      morceaux.push('');
    }
    morceaux.push(l.texte);
  }
  return morceaux.join('\n');
}

/**
 * Texte d'une page : lignes regroupées, paragraphes détectés, filigranes
 * retirés. Point d'entrée commun utilisé à la fois par l'import
 * (`extraireTexteDocument`) et par le scanner du PDF fidèle
 * (`scannerPagesFideles`) — la parité d'extraction est indispensable à
 * l'alignement exact de l'export fidèle.
 */
export function extraireTextePage(items: ItemPdf[]): string {
  return nettoyerTextePdf(insererParagraphes(grouperLignes(items)));
}

/**
 * Extrait tout le texte du document PDF.
 * Les mots sont séparés par des espaces, chaque ligne visuelle par un
 * retour à la ligne (hasEOL de pdf.js) et chaque PARAGRAPHE par une
 * ligne vide (détecté par indentation ou saut vertical) — la structure
 * en paragraphes est donc reconstruite pour le découpage.
 */
export async function extraireTexteDocument(
  documentPdf: DocumentPdf,
  options: OptionsExtraction = {}
): Promise<string> {
  const debut = options.debut ?? 0;
  const fin = Math.min(options.fin ?? documentPdf.numPages, documentPdf.numPages);
  const pages: string[] = [];

  for (let i = debut; i < fin; i++) {
    options.onPage?.(i + 1, documentPdf.numPages);
    const page = await documentPdf.getPage(i + 1); // pdf.js est 1-indexé
    const contenu = await page.getTextContent();
    pages.push(extraireTextePage(contenu.items as ItemPdf[]));
  }

  return pages.join('\n');
}
