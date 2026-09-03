// ============================================================
// texte-pdf.ts — Extraction du texte d'un PDF (cœur partagé).
// Ne dépend d'aucun module pdf.js : il reçoit un « document »
// compatible (PDFDocumentProxy de pdf.js, navigateur ou Node).
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
 * Extrait tout le texte du document PDF.
 * Les mots sont séparés par des espaces et chaque ligne visuelle par un
 * retour à la ligne (hasEOL de pdf.js) — la structure en paragraphes est
 * ensuite reconstruite par le découpeur de chapitres habituel.
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
    let ligne = '';
    const lignes: string[] = [];

    for (const brut of contenu.items as Array<{
      str?: string;
      hasEOL?: boolean;
    }>) {
      const mot = brut.str ?? '';
      ligne += (ligne && mot ? ' ' : '') + mot;
      if (brut.hasEOL) {
        lignes.push(ligne);
        ligne = '';
      }
    }
    if (ligne) lignes.push(ligne);

    pages.push(nettoyerTextePdf(lignes.join('\n')));
  }

  return pages.join('\n');
}
