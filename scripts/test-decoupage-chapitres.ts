// ============================================================
// test-decoupage-chapitres.ts — Non-régression du découpage.
//
// Couvre la cause du bug « deux séries de chapitres entremêlées » :
//  1. PDF : « Chapter 1 » / « The Diamond » sur deux lignes → un seul
//     chapitre, numéroté ;
//  2. PDF : sommaire en tête (titres nus) → pas de chapitres fantômes ;
//  3. EPUB : page de filigrane (21 caractères) → pas de « Chapitre N » ;
//  4. livre de chapitres réellement courts → découpage préservé ;
//  5. prose enveloppée commençant par un mot-clé (« book. And… ») → pas un titre.
//
// Usage : npx tsx scripts/test-decoupage-chapitres.ts
// ============================================================

import JSZip from 'jszip';
import { decouperEnChapitres } from '../lib/segmenter';
import { lireEpub } from '../lib/import-epub';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`✓ ${nom}`);
  } else {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

const PROSE =
  "Smell. The first of my senses to trickle in. I wish it were anything else because I'm instantly " +
  "overwhelmed by the scent of body odour, spiced cologne, and what can only be described as the " +
  'stench of evil incarnate. And then my sixth sense seeps in, whispering notes of warning.';

// ---------- 1. Tête de chapitre sur deux lignes ----------
const pdf = `Chapter 1
The Diamond

${PROSE}

Chapter 2
The Hunter

${PROSE}

Chapter 3
The Diamond

${PROSE}
`;
const c1 = decouperEnChapitres(pdf);
verifier('PDF : 3 chapitres, pas 6', c1.length === 3, `obtenu ${c1.length}`);
verifier(
  'PDF : numéro + titre réunis',
  c1[0]?.titre === 'Chapter 1 — The Diamond' && c1[1]?.titre === 'Chapter 2 — The Hunter',
  JSON.stringify(c1.map((c) => c.titre))
);
verifier(
  'PDF : aucun chapitre vide',
  c1.every((c) => c.texte.trim().length >= 200)
);

// ---------- 2. Sommaire + titres de partie ----------
const sommaire = `Contents
Chapter 1
Chapter 2
Chapter 3

PART I

Chapter 1
The Diamond

${PROSE}

Chapter 2
The Hunter

${PROSE}
`;
const c2 = decouperEnChapitres(sommaire);
verifier('sommaire : 2 chapitres retenus', c2.length === 2, `obtenu ${c2.length}`);
verifier(
  'sommaire : numérotation conservée',
  c2[0]?.titre === 'Chapter 1 — The Diamond',
  JSON.stringify(c2.map((c) => c.titre))
);

// ---------- 3. EPUB : pages de filigrane ----------
async function epubAvecFiligranes(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  const page = (h: string, corps: string) =>
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>${h}${corps}</body></html>`;
  const chapitre = page(
    '<h1>Chapter 1</h1>',
    `<p>${PROSE}</p><p>${PROSE}</p>`
  );
  const filigrane = page('', '<p>Unknown</p><p>OceanofPDF.com</p>');
  const chapitre2 = page('<h1>Chapter 2</h1>', `<p>${PROSE}</p>`);
  const items = [
    ['cover', 'text/cover.xhtml'],
    ['c1', 'text/c1.xhtml'],
    ['w1', 'text/w1.xhtml'],
    ['w2', 'text/w2.xhtml'],
    ['c2', 'text/c2.xhtml'],
  ];
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">` +
      `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test</dc:title><dc:creator>X</dc:creator></metadata>` +
      `<manifest>${items
        .map(([id, href]) => `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`)
        .join('')}</manifest>` +
      `<spine>${items.map(([id]) => `<itemref idref="${id}"/>`).join('')}</spine></package>`
  );
  zip.file('OEBPS/text/cover.xhtml', page('', '<p>Unknown</p><p>OceanofPDF.com</p>'));
  zip.file('OEBPS/text/c1.xhtml', chapitre);
  zip.file('OEBPS/text/w1.xhtml', filigrane);
  zip.file('OEBPS/text/w2.xhtml', filigrane);
  zip.file('OEBPS/text/c2.xhtml', chapitre2);
  const tampon = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return new Uint8Array(tampon).buffer;
}

async function testsEpub() {
  const livreEpub = await lireEpub(await epubAvecFiligranes());
  const titresEpub = livreEpub.chapitres.map((c) => c.titre);
  verifier('EPUB : 2 chapitres (filigranes absorbés)', livreEpub.chapitres.length === 2, JSON.stringify(titresEpub));
  verifier('EPUB : aucun « Chapitre N » parasite', !titresEpub.some((t) => /^Chapitre \d+$/.test(t)), JSON.stringify(titresEpub));
  verifier('EPUB : positions renumérotées 0..n', livreEpub.chapitres.every((c, i) => c.position === i));
}

// ---------- 4. Livre de chapitres réellement courts (microfictions) ----------
const courts = Array.from({ length: 8 }, (_, i) =>
  `Chapitre ${i + 1}\n\nIl pleut. Marie court vers la gare. Le train part sans elle.\n`
).join('\n');
const c4 = decouperEnChapitres(courts);
verifier('chapitres courts : 8 chapitres conservés', c4.length === 8, `obtenu ${c4.length}`);
verifier(
  'chapitres courts : titres préservés',
  c4[0]?.titre === 'Chapitre 1' && c4[7]?.titre === 'Chapitre 8',
  JSON.stringify(c4.map((c) => c.titre))
);

// ---------- 5. Prose enveloppée commençant par un mot-clé ----------
const proseEnveloppee = `Chapter 4
The Hunter

${PROSE}
It was the last chapter of the book.
And even in his mania, he understood.

${PROSE}
`;
const c5 = decouperEnChapitres(proseEnveloppee);
verifier(
  '« chapter of the book. » en milieu de ligne : pas un chapitre',
  c5.length === 1,
  JSON.stringify(c5.map((c) => c.titre))
);

testsEpub()
  .then(() => {
    if (echecs > 0) {
      console.error(`\n${echecs} échec(s).`);
      process.exit(1);
    }
    console.log('\nTous les tests de découpage passent.');
  })
  .catch((e) => {
    console.error('Erreur fatale :', e);
    process.exit(1);
  });
