// ============================================================
// export-epub.ts — Génère un livre EPUB 3 conforme à partir des
// CHAPITRES TRADUITS EN BASE (titre + texte), sans jamais relire
// le fichier original (il n'est plus conservé côté serveur).
//
// Conformité OCF / EPUB 3 :
//  - `mimetype` en PREMIER, NON COMPRESSÉ (STORE), contenu exact
//    « application/epub+zip » (sans saut de ligne),
//  - `META-INF/container.xml` → pointe le manifeste OPF,
//  - `OEBPS/content.opf` : métadonnées Dublin Core (titre, auteur,
//    langue, identifiant, date) + manifest + spine (navigation par
//    chapitre dans l'ordre de lecture),
//  - `OEBPS/nav.xhtml` : document de navigation EPUB 3 (epub:type="toc"),
//  - `OEBPS/toc.ncx` : table des matières EPUB 2 (compatibilité liseuses),
//  - chapitres en XHTML 1.1 valide (XML bien formé, entités échappées),
//  - couverture OPTIONNELLE (image + page dédiée).
//
// 100 % navigateur (jszip), aucune dépendance serveur. Testable en
// Node via scripts/test-export-epub.ts.
//
// ---- Branchement UI (à faire par le propriétaire de la barre d'actions) ----
// Aucun composant n'est modifié ici (components/EspaceLivre.tsx et
// components/lecteur/** sont hors périmètre). Pour exposer le bouton
// « EPUB » dans components/lecteur/BarreActions.tsx :
//   1. dans components/lecteur/useExports.ts, ajouter une fonction
//      `exporterLivreEpub` qui réutilise `chargerChapitresExport()`
//      puis appelle `genererEpubBlob({ titre: livre.titre,
//      auteur: livre.auteur, langue: livre.langue_cible,
//      chapitres: chapitresExport })` et télécharge le Blob via
//      `telechargerBlob(blob, `${livre.titre} — traduction.epub`)` ;
//   2. l'ajouter à l'objet retourné par `useExports` ;
//   3. dans BarreActions.tsx, ajouter un bouton appelant la fonction.
// ============================================================

import JSZip from 'jszip';
import { enParagraphes, type ChapitreExport } from './export-docx';

/** Couverture optionnelle : image déjà chargée en mémoire. */
export interface CouvertureEpub {
  /** Octets de l'image (JPEG/PNG). */
  donnees: Uint8Array;
  /** Type MIME de l'image (défaut : image/jpeg). */
  mediaType?: string;
  /** Extension/nom du fichier image (défaut : couverture.jpg). */
  nomFichier?: string;
}

export interface OptionsEpub {
  /** Titre du livre (dc:title). */
  titre: string;
  /** Auteur (dc:creator) — facultatif. */
  auteur?: string | null;
  /** Code langue BCP-47 (défaut : « fr »). */
  langue?: string;
  /** Identifiant unique (défaut : urn:uuid généré). */
  identifiant?: string;
  /** Chapitres dans l'ordre de lecture (titre + texte). */
  chapitres: ChapitreExport[];
  /** Couverture optionnelle. */
  couverture?: CouvertureEpub | null;
  /** Date de modification ISO (défaut : maintenant). */
  date?: string;
}

/** Échappe le texte pour un nœud XML. */
export function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Échappe le texte pour une valeur d'attribut XML. */
export function echapperAttribut(texte: string): string {
  return echapperXml(texte).replace(/"/g, '&quot;');
}

/** Normalise un titre pour l'utiliser comme slug de fichier. */
function slugFichier(titre: string): string {
  // Retire un éventuel préfixe « Chapitre 3 — » déjà porté par le nom.
  const sansNumero = titre.replace(/^\s*chapitres?\s*\d+\s*[—–:.\-)]*\s*/i, '');
  return (
    sansNumero
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'chapitre'
  );
}

/** Identifiant unique du livre. */
function identifiantParDefaut(titre: string): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `urn:uuid:${cryptoObj.randomUUID()}`;
  }
  // Repli déterministe (environnements sans crypto.randomUUID).
  let h = 0x811c9dc5;
  for (let i = 0; i < titre.length; i += 1) {
    h ^= titre.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0');
  return `urn:uuid:00000000-0000-4000-8000-${hex}${hex.slice(0, 4)}`;
}

/** Horodatage `dcterms:modified` (UTC, secondes, sans millisecondes). */
function horodatage(iso: string): string {
  const d = new Date(iso);
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${t.toISOString().slice(0, 19)}Z`;
}

const TITRE_COUVERTURE = 'Couverture';

interface EnteteLocalZip {
  nom: string;
  methode: number;
  offset: number;
  /** Position des données du fichier (après nom + champ extra). */
  debut: number;
}

/**
 * Lecture brute des en-têtes LOCAUX du ZIP (signature `PK\x03\x04`).
 * Sert aux tests et à l'auto-vérification de l'ordre/compression du
 * `mimetype` sans dépendance externe (yauzl/unzip).
 */
export function lireEntetesLocaux(donnees: Uint8Array): EnteteLocalZip[] {
  const vue = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength);
  const entetes: EnteteLocalZip[] = [];
  let i = 0;
  while (i + 30 <= donnees.length) {
    if (vue.getUint32(i, true) !== 0x04034b50) break;
    const flags = vue.getUint16(i + 6, true);
    const methode = vue.getUint16(i + 8, true);
    const compresse = vue.getUint32(i + 18, true);
    const nomLen = vue.getUint16(i + 26, true);
    const extraLen = vue.getUint16(i + 28, true);
    const nom = new TextDecoder('utf-8').decode(
      donnees.subarray(i + 30, i + 30 + nomLen)
    );
    entetes.push({ nom, methode, offset: i, debut: i + 30 + nomLen + extraLen });
    // Taille inconnue (data descriptor, flag 0x08) : on s'arrête.
    if ((flags & 0x08) !== 0) break;
    i += 30 + nomLen + extraLen + compresse;
  }
  return entetes;
}

/** Construit un XHTML bien formé de chapitre. */
function xhtmlChapitre(titre: string, texte: string, langue: string): string {
  const paragraphes = enParagraphes(texte);
  const corps =
    paragraphes.length > 0
      ? paragraphes.map((p) => `      <p>${echapperXml(p)}</p>`).join('\n')
      : '      <p></p>';
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${echapperAttribut(langue)}" lang="${echapperAttribut(langue)}">
  <head>
    <meta charset="utf-8"/>
    <title>${echapperXml(titre)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  </head>
  <body>
    <section epub:type="chapter" role="doc-chapter">
      <h1>${echapperXml(titre)}</h1>
${corps}
    </section>
  </body>
</html>`;
}

const FEUILLE_STYLE = `/* Plume d'Ombres — feuille de style EPUB. */
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.6;
  padding: 1.2em;
}
h1 { font-size: 1.4em; margin: 1.2em 0 0.8em; text-align: center; }
p { margin: 0 0 0.9em; text-align: justify; text-indent: 1.2em; }
section[epub|type~="cover"] { text-align: center; text-indent: 0; }
section[epub|type~="cover"] img { max-width: 100%; max-height: 100%; }
`;

const FEUILLE_COUVERTURE = `html, body { margin: 0; padding: 0; text-align: center; }
img { max-width: 100%; max-height: 100%; }
`;

function xhtmlCouverture(langue: string, href: string, alt: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${echapperAttribut(langue)}" lang="${echapperAttribut(langue)}">
  <head>
    <meta charset="utf-8"/>
    <title>${echapperXml(TITRE_COUVERTURE)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/couverture.css"/>
  </head>
  <body>
    <section epub:type="cover" role="doc-cover">
      <img src="${echapperAttribut(href)}" alt="${echapperAttribut(alt)}"/>
    </section>
  </body>
</html>`;
}

/**
 * Génère l'EPUB complet et retourne ses octets.
 */
export async function genererEpub(options: OptionsEpub): Promise<Uint8Array> {
  const titre = (options.titre || 'Sans titre').trim();
  const auteur = (options.auteur ?? '').trim();
  const langue = (options.langue || 'fr').trim();
  const chapitres = options.chapitres ?? [];
  if (chapitres.length === 0) {
    throw new Error('Export EPUB impossible : aucun chapitre.');
  }
  const identifiant = options.identifiant || identifiantParDefaut(titre);
  const modifie = horodatage(options.date ?? new Date().toISOString());

  const zip = new JSZip();

  // 1. mimetype EN PREMIER, NON COMPRESSÉ (exigence OCF).
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. Conteneur OCF → manifeste.
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // 3. Chemins des chapitres (un fichier XHTML par chapitre).
  const fichiers = chapitres.map((c, i) => ({
    id: `chap-${i + 1}`,
    href: `text/chapitre-${String(i + 1).padStart(2, '0')}-${slugFichier(c.titre)}.xhtml`,
    titre: (c.titre || `Chapitre ${i + 1}`).trim(),
    texte: c.texte ?? '',
  }));

  // 4. Couverture optionnelle.
  const couverture = options.couverture ?? null;
  const nomImage = couverture?.nomFichier ?? 'couverture.jpg';
  const mediaImage = couverture?.mediaType ?? 'image/jpeg';
  const hrefImage = `images/${nomImage}`;

  // 5. Chapitres XHTML.
  for (const f of fichiers) {
    zip.file(`OEBPS/${f.href}`, xhtmlChapitre(f.titre, f.texte, langue));
  }

  // 6. Navigation EPUB 3 (nav.xhtml).
  const liensNav = fichiers
    .map((f) => `      <li><a href="${echapperAttribut(f.href)}">${echapperXml(f.titre)}</a></li>`)
    .join('\n');
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${echapperAttribut(langue)}" lang="${echapperAttribut(langue)}">
  <head>
    <meta charset="utf-8"/>
    <title>Sommaire</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc" role="doc-toc">
      <h1>Sommaire</h1>
      <ol>
${liensNav}
      </ol>
    </nav>
    <nav epub:type="landmarks" hidden="hidden">
      <ol>
        <li><a epub:type="bodymatter" href="${echapperAttribut(fichiers[0].href)}">Début du texte</a></li>
      </ol>
    </nav>
  </body>
</html>`
  );

  // 7. Table des matières EPUB 2 (toc.ncx) pour les liseuses anciennes.
  const pointsNcx = fichiers
    .map(
      (f, i) =>
        `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">\n` +
        `      <navLabel><text>${echapperXml(f.titre)}</text></navLabel>\n` +
        `      <content src="${echapperAttribut(f.href)}"/>\n` +
        `    </navPoint>`
    )
    .join('\n');
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${echapperAttribut(identifiant)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${echapperXml(titre)}</text></docTitle>
  <navMap>
${pointsNcx}
  </navMap>
</ncx>`
  );

  // 8. Feuilles de style.
  zip.file('OEBPS/styles/style.css', FEUILLE_STYLE);

  // 9. Manifest.
  const itemsManifeste: string[] = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="style" href="styles/style.css" media-type="text/css"/>',
  ];

  const refsSpine: string[] = [];

  if (couverture) {
    zip.file(`OEBPS/${hrefImage}`, couverture.donnees, { binary: true });
    zip.file('OEBPS/styles/couverture.css', FEUILLE_COUVERTURE);
    zip.file(
      'OEBPS/text/couverture.xhtml',
      xhtmlCouverture(langue, `../${hrefImage}`, titre)
    );
    itemsManifeste.push(
      `    <item id="cover-image" href="${hrefImage}" media-type="${mediaImage}" properties="cover-image"/>`,
      '    <item id="cover-page" href="text/couverture.xhtml" media-type="application/xhtml+xml"/>',
      '    <item id="style-cover" href="styles/couverture.css" media-type="text/css"/>'
    );
    refsSpine.push('    <itemref idref="cover-page"/>');
  }

  for (const f of fichiers) {
    itemsManifeste.push(
      `    <item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`
    );
    refsSpine.push(`    <itemref idref="${f.id}"/>`);
  }

  // 10. Manifeste OPF (métadonnées Dublin Core + spine).
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${echapperAttribut(langue)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${echapperXml(identifiant)}</dc:identifier>
    <dc:title>${echapperXml(titre)}</dc:title>
${auteur ? `    <dc:creator>${echapperXml(auteur)}</dc:creator>\n` : ''}    <dc:language>${echapperXml(langue)}</dc:language>
    <dc:date>${echapperXml(modifie)}</dc:date>
    <meta property="dcterms:modified">${echapperXml(modifie)}</meta>
  </metadata>
  <manifest>
${itemsManifeste.join('\n')}
  </manifest>
  <spine toc="ncx">
${refsSpine.join('\n')}
  </spine>
</package>`
  );

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: 'application/epub+zip',
  });
}

/**
 * Variante navigateur : retourne un Blob prêt à télécharger.
 */
export async function genererEpubBlob(options: OptionsEpub): Promise<Blob> {
  const octets = await genererEpub(options);
  return new Blob([octets as BlobPart], { type: 'application/epub+zip' });
}

/**
 * Vérifie la conformité OCF minimale d'un EPUB déjà généré :
 * `mimetype` en premier, non compressé, contenu exact. Utile aux
 * tests et à un contrôle avant téléchargement.
 */
export function verifierOcf(donnees: Uint8Array): {
  ok: boolean;
  problemes: string[];
} {
  const problemes: string[] = [];
  const entetes = lireEntetesLocaux(donnees);
  if (entetes.length === 0) {
    return { ok: false, problemes: ['ZIP illisible (aucun en-tête local).'] };
  }
  const premier = entetes[0];
  if (premier.nom !== 'mimetype') {
    problemes.push(`Premier fichier « ${premier.nom} » (attendu « mimetype »).`);
  }
  if (premier.methode !== 0) {
    problemes.push(`mimetype compressé (méthode ${premier.methode}, attendu 0=STORE).`);
  }
  const debutMimetype = premier.debut;
  const contenu = new TextDecoder('utf-8').decode(
    donnees.subarray(debutMimetype, debutMimetype + 20)
  );
  if (contenu !== 'application/epub+zip') {
    problemes.push(`Contenu mimetype « ${contenu} » invalide.`);
  }
  return { ok: problemes.length === 0, problemes };
}
