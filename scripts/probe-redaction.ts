// Sonde technique (temporaire) : effacer le TEXTE d'une page PDF (redaction)
// en conservant images + decorations vectorielles, puis mesurer avec pymupdf.
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const SRC =
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_7091958450d0__OceanofPDF.com_The_Reaper_-__RuNyx.pdf';
const OUT = 'C:/Users/dosso/dev/test-corpus/reaper-redaction-test.pdf';

async function principal() {
  const octets = new Uint8Array(readFileSync(SRC));
  // pdf.js CONSOMME le buffer fourni (le détruit en interne) : on lui passe
  // une copie et on garde les vraies données pour pdf-lib.
  const copiePdfjs = new Uint8Array(octets.slice());

  // 1. Coordonnées du texte via pdf.js (pages 21 et 43, 1-index).
  const tache: any = (pdfjs as any).getDocument({ data: copiePdfjs });
  const doc = await tache.promise;
  const boites: {
    page: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }[] = [];
  for (const num of [21, 43]) {
    const p = await doc.getPage(num);
    const tp = await p.getTextContent();
    let n = 0;
    for (const it of tp.items as any[]) {
      const s = (it.str ?? '').trim();
      if (!s || it.width <= 0) continue;
      const x0 = it.transform[4];
      const y1 = it.transform[5] + it.height;
      boites.push({ page: num, x0, y0: it.transform[5], x1: x0 + it.width, y1 });
      n++;
    }
    console.log(`page ${num}: ${n} boîtes texte`);
  }
  await tache.destroy();

  // 2. pdf-lib : copie des 50 pages, redaction sur 21 & 43.
  const original = await PDFDocument.load(octets, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const dest = await out.copyPages(original, Array.from({ length: 50 }, (_, i) => i));
  for (const page of dest) out.addPage(page);
  for (const b of boites) {
    const page = out.getPage(b.page - 1) as any;
    const marge = 1.2;
    page.markRedaction({
      x: b.x0 - marge,
      y: b.y0 - marge,
      width: b.x1 - b.x0 + 2 * marge,
      height: b.y1 - b.y0 + 2 * marge,
    });
  }
  const t0 = Date.now();
  for (const num of [21, 43]) {
    await (out.getPage(num - 1) as any).applyRedactions({
      ignoreAnnotations: true,
    });
  }
  console.log(
    `applyRedactions : ${Date.now() - t0} ms (2 pages, ${boites.length} boîtes)`
  );
  const bytes = await out.save();
  writeFileSync(OUT, Buffer.from(bytes));
  console.log(`écrit ${OUT} (${(bytes.length / 1024 / 1024).toFixed(1)} Mo)`);
}

principal().catch((e) => {
  console.error('ÉCHEC', e);
  process.exit(1);
});