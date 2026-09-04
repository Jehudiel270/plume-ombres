// Vérification du mécanisme exact du bug prod : buffer partagé entre
// pdf.js (aperçu) et pdf-lib (moteur). Dans la version navigateur,
// pdf.js transfère l'ArrayBuffer au worker → détaché côté main.
// On rejoue ici la suite EXACTE d'export-fidele.ts (mêmes objets,
// même ordre) et on observe ce que reçoit pdf-lib.
import fs from 'node:fs';
import { getDocument as pdfjsGetDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

const PDF = [
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_7091958450d0__OceanofPDF.com_The_Reaper_-__RuNyx.pdf',
  'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf',
].find((p) => fs.existsSync(p));
if (!PDF) throw new Error('aucun PDF de test trouvé');
console.log('PDF source :', PDF);
const buf = fs.readFileSync(PDF);
const octetsVrais = new Uint8Array(buf.length);
octetsVrais.set(buf);
console.log('PDF source :', buf.length, 'octets');

function simulerDownloadSupabase(octets: Uint8Array): ArrayBuffer {
  // supabase .download() → Blob → arrayBuffer() : retourne un ArrayBuffer
  // distinct (copie indépendante des octets source).
  const copie = new ArrayBuffer(octets.length);
  new Uint8Array(copie).set(octets);
  return copie;
}

// --- Suite EXACTE d'export-fidele.ts (lignes 61-89) ---
const ab1 = new ArrayBuffer(buf.length);
new Uint8Array(ab1).set(buf);
const donnees = new Uint8Array(ab1);
console.log('avant pdf.js  : donnees.byteLength =', donnees.byteLength);
GlobalWorkerOptions.workerSrc = ''; // Node : fake worker
const tache = pdfjsGetDocument({ data: donnees }) as unknown as {
  promise: Promise<{ numPages: number; destroy?: () => Promise<void> }>;
};
const docJs = await tache.promise;
console.log('après pdf.js  : donnees.byteLength =', donnees.byteLength);
console.log('                buffer détaché ?', donnees.buffer.byteLength === 0);
void docJs.destroy?.();

try {
  await PDFDocument.load(donnees, { ignoreEncryption: true });
  console.log('pdf-lib : OK — buffer intact (Node ne détache pas)');
} catch (e) {
  console.log('pdf-lib : ERREUR →', (e as Error).message);
}

// --- Référence : suite SÉCURISÉE (copie dédiée à pdf.js) ---
const ab2 = new ArrayBuffer(buf.length);
new Uint8Array(ab2).set(buf);
const donnees2 = new Uint8Array(ab2);
const t2 = pdfjsGetDocument({ data: donnees2.slice() }) as {
  promise: Promise<{ numPages: number; destroy?: () => Promise<void> }>;
};
const d2 = await t2.promise;
void d2.destroy?.();
const docLib = await PDFDocument.load(donnees2, { ignoreEncryption: true });
console.log(
  'référence (copie) : pdf-lib OK,',
  docLib.getPageCount(),
  'pages — copie dédiée résout le bug'
);