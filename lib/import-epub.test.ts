import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { lireEpub, decoderEntites, htmlEnTexte, paragraphes } from './import-epub';

// Épreuve de non-régression : l'import d'EPUB ne doit dépendre QUE de
// jszip (le paquet epubjs a été retiré de package.json). On fabrique
// une vraie archive EPUB en mémoire et on vérifie l'extraction.

const PROSE =
  "La nuit tombait sur Ouidah et la pluie frappait les tôles du marché. ";

function chapitre(titre: string, paragraphe: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${titre}</title></head>
<body><h1>${titre}</h1><p>${paragraphe}</p><p>${PROSE.repeat(4)}</p></body></html>`;
}

async function fabriquerEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Les Ombres de Pahou</dc:title>
    <dc:creator>Vice Lynx</dc:creator>
    <dc:identifier id="id">urn:uuid:test-0001</dc:identifier>
  </metadata>
  <manifest>
    <item id="c1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`
  );
  zip.file('OEBPS/chap1.xhtml', chapitre('Chapitre premier', "Le silence de la lagune pesait sur les épaules."));
  zip.file('OEBPS/chap2.xhtml', chapitre('Chapitre deuxième', "Elle rouvrit la porte et l'ombre entra avec elle."));
  return zip.generateAsync({ type: 'arraybuffer' });
}

test('lireEpub extrait les chapitres dans l’ordre du spine', async () => {
  const livre = await lireEpub(await fabriquerEpub());
  assert.equal(livre.titre, 'Les Ombres de Pahou');
  assert.equal(livre.auteur, 'Vice Lynx');
  assert.ok(livre.chapitres.length >= 2, `chapitres trouvés : ${livre.chapitres.length}`);
  assert.match(livre.chapitres[0].texte, /lagune/);
  assert.match(livre.chapitres[1].texte, /l'ombre entra/);
});

test('lireEpub refuse une archive qui n’est pas un EPUB', async () => {
  const zip = new JSZip();
  zip.file('notes.txt', 'rien à voir');
  const donnees = await zip.generateAsync({ type: 'arraybuffer' });
  await assert.rejects(() => lireEpub(donnees), /OPF|illisible/i);
});

test('lireEpub refuse un fichier qui n’est pas un ZIP', async () => {
  const brut = new TextEncoder().encode('ceci n est pas une archive').buffer;
  await assert.rejects(() => lireEpub(brut), /ZIP|illisible/i);
});

test('les utilitaires de texte restent justes', () => {
  assert.equal(decoderEntites('caf&eacute; &amp; th&eacute;'), 'café & thé');
  assert.equal(decoderEntites('&#233;t&#xE9;'), 'été');
  // Pas de double décodage : « &amp;eacute; » s'affiche tel quel.
  assert.equal(decoderEntites('&amp;eacute;'), '&eacute;');
  assert.equal(decoderEntites('l&rsquo;&eacute;t&eacute;'), 'l’été');
  assert.equal(htmlEnTexte('<p>Bonjour</p><p>le monde</p>').trim(), 'Bonjour le monde');
  assert.deepEqual(paragraphes('Un.\n\nDeux.'), ['Un.', 'Deux.']);
});
