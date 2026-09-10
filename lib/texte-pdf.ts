// ============================================================
// texte-pdf.ts — Extraction du texte d'un PDF (cœur partagé).
// Ne dépend d'aucun module pdf.js : il reçoit un « document »
// compatible (PDFDocumentProxy de pdf.js, navigateur ou Node).
//
// En plus de la lecture des lignes (hasEOL de pdf.js), ce module
// DÉTECTE LES PARAGRAPHES par le retrait de première ligne : dans
// un livre imprimé, les paragraphes ne sont PAS séparés par des
// lignes vides mais signalés par l'indentation de la première
// ligne. Sans cette détection, tout le chapitre devient un seul
// bloc de texte et la traduction perd la mise en forme.
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

/** Ligne visuelle reconstruite (mots joints, marge gauche mesurée). */
export interface LignePdf {
  texte: string;
  /** x (points) du premier caractère — la marge gauche de la ligne. */
  x: number;
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
 * en mémorisant la marge gauche (x) de chaque ligne. C'est la donnée
 * nécessaire à la détection des paragraphes par indentation.
 */
export function grouperLignes(items: ItemPdf[]): LignePdf[] {
  const lignes: LignePdf[] = [];
  let texte = '';
  let x = 0;
  let xVu = false;
  for (const brut of items) {
    const mot = brut.str ?? '';
    if (!xVu && mot.trim() !== '') {
      x = brut.transform?.[4] ?? 0;
      xVu = true;
    }
    texte += (texte !== '' && mot !== '' ? ' ' : '') + mot;
    if (brut.hasEOL) {
      lignes.push({ texte, x });
      texte = '';
      x = 0;
      xVu = false;
    }
  }
  if (texte.trim() !== '') lignes.push({ texte, x });
  return lignes;
}

/** Retrait minimal (points) signalant un début de paragraphe. */
const SEUIL_INDENT = 8;
/** Longueur minimale (car.) d'une ligne de corps pour la détection. */
const LONGUEUR_CORPS = 30;

/**
 * Insère les séparateurs de paragraphe (ligne vide) dans une liste de
 * lignes. Dans un livre imprimé, les paragraphes sont signalés par le
 * RETRAIT de première ligne, pas par une ligne vide : une ligne dont la
 * marge gauche dépasse la marge de corps du retrait est un début de
 * paragraphe. La marge de corps est la position gauche dominante des
 * lignes pleines (mode des x).
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

  // Marge de corps = position gauche dominante (mode des x arrondis).
  const freq = new Map<number, number>();
  for (const l of pleines) {
    const cle = Math.round(l.x * 2) / 2;
    freq.set(cle, (freq.get(cle) ?? 0) + 1);
  }
  let marge = 0;
  let max = 0;
  for (const [x, n] of freq) if (n > max) { max = n; marge = x; }

  const morceaux: string[] = [];
  for (const l of propres) {
    const t = l.texte.trim();
    if (t === '') continue; // ligne vide (rare dans un PDF texte)
    const debutParagraphe =
      t.length >= LONGUEUR_CORPS && l.x > marge + SEUIL_INDENT;
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
 * Texte d'une page : lignes regroupées, paragraphes détectés par
 * indentation, filigranes retirés. Point d'entrée commun utilisé à la
 * fois par l'import (`extraireTexteDocument`) et par le scanner du
 * PDF fidèle (`scannerPagesFideles`) — la parité d'extraction est
 * indispensable à l'alignement exact de l'export fidèle.
 */
export function extraireTextePage(items: ItemPdf[]): string {
  return nettoyerTextePdf(insererParagraphes(grouperLignes(items)));
}

/**
 * Extrait tout le texte du document PDF.
 * Les mots sont séparés par des espaces, chaque ligne visuelle par un
 * retour à la ligne (hasEOL de pdf.js) et chaque PARAGRAPHE par une
 * ligne vide (détecté par l'indentation de première ligne) — la
 * structure en paragraphes est donc reconstruite pour le découpage.
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
