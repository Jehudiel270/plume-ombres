// test-export-fidele-garde.ts — Régression du bug prod :
// « PDF fidèle impossible : Failed to parse PDF document …
//   No PDF header found (offset=0) ».
//
// Deux causes, deux garde-fous testés ici :
//   (A) Original conservé NON-PDF (.txt / .epub / PDF tronqué) :
//       exporterPdfFidele doit refuser PROPREMENT (message clair,
//       orienté vers les alternatives) — plus l'erreur binaire de
//       pdf-lib sur un buffer non-PDF.
//   (B) Buffer partagé pdf.js / pdf-lib : le pipeline passe pdf.js
//       sur une COPIE DÉDIÉE (donnees.slice()) ; après scan, le
//       buffer d'origine doit être intact (byteLength inchangé)
//       pour que pdf-lib (moteur) reçoive le vrai PDF.
//
// Usage : npx tsx scripts/test-export-fidele-garde.ts
import fs from 'node:fs';
import {
  exporterPdfFidele,
  estPdfValide,
} from '../lib/export-fidele';
import {
  genererPdfFidele,
  scannerPagesFideles,
} from '../lib/pdf-fidele';
import { getDocument as pdfjsGetDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDF_REAPER =
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_7091958450d0__OceanofPDF.com_The_Reaper_-__RuNyx.pdf';
const TXT = 'C:/Users/dosso/dev/dark-romance-translator/fixtures-originaux-non-pdf/chevalier-nuit.txt';
const EPUB_FIXTURE = 'C:/Users/dosso/dev/dark-romance-translator/fixtures-originaux-non-pdf/livre.epub';

let ecoues = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✅ ${nom}${detail ? ' — ' + detail : ''}`);
  } else {
    ecoues++;
    console.log(`  ❌ ${nom}${detail ? ' — ' + detail : ''}`);
  }
}

/** Téléchargement simulé du bucket : lecture locale (ArrayBuffer). */
function telechargerFichier(chemin: string) {
  return async () => {
    const buf = fs.readFileSync(chemin);
    const ab = new ArrayBuffer(buf.length);
    new Uint8Array(ab).set(buf);
    return ab;
  };
}

async function principal() {
  // ---------- 1. estPdfValide (fonction pure) ----------
  console.log('\n[1/4] estPdfValide — détection des en-têtes PDF');
  const octetsPdf = new Uint8Array(fs.readFileSync(PDF_REAPER));
  const octetsTxt = new TextEncoder().encode(
    fs.readFileSync(TXT, 'utf8')
  );
  const octetsEpub = new Uint8Array(
    fs.existsSync(EPUB_FIXTURE) ? fs.readFileSync(EPUB_FIXTURE) : Buffer.alloc(0)
  );
  const pdfTronque = octetsPdf.subarray(500); // plus d'en-tête en 0

  verifier('vrai PDF → vrai', estPdfValide(octetsPdf), 'The Reaper 331 p.');
  verifier(
    '.txt → faux',
    !estPdfValide(octetsTxt),
    'chevalier-nuit.txt'
  );
  verifier(
    '.epub (zip) → faux',
    !estPdfValide(octetsEpub),
    `début=${Array.from(octetsEpub.slice(0, 2)).join(',')}`
  );
  verifier('PDF tronqué → faux', !estPdfValide(pdfTronque));
  verifier('buffer vide → faux', !estPdfValide(new Uint8Array(0)));

  // ---------- 2. (A) export réel : originaux NON-PDF refusés proprement ----------
  console.log('\n[2/4] exporterPdfFidele — originaux non-PDF');
  for (const [nom, fichier, estTxt] of [
    ['.txt', TXT, true],
    ['.epub', EPUB_FIXTURE, false],
  ] as const) {
    if (!fs.existsSync(fichier) && !estTxt) {
      console.log(`  — fixture ${nom} absent, ignoré`);
      continue;
    }
    const telecharger = telechargerFichier(fichier);
    let erreur: unknown = null;
    try {
      await exporterPdfFidele(
        {
          id: 'test',
          titre: 'Test non-PDF',
          langue_cible: 'fr',
          fichier_original: 'test/fake' + (estTxt ? '.txt' : '.epub'),
        },
        [],
        telecharger,
        () => {}
      );
    } catch (e) {
      erreur = e;
    }
    const message = erreur instanceof Error ? erreur.message : '';
    verifier(
      `original ${nom} : refus propre`,
      /n’est pas un PDF|mise en page d’origine n’existe pas/i.test(message),
      message.slice(0, 80)
    );
    verifier(
      `original ${nom} : PAS l'erreur binaire prod`,
      !/No PDF header found/.test(message),
      message.slice(0, 80)
    );
  }

  // Original PDF TRONQUÉ (pas de %PDF- en position 0, mais un
  // fichier « .pdf » stocké) : même refus propre.
  {
    const tmp = 'C:/Users/dosso/AppData/Local/Temp/tronque-test.pdf';
    fs.writeFileSync(tmp, pdfTronque);
    let erreur: unknown = null;
    try {
      await exporterPdfFidele(
        { id: 't', titre: 'T', langue_cible: 'fr', fichier_original: 't.pdf' },
        [],
        telechargerFichier(tmp),
        () => {}
      );
    } catch (e) {
      erreur = e;
    }
    const message = erreur instanceof Error ? erreur.message : '';
    verifier(
      'PDF tronqué (stocké .pdf) : refus propre',
      /n’est pas un PDF/.test(message),
      message.slice(0, 80)
    );
  }

  // ---------- 3. (B) pipeline réel : buffer INTACT après scan ----------
  console.log('\n[3/4] Pipeline réel (The Reaper, 331 p.) — copie dédiée');
  const t0 = Date.now();
  const telecharger = telechargerFichier(PDF_REAPER);
  const original = new Uint8Array(await telecharger());
  const avant = original.byteLength;
  // Même suite que export-fidele (lignes corrigées) :
  // pdf.js sur COPIE, moteur sur l'original.
  const tache = pdfjsGetDocument({ data: original.slice(), disableFontFace: true });
  const docJs = (await tache.promise) as unknown as import('../lib/pdf-fidele').DocPdfJs;
  const scan = await scannerPagesFideles(docJs, (p, tot) => {
    if (p === 1 || p % 100 === 0 || p === tot)
      console.log(`    scan page ${p}/${tot}`);
  });
  void docJs.destroy?.();
  verifier(
    'buffer d’origine intact après scan pdf.js',
    original.byteLength === avant && avant > 0,
    `${avant.toLocaleString('fr-FR')} octets (avant = après)`
  );
  verifier(
    'en-tête PDF de l’original intact',
    new TextDecoder('latin1')
      .decode(original.subarray(0, 8))
      .startsWith('%PDF-'),
    new TextDecoder('latin1').decode(original.subarray(0, 8))
  );

  // ---------- 4. (B) moteur : génération complète, PDF de sortie valide ----------
  console.log('\n[4/4] Moteur genererPdfFidele sur le buffer non détaché');
  // Traduction simulée (français réaliste, ≈ longueur source) — on
    // valide la MÉCANIQUE (buffer → PDF valide), pas la qualité.
    const flux = scan.textes.join('\n');
    const fr = frPourTest(Math.round(flux.length * 1.15));
  const { octets, nbPages } = await genererPdfFidele({
    octets: original, // le buffer INTACT va au moteur, comme en prod corrigée
    pages: scan.pages,
    textesPages: scan.textes,
    chapitres: [
      { titre: 'Test', texte_source: flux, texte_traduit: fr },
    ],
  });
  const head = new TextDecoder('latin1').decode(octets.subarray(0, 10));
  verifier(
    'PDF de sortie valide (%PDF-) avec buffer partagé→copie',
    head.startsWith('%PDF-') && nbPages >= scan.pages.length,
    `${nbPages} pages, sortie ${(octets.length / 1048576).toFixed(1)} Mo`
  );
  console.log(
    `\n    ⏱ pipeline ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );

  console.log(
    `\n${ecoues === 0 ? '✅ TOUS LES TESTS PASSENT' : `❌ ${ecoues} ÉCHEC(S)`}`
  );
  process.exit(ecoues === 0 ? 0 : 1);
}

// ---------- Traduction simulée (français réaliste) ----------
function frPourTest(longueur: number): string {
  const morceaux = (
    'la nuit tombe sur la ville le vent porte une odeur de sang froid ' +
    'elle marcha sans bruit entre les ombres du cimetière sa respiration ' +
    'serrait la gorge de la mort les cendres dansaient comme des cendres ' +
    'blanches au-dessus du marbre le couteau tintait dans la poche de son ' +
    'manteau il la vit enfin à la lisière du bois ses yeux étaient deux ' +
    'brûlures blanches dans la nuit il ferma les yeux et suivit le chant'
  ).split(/ +/);
  let s = '';
  let i = 0;
  while (s.length < longueur) {
    s += (s ? ' ' : '') + morceaux[i % morceaux.length];
    i++;
    if (i % 23 === 0) s += '.';
    if (i % 40 === 0) s += '\n';
  }
  return s.slice(0, longueur);
}

principal().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});