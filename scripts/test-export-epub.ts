// ============================================================
// test-export-epub.ts — Test RÉEL de l'export EPUB.
//
// Génère un VRAI fichier .epub (à partir de chapitres d'exemple
// équivalents à ceux stockés en base), l'écrit sur disque, puis
// inspecte l'archive :
//   - `mimetype` en PREMIER et NON COMPRESSÉ (STORE),
//   - META-INF/container.xml présent,
//   - OEBPS/content.opf (métadonnées + manifest + spine),
//   - OEBPS/nav.xhtml (navigation par chapitre) + toc.ncx,
//   - XHTML bien formé (vérificateur strict embarqué),
//   - couverture optionnelle (image + page + properties="cover-image").
//
// Usage : npx tsx scripts/test-export-epub.ts
// ============================================================

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { genererEpub, verifierOcf, lireEntetesLocaux } from '../lib/export-epub';
import { enParagraphes } from '../lib/export-docx';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail?: string) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ---------- Chapitres d'exemple (comme en base) ----------
const CHAPITRES = [
  {
    titre: 'Chapitre 1 — Le bal masqué',
    texte:
      "La nuit tombait sur la ville quand elle entra dans le salon.\n\n" +
      "Les visages se cachaient derrière des masques d'or & de velours.\n\n" +
      "Il la regarda longuement, comme si elle était la seule personne réelle.",
  },
  {
    titre: 'Chapitre 2 — Écarlate',
    texte:
      'Elle courait, les talons claquant sur le pavé mouillé.\n\n' +
      "Derrière elle, des pas qui ne s'arrêtaient jamais ; l'obscurité l'avalait.",
  },
  {
    titre: 'Chapitre 3 — L\u2019ombre & la nuit',
    texte: 'Un seul paragraphe, sans accent, mais avec <des chevrons> et un &.',
  },
];

/** Petit PNG 1×1 valide (couverture de test). */
const PNG_1x1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

// ---------- Vérificateur XML strict (sous-ensemble) ----------
/**
 * Vérifie qu'un document XML est BIEN FORMÉ : balises équilibrées,
 * attributs entre guillemets, une seule racine. Rentre dans le
 * périmètre XHTML/OPF/NCX produit par export-epub.ts (pas de DTD
 * interne, pas de sections conditionnelles).
 */
function verifierXmlBienForme(xml: string, nomFichier: string): string[] {
  const problemes: string[] = [];
  const corps = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const pile: string[] = [];
  const re = /<\/?([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  let derniereFin = 0;
  let racineVue = false;
  while ((m = re.exec(corps)) !== null) {
    const avant = corps.slice(derniereFin, m.index).trim();
    if (pile.length === 0 && avant.length > 0 && racineVue) {
      problemes.push(`${nomFichier}: texte hors racine « ${avant.slice(0, 30)} »`);
    }
    derniereFin = m.index + m[0].length;
    const fermante = m[0].startsWith('</');
    const autoFermante = m[3] === '/';
    const nom = m[1];
    if (fermante) {
      if (pile.length === 0 || pile[pile.length - 1] !== nom) {
        problemes.push(`${nomFichier}: balise fermante </${nom}> inattendue`);
        return problemes;
      }
      pile.pop();
    } else if (!autoFermante) {
      if (pile.length === 0) {
        if (racineVue) problemes.push(`${nomFichier}: seconde racine <${nom}>`);
        racineVue = true;
      }
      pile.push(nom);
    }
  }
  const reste = corps.slice(derniereFin).trim();
  if (reste.length > 0) problemes.push(`${nomFichier}: contenu résiduel « ${reste.slice(0, 30)} »`);
  if (pile.length > 0) problemes.push(`${nomFichier}: balise(s) non fermée(s) ${pile.join(', ')}`);
  return problemes;
}

// ---------- Inspection de l'archive ----------
async function inspecter(nom: string, octets: Uint8Array, attendCouverture: boolean) {
  console.log(`\n--- ${nom} ---`);

  // 1. OCF : mimetype premier + non compressé + contenu exact.
  const ocf = verifierOcf(octets);
  verifier(`${nom}: OCF (mimetype 1er, STORE, contenu exact)`, ocf.ok, ocf.problemes.join(' ; '));

  const entetes = lireEntetesLocaux(octets);
  const noms = entetes.map((e) => e.nom);
  console.log(`  entrées (${noms.length}) : ${noms.join(', ')}`);
  verifier(`${nom}: META-INF/container.xml présent`, noms.includes('META-INF/container.xml'));
  verifier(`${nom}: content.opf présent`, noms.includes('OEBPS/content.opf'));
  verifier(`${nom}: nav.xhtml (navigation EPUB 3) présent`, noms.includes('OEBPS/nav.xhtml'));
  verifier(`${nom}: toc.ncx (compatibilité EPUB 2) présent`, noms.includes('OEBPS/toc.ncx'));
  verifier(
    `${nom}: un XHTML par chapitre`,
    noms.filter((n) => n.startsWith('OEBPS/text/chapitre-')).length === CHAPITRES.length,
    `attendu ${CHAPITRES.length}`
  );

  // 2. Relecture complète via JSZip.
  const zip = await JSZip.loadAsync(octets);
  const lire = async (p: string) => (await zip.file(p)!.async('string'));

  const container = await lire('META-INF/container.xml');
  verifier(
    `${nom}: container.xml pointe le manifeste OPF`,
    /full-path="OEBPS\/content\.opf"/.test(container)
  );

  const opf = await lire('OEBPS/content.opf');
  verifier(`${nom}: OPF — dc:title`, /<dc:title>[^<]+<\/dc:title>/.test(opf));
  verifier(`${nom}: OPF — dc:creator`, /<dc:creator>[^<]+<\/dc:creator>/.test(opf));
  verifier(`${nom}: OPF — dc:language`, /<dc:language>fr<\/dc:language>/.test(opf));
  verifier(`${nom}: OPF — identifiant unique`, /<dc:identifier id="pub-id">urn:uuid:/.test(opf));
  verifier(`${nom}: OPF — dcterms:modified`, /<meta property="dcterms:modified">/.test(opf));
  verifier(
    `${nom}: OPF — nav déclarée (properties="nav")`,
    /properties="nav"/.test(opf)
  );
  const itemrefs = [...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((m) => m[1]);
  verifier(`${nom}: spine = navigation par chapitre dans l'ordre`, itemrefs.length >= CHAPITRES.length);
  verifier(
    `${nom}: items du manifest correspondent aux fichiers`,
    [...opf.matchAll(/<item id="chap-\d+" href="([^"]+)"/g)].every((m) => noms.includes(`OEBPS/${m[1]}`))
  );
  if (attendCouverture) {
    verifier(`${nom}: OPF — properties="cover-image"`, /properties="cover-image"/.test(opf));
    verifier(`${nom}: couverture en tête du spine`, itemrefs[0] === 'cover-page');
    verifier(`${nom}: page de couverture XHTML`, noms.includes('OEBPS/text/couverture.xhtml'));
  }

  const nav = await lire('OEBPS/nav.xhtml');
  verifier(
    `${nom}: nav.xhtml liste tous les chapitres`,
    CHAPITRES.every((c) => nav.includes(c.titre.replace(/&/g, '&amp;')))
  );

  // 3. XHTML bien formé + échappement.
  const aValider = noms.filter(
    (n) =>
      n.endsWith('.xhtml') ||
      n === 'OEBPS/content.opf' ||
      n === 'OEBPS/toc.ncx' ||
      n === 'META-INF/container.xml'
  );
  const problemesXml: string[] = [];
  for (const p of aValider) {
    problemesXml.push(...verifierXmlBienForme(await lire(p), p));
  }
  verifier(
    `${nom}: tous les fichiers XML sont bien formés (${aValider.length})`,
    problemesXml.length === 0,
    problemesXml.join(' ; ')
  );

  const texteCh1 = await lire(noms.find((n) => n.includes('chapitre-01'))!);
  verifier(
    `${nom}: « & » échappé en &amp; dans le corps du texte`,
    texteCh1.includes("masques d'or &amp; de velours")
  );
  const texteCh2 = await lire(noms.find((n) => n.includes('chapitre-02'))!);
  verifier(
    `${nom}: accents préservés en UTF-8 (« Écarlate », « pavé »)`,
    texteCh2.includes('Écarlate') && texteCh2.includes('pavé')
  );
  const texteCh3 = await lire(noms.find((n) => n.includes('chapitre-03'))!);
  verifier(
    `${nom}: balises et « & » échappés (&lt;des chevrons&gt;, &amp;)`,
    texteCh3.includes('&lt;des chevrons&gt;') && texteCh3.includes('un &amp;.')
  );
  verifier(
    `${nom}: paragraphes préservés (3 blocs du chap. 1)`,
    enParagraphes(CHAPITRES[0].texte).length === 3
  );
  verifier(
    `${nom}: titre de chapitre repris en <h1>`,
    texteCh1.includes('<h1>Chapitre 1 — Le bal masqué</h1>')
  );

  // 4. Taille.
  const taille = octets.length;
  console.log(`  taille : ${taille} octets (${(taille / 1024).toFixed(2)} Kio)`);
}

async function main() {
  const dossier = join(process.cwd(), '.epub-test');
  mkdirSync(dossier, { recursive: true });

  // --- A. Sans couverture ---
  const octets = await genererEpub({
    titre: 'Nuit Écarlate',
    auteur: 'Autrice Test',
    langue: 'fr',
    identifiant: 'urn:uuid:11111111-2222-4333-8444-555555555555',
    date: '2026-10-01T10:00:00.000Z',
    chapitres: CHAPITRES,
  });
  const chemin = join(dossier, 'nuit-ecarlate.epub');
  writeFileSync(chemin, octets);
  verifier('fichier .epub écrit sur disque', statSync(chemin).size === octets.length);
  await inspecter('sans couverture', octets, false);

  // --- B. Avec couverture ---
  const octetsC = await genererEpub({
    titre: 'Nuit Écarlate',
    auteur: 'Autrice Test',
    identifiant: 'urn:uuid:11111111-2222-4333-8444-555555555555',
    chapitres: CHAPITRES,
    couverture: { donnees: PNG_1x1, mediaType: 'image/png', nomFichier: 'couverture.png' },
  });
  const cheminC = join(dossier, 'nuit-ecarlate-couverture.epub');
  writeFileSync(cheminC, octetsC);
  await inspecter('avec couverture', octetsC, true);

  // --- C. Garde-fou : livre vide ---
  let refus = false;
  try {
    await genererEpub({ titre: 'Vide', chapitres: [] });
  } catch {
    refus = true;
  }
  verifier('livre sans chapitre refusé', refus);

  // --- D. Aller-retour : l'EPUB généré est relu par l'importeur maison. ---
  const { lireEpub } = await import('../lib/import-epub');
  const tampon = new ArrayBuffer(octets.byteLength);
  new Uint8Array(tampon).set(octets);
  const relu = await lireEpub(tampon);
  verifier('aller-retour : titre relu depuis l’OPF', relu.titre === 'Nuit Écarlate');
  verifier('aller-retour : auteur relu depuis l’OPF', relu.auteur === 'Autrice Test');
  verifier('aller-retour : 3 chapitres relus (spine)', relu.chapitres.length === 3);
  verifier(
    'aller-retour : texte intact (accents, « & »)',
    relu.chapitres[0].texte.includes("masques d'or & de velours") &&
      relu.chapitres[1].texte.includes("l'obscurité l'avalait") &&
      relu.chapitres[2].texte.includes('et un &')
  );

  console.log(`\nFichiers générés :\n  ${chemin}\n  ${cheminC}`);
  if (echecs > 0) {
    console.error(`\n${echecs} échec(s).`);
    process.exit(1);
  }
  console.log('\nTous les tests d’export EPUB passent.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
