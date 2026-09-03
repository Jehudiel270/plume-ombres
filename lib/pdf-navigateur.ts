// ============================================================
// pdf-navigateur.ts — Extraction PDF côté navigateur (pdf.js).
// Chargé dynamiquement (à la demande) par la zone d'import pour
// ne pas alourdir le chargement initial de l'application.
// ============================================================

import * as pdfjs from 'pdfjs-dist';
import { extraireTexteDocument, type DocumentPdf } from './texte-pdf';

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
