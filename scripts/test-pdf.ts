// ============================================================
// test-pdf.ts — Régression « vrai livre » (PDF).
// Extrait le texte du PDF avec pdf.js (Node), découpe en
// chapitres puis en segments cohérents, vérifie l'intégrité,
// traduit un échantillon EN→FR via LibreTranslate local et
// vérifie l'assemblage. Le corpus reste stocké pour les tests
// futurs (« tester si tout marche à chaque fois »).
//
// Usage : npx tsx scripts/test-pdf.ts [pagesInitiales]
// ============================================================

import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraireTexteDocument, type DocumentPdf } from '../lib/texte-pdf';
import { decouperEnChapitres, decouperTexte, assembler, verifierIntegrite } from '../lib/segmenter';
import { preparerLivre, MAX_CHARS_SEGMENT } from '../lib/import-livre';
import { FournisseurLibreTranslate } from '../lib/providers/libretranslate';

const CHEMINS = [
  'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf',
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_5f9d5ba803c9__OceanofPDF.com_The_Predator_-__RuNyx (2).pdf',
];

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

async function principal() {
  const chemin = CHEMINS.find((c) => {
    try {
      readFileSync(c);
      return true;
    } catch {
      return false;
    }
  });
  if (!chemin) throw new Error('PDF introuvable.');
  const pagesVoulues = Number(process.argv[2] ?? 25);

  // pdf.js côté Node (legacy) — le worker n'est pas nécessaire ici.
  const donnees = new Uint8Array(readFileSync(chemin));
  const tache = getDocument({ data: donnees });
  const doc = (await tache.promise) as unknown as DocumentPdf;

  console.log(`— 1. Extraction PDF (${Math.min(pagesVoulues, doc.numPages)}/${doc.numPages} pages) —`);
  const debut = Date.now();
  const texte = await extraireTexteDocument(doc, {
    fin: pagesVoulues,
    onPage: (p, t) => process.stdout.write(`\r  page ${p}/${t}`),
  });
  console.log(`\n  ${texte.length.toLocaleString('fr')} caractères extraits en ${((Date.now() - debut) / 1000).toFixed(0)} s`);
  verifier('texte extrait non trivial', texte.trim().length > 5000);

  console.log('— 2. Détection des chapitres —');
  const chapitres = decouperEnChapitres(texte);
  console.log(`  ${chapitres.length} chapitre(s) détecté(s) sur l'échantillon`);
  chapitres.slice(0, 6).forEach((c) => console.log(`    · ${c.titre}`));
  verifier('chapitres détectés', chapitres.length >= 1);

  const premierReel = chapitres.find((c) => c.texte.trim().length >= 40);
  if (!premierReel) throw new Error('Aucun chapitre avec du contenu.');
  console.log(`  → chapitre testé : « ${premierReel.titre} »`);

  console.log('— 3. Découpage cohérent du premier chapitre —');
  const livre = preparerLivre(premierReel.texte, 'the-predator.txt');
  verifier('intégrité du chapitre (1:1)', verifierIntegrite(premierReel.texte, decouperTexte(premierReel.texte, MAX_CHARS_SEGMENT)));
  verifier('segments ≤ limite', livre.chapitres[0].segments.every((s) => s.source.length <= MAX_CHARS_SEGMENT));
  console.log(`  ${livre.chapitres[0].segments.length} segments (paragraphes) pour le chapitre`);
  const paragraphesMulti = livre.chapitres[0].segments.filter((s) => s.source.includes(' ')).length;
  verifier('unités = paragraphes complets', paragraphesMulti === livre.chapitres[0].segments.length);

  console.log('— 4. Traduction d’un échantillon (LibreTranslate local) —');
  const echantillon = livre.chapitres[0].segments.slice(0, 8);
  const fournisseur = new FournisseurLibreTranslate();
  const resultats: Array<{ traduit: string | null; suite: string }> = [];
  for (const segment of echantillon) {
    const texteFr = await fournisseur.traduire(segment.source, { source: 'en', cible: 'fr' });
    resultats.push({ traduit: texteFr, suite: segment.suite });
  }
  const assemble = assembler(resultats);
  verifier('traduction non vide', assemble.trim().length > 100);
  console.log('\n— Aperçu traduit (début du chapitre 1) —\n');
  console.log(assemble.trim().slice(0, 500));
  console.log('\n');

  await tache.destroy().catch(() => undefined);
  console.log(echecs === 0 ? '✓ TEST PDF COMPLET OK.' : `✗ ${echecs} échec(s).`);
  process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
