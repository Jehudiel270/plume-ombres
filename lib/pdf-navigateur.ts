// ============================================================
// pdf-navigateur.ts — Extraction PDF côté navigateur (pdf.js).
// Chargé dynamiquement (à la demande) par la zone d'import pour
// ne pas alourdir le chargement initial de l'application.
// ============================================================

import * as pdfjs from 'pdfjs-dist';
import { extraireTexteDocument, type DocumentPdf } from './texte-pdf';
import { calculerGeo, type PageBrute, type GeoOrigine } from './geo-pdf';

/**
 * Mesure la géométrie d'un PDF (dimensions + marges d'en-bloc) pour la
 * reproduire dans le PDF traduit. Le calcul lui-même vit dans
 * `geo-pdf.calculerGeo` ; ici on se contente de « sonder » les
 * `maxPages` premières pages via pdf.js et de livrer des boîtes brutes
 * en points (origine bas-gauche, convention PDF).
 */
export async function mesurerOriginalPdf(
  donnees: ArrayBuffer | Uint8Array,
  maxPages: number = 8
): Promise<GeoOrigine | null> {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const tache: any = (pdfjs as any).getDocument({ data: donnees });
  const doc = await tache.promise;
  try {
    const n = Math.min(maxPages, doc.numPages);
    const pages: PageBrute[] = [];
    for (let i = 1; i <= n; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      const contenu = await p.getTextContent();
      const items = (contenu.items as Array<{
        transform: number[];
        width: number;
        height: number;
        str?: string;
      }>)
        .filter((it) => (it.str ?? '').trim() !== '' && it.width > 0)
        // Convention PDF : origine bas-gauche, y positif vers le haut.
        .map((it) => ({
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          h: it.height,
        }));
      pages.push({ largeur: vp.width, hauteur: vp.height, items });
    }
    return calculerGeo(pages);
  } finally {
    await doc.destroy?.();
  }
}

/**
 * Extrait le texte d'un fichier PDF (données brutes du fichier).
 * @param donnees    contenu binaire du PDF (ArrayBuffer / Uint8Array)
 * @param onPage     progression (page traitée, total)
 */
export async function extraireTextePdfNavigateur(
  donnees: ArrayBuffer | Uint8Array,
  onPage?: (page: number, total: number) => void
): Promise<string> {
  // Le worker (copié dans /public) fait l'extraction hors du fil
  // principal (UI fluide). Voir README si la version de pdf.js change.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const tache = pdfjs.getDocument({ data: donnees });
  const documentPdf = (await tache.promise) as unknown as DocumentPdf;
  try {
    return await extraireTexteDocument(documentPdf, { onPage });
  } finally {
    await documentPdf.destroy?.().catch(() => undefined);
  }
}
