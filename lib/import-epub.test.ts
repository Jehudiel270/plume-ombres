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

test('lireEpub lit le titre écrit en clair (pas de numérotation de spine)', async () => {
  // Cas réel : EPUB sans <h1>/<h2> (Z-Library, Calibre), titre du livre
  // répété en en-tête courant sur chaque fragment. L'ancien code tombait
  // sur `Chapitre ${indiceDuSpine}` : les chapitres s'appelaient
  // « Chapitre 3 », « Chapitre 6 », « Chapitre 8 »… alors que le texte
  // affichait « Chapter One ».
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
    <dc:title>Try</dc:title><dc:creator>Ella Frank</dc:creator>
    <dc:identifier id="id">urn:uuid:test-0002</dc:identifier>
  </metadata>
  <manifest>
    <item id="c0" href="garde.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="un.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="deux.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="sanst.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c0"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`
  );
  const fragment = (titre: string | null, corps: string) =>
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Try</title></head><body>
<p>Try</p>${titre ? `<p>${titre}</p>` : ''}<p>${corps}</p><p>${PROSE.repeat(3)}</p></body></html>`;
  // Page de couverture : uniquement une image, aucun texte (fragment sauté).
  // Elle comptait pourtant dans l'indice du spine d'où venaient les numéros.
  zip.file(
    'OEBPS/garde.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><div><img src="cover.jpg" alt=""/></div></body></html>`
  );
  zip.file('OEBPS/un.xhtml', fragment('Chapter One', 'Monday evening, nine fifteen.'));
  zip.file('OEBPS/deux.xhtml', fragment('Chapter Two', 'Yep, second night in a row.'));
  zip.file('OEBPS/sanst.xhtml', fragment(null, 'Elle referma la porte sans un mot.'));

  const livre = await lireEpub(await zip.generateAsync({ type: 'arraybuffer' }));
  assert.deepEqual(
    livre.chapitres.map((c) => c.titre),
    ['Chapter One', 'Chapter Two', 'Chapitre 3'],
    `titres obtenus : ${JSON.stringify(livre.chapitres.map((c) => c.titre))}`
  );
  // L'en-tête courant (« Try ») et le titre ne sont pas répétés dans le corps.
  assert.ok(!/^Try\n/.test(livre.chapitres[0].texte), 'en-tête courant retiré');
  assert.ok(
    !livre.chapitres[0].texte.startsWith('Chapter One'),
    'titre non dupliqué dans le corps'
  );
  // Numérotation séquentielle sur les chapitres retenus, jamais un indice
  // du spine troué (la couverture comptait pour un chapitre).
  assert.equal(livre.chapitres[2].titre, 'Chapitre 3');
});

test('lireEpub conserve les paragraphes des EPUB minifiés', async () => {
  const zip = new JSZip();
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Minifié</dc:title><dc:identifier id="id">urn:uuid:test-0003</dc:identifier>
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`
  );
  // Aucun saut de ligne entre les balises : cas des EPUB produits par Calibre.
  zip.file(
    'OEBPS/c1.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Seul</h1><p>${PROSE.trim()}</p><p>${PROSE.trim()}</p><p>${PROSE.trim()}</p></body></html>`
  );
  const livre = await lireEpub(await zip.generateAsync({ type: 'arraybuffer' }));
  const paragraphes = livre.chapitres[0].texte.split(/\n{2,}/);
  assert.equal(paragraphes.length, 3, `paragraphes obtenus : ${paragraphes.length}`);
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
  // Deux paragraphes restent deux paragraphes (ligne vide entre eux).
  assert.equal(htmlEnTexte('<p>Bonjour</p><p>le monde</p>').trim(), 'Bonjour\n\nle monde');
  assert.deepEqual(paragraphes('Un.\n\nDeux.'), ['Un.', 'Deux.']);
});
