// Repro exact du bug prod : « PDF fidèle impossible : Failed to parse PDF
// document (line:0 col:0 offset=0): No PDF header found ».
// Simule le pipeline navigateur (export-fidele) avec un « original »
// conservé en bucket MAIS qui n'est PAS un PDF (.txt / .epub), comme
// l'importe ZoneImport.tsx pour les livres .txt/.epub.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDocument as pdfjsGetDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

const tmp = os.tmpdir();

// « original » .txt tel que déposé dans le bucket « originaux ».
const txt = fs.readFileSync(
  new URL('./../fixtures-originaux-non-pdf/chevalier-nuit.txt', import.meta.url),
  'utf8'
);
const epub = fs.readFileSync(
  new URL('./../fixtures-originaux-non-pdf/livre.epub', import.meta.url),
);
const pdfCorrompu = (() => {
  const p = 'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf';
  if (fs.existsSync(p)) {
    const b = fs.readFileSync(p);
    return b.subarray(500); // tronqué = plus d'en-tête %PDF- en position 0
  }
  return new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
})();

async function essai(nom: string, octets: Uint8Array) {
  console.log(`\n--- ${nom} (${octets.length} octets, début: ${Array.from(octets.slice(0, 12)).join(' ')})`);
  // Étape 2 du pipeline : pdf.js
  let errPdfJs: Error | null = null;
  try {
    const t = pdfjsGetDocument({ data: octets.slice(), disableFontFace: true });
    const doc = await t.promise;
    await (doc as { destroy?: () => Promise<void> }).destroy?.();
    console.log('  pdf.js : OK (inattendu!)');
  } catch (e) {
    errPdfJs = e instanceof Error ? e : new Error(String(e));
    console.log('  pdf.js :', errPdfJs.constructor.name, '::', errPdfJs.message.split('\n')[0].slice(0, 120));
  }
  // Étape 3 du pipeline (moteur) : pdf-lib
  let errPdfLib: Error | null = null;
  try {
    await PDFDocument.load(octets, { ignoreEncryption: true });
    console.log('  pdf-lib : OK (inattendu!)');
  } catch (e) {
    errPdfLib = e instanceof Error ? e : new Error(String(e));
    console.log('  pdf-lib :', errPdfLib.constructor.name, '::', errPdfLib.message.split('\n')[0]);
  }
  return { errPdfJs, errPdfLib };
}

const r1 = await essai('original .txt importé', new TextEncoder().encode(txt));
const r2 = await essai('original .epub importé (zip)', new Uint8Array(epub));
const r3 = await essai('PDF tronqué (corrompu au stockage)', pdfCorrompu);

const cible =
  'Failed to parse PDF document (line:0 col:0 offset=0): No PDF header found';
console.log('\n=== VERDICT ===');
console.log('message prod cible :', cible);
console.log('pdf-lib .txt  === cible ?', r1.errPdfLib?.message.includes(cible) ?? false);
console.log('pdf-lib .epub === cible ?', r2.errPdfLib?.message.includes(cible) ?? false);
console.log('pdf-lib tronqué msg:', r3.errPdfLib?.message.slice(0, 120) ?? 'OK!?');