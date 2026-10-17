// ============================================================
// preuve-decoupage.ts — PREUVE du découpage en chapitres d'un PDF.
//
// Extrait le texte du PDF avec le VRAI pipeline (lib/texte-pdf.ts),
// applique le VRAI détecteur (lib/segmenter.ts → decouperEnChapitres)
// et affiche les chapitres produits avec leur longueur.
//
// Usage :
//   npx tsx scripts/preuve-decoupage.ts [chemin.pdf] [pages]
//   npx tsx scripts/preuve-decoupage.ts --dump        (écrit le .txt extrait)
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraireTexteDocument, type DocumentPdf } from '../lib/texte-pdf';
import { decouperEnChapitres } from '../lib/segmenter';

const PDF_DEFAUT =
  "D:/Programmation 2.0/plume d'ombres/logo & tag/logo et livre de teste/_OceanofPDF.com_Hunting_Adeline_English_Edition_-_HD_Carlton.pdf";

async function principal() {
  const args = process.argv.slice(2);
  const dump = args.includes('--dump');
  const positionnels = args.filter((a) => !a.startsWith('--'));
  const chemin = positionnels[0] ?? PDF_DEFAUT;
  const pages = positionnels[1] ? Number(positionnels[1]) : undefined;

  const donnees = new Uint8Array(readFileSync(chemin));
  const tache = getDocument({ data: donnees });
  const doc = (await tache.promise) as unknown as DocumentPdf;
  console.log(`PDF : ${basename(chemin)} — ${doc.numPages} pages`);

  const debut = Date.now();
  const texte = await extraireTexteDocument(doc, {
    fin: pages,
    onPage: (p, t) => {
      if (p % 25 === 0 || p === t) process.stdout.write(`\r  extraction ${p}/${t}`);
    },
  });
  process.stdout.write('\n');
  console.log(
    `Texte extrait : ${texte.length.toLocaleString('fr')} caractères en ${(
      (Date.now() - debut) / 1000
    ).toFixed(1)} s`
  );
  if (dump) {
    const sortie = 'C:/Users/dosso/AppData/Local/Temp/hunting-adeline-extrait.txt';
    writeFileSync(sortie, texte, 'utf8');
    console.log(`Texte brut écrit : ${sortie}`);
  }

  const chapitres = decouperEnChapitres(texte);
  const total = chapitres.reduce((n, c) => n + c.texte.length, 0);
  const titresChapter = chapitres.filter((c) => /^chapter\b/i.test(c.titre)).length;
  const titresChapitre = chapitres.filter((c) => /^chapitre\b/i.test(c.titre)).length;
  const courts = chapitres.filter((c) => c.texte.trim().length < 200);

  console.log(
    `\n${chapitres.length} chapitres produits | ${total.toLocaleString('fr')} car. | ` +
      `« Chapter… » ${titresChapter} | « Chapitre… » ${titresChapitre} | blocs < 200 car. ${courts.length}`
  );
  console.log('\n  idx | longueur | titre / début du contenu');
  console.log('  ----|----------|------------------------------------------');
  chapitres.forEach((c, i) => {
    const apercu = c.texte.trim().replace(/\s+/g, ' ').slice(0, 46);
    console.log(
      `  ${String(i).padStart(3)} | ${String(c.texte.trim().length).padStart(8)} | ${c.titre
        .slice(0, 40)
        .padEnd(40)} ${apercu ? '· ' + apercu : ''}`
    );
  });

  await tache.destroy().catch(() => undefined);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
