// Test réel de l'import EPUB : construit un EPUB minimal puis le relit.
// Usage : npx tsx scripts/test-epub.ts
import JSZip from 'jszip';
import {
  lireEpub,
  htmlEnTexte,
  paragraphes,
  decoderEntites,
} from '../lib/import-epub';

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ---------- Unitaires : nettoyage HTML ----------
const html1 = `
<html><head><title>x</title></head>
<body>
  <h1>Chapitre un</h1>
  <p>Premier paragraphe avec un &eacute; accent et des entités
  qui doivent être décodées&nbsp;proprement.</p>
  <p>Deuxième paragraphe<br/>avec un retour à la ligne.</p>
</body></html>`;
const texte1 = htmlEnTexte(html1);
verifier(
  'htmlEnTexte décode les entités (\'é\', &nbsp;)',
  texte1.includes('accent et des entités') && !texte1.includes('&nbsp;')
);
verifier(
  'htmlEnTexte préserve les paragraphes (2 paragraphes + titre)',
  paragraphes(texte1).length >= 3
);
verifier(
  'htmlEnTexte supprime les balises',
  !texte1.includes('<') && !texte1.includes('>')
);
verifier('decoderEntites (&#233; → é)', decoderEntites('café &#233;') === 'café é');

// ---------- Intégration : EPUB minimal complet ----------
async function construireEpub() {
  const zip = new JSZip();
  zip.file(
    'mimetype',
    'application/epub+zip',
    { binary: false, compression: 'STORE' }
  );
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="titre">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="titre">urn:uuid:test-0001</dc:identifier>
    <dc:title>Nuit Écarlate</dc:title>
    <dc:creator>Autrice Test</dc:creator>
  </metadata>
  <manifest>
    <item id="chap1" href="text/chapitre-01.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="text/chapitre-02.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
  </spine>
</package>`
  );
  zip.file(
    'OEBPS/text/chapitre-01.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Le bal masqué</h1>
  <p>La nuit tombait sur la ville quand elle entra dans le salon.
  Les visages se cachaient derrière des masques d'or.</p>
  <p>Il la regarda longuement, comme si elle était la seule
  personne réelle de toute la salle.</p>
  <nav epub:type="toc"><h2>Table des matières</h2><ol><li>Chapitre 1</li></ol></nav>
</body>
</html>`
  );
  zip.file(
    'OEBPS/text/chapitre-02.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h2>La fuite</h2>
  <p>Elle courait, les talons claquant sur le pavé. Derrière elle,
  des pas qui ne s'arrêtaient jamais.</p>
</body>
</html>`
  );
  // « mimetype » doit être le premier fichier, sans compression :
  // JSZip conserve l'ordre d'insertion — on reconstruit proprement.
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
  });
  // Convertit en ArrayBuffer.
  return new Uint8Array(buffer).buffer;
}

async function main() {
  const donnees = await construireEpub();
  const livre = await lireEpub(donnees);

  verifier('titre du livre lu depuis l\'OPF', livre.titre === 'Nuit Écarlate');
  verifier('auteur lu depuis l\'OPF', livre.auteur === 'Autrice Test');
  verifier('2 chapitres détectés (spine)', livre.chapitres.length === 2);
  verifier(
    'titre chapitre 1 (h1)',
    livre.chapitres[0].titre === 'Le bal masqué'
  );
  verifier(
    'titre chapitre 2 (h2)',
    livre.chapitres[1].titre === 'La fuite'
  );
  verifier(
    'texte chapitre 1 contient le dialogue',
    livre.chapitres[0].texte.includes(
      "masques d'or"
    )
  );
  verifier(
    'le bloc <nav> (TOC) n\'est pas traité comme chapitre',
    livre.chapitres.every((c) => !/table des mati/i.test(c.titre))
  );
  verifier(
    "chapitres dans l'ordre du spine",
    livre.chapitres[0].titre === 'Le bal masqué' &&
      livre.chapitres[1].titre === 'La fuite'
  );

  if (echecs > 0) {
    console.error(`\n${echecs} échec(s).`);
    process.exit(1);
  }
  console.log('\nTous les tests EPUB passent.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});