// ============================================================
// test-vitesse.ts — Test de VITESSE sur le vrai livre (PDF).
// Extrait The Predator en entier (297 p.), découpe en segments
// (paragraphes ≤ 6000 car.), traduit EN→FR avec le fournisseur
// rapide (Google libre / Gemini selon TRANSLATOR_DEFAULT) en
// pool parallèle, et chronomètre. Objectif : ≲ 60 s.
//
// Usage : npx tsx scripts/test-vitesse.ts [concurrence]
// ============================================================

import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraireTexteDocument, type DocumentPdf } from '../lib/texte-pdf';
import { decouperTexte } from '../lib/segmenter';
import { FournisseurGoogleLibre } from '../lib/providers/google';
import { FournisseurGemini } from '../lib/providers/gemini';

const CHEMIN =
  process.argv[3] ??
  'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf';

async function principal() {
  const concurrence = Number(process.argv[2] ?? 10);
  const donnees = new Uint8Array(readFileSync(CHEMIN));
  const tache = getDocument({ data: donnees });
  const doc = (await tache.promise) as unknown as DocumentPdf;

  console.log('— Extraction du PDF complet…');
  const t0 = Date.now();
  const texte = await extraireTexteDocument(doc, {
    onPage: (p, t) => process.stdout.write(`\r  page ${p}/${t}`),
  });
  console.log(`\n  ${texte.length.toLocaleString('fr')} caractères en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await tache.destroy().catch(() => undefined);

  console.log('— Découpage en segments (paragraphes)…');
  const segments = decouperTexte(texte, 6000)
    .map((u) => u.source)
    .filter((s) => s.trim().length > 0);
  console.log(`  ${segments.length.toLocaleString('fr')} segments`);

  const fournisseur = process.env.TRANSLATOR_DEFAULT === 'gemini'
    ? new FournisseurGemini()
    : new FournisseurGoogleLibre();
  console.log(`— Traduction EN→FR via ${fournisseur.nom} (pool ×${concurrence}) —`);

  let suivant = 0;
  let erreurs = 0;
  const debut = Date.now();
  const extraits: string[] = [];
  const t0Appel = Date.now();

  const travailleurs = Array.from({ length: concurrence }, async () => {
    for (;;) {
      const i = suivant++;
      if (i >= segments.length) return;
      try {
        const fr = await fournisseur.traduire(segments[i], {
          source: 'en',
          cible: 'fr',
        });
        if (extraits.length < 3 && i < 60) extraits.push(fr);
      } catch {
        erreurs += 1;
      }
    }
  });
  await Promise.all(travailleurs);

  const dureeS = (Date.now() - debut) / 1000;
  const totalCar = segments.reduce((n, s) => n + s.length, 0);
  console.log(
    `\n  ${totalCar.toLocaleString('fr')} car. → ${dureeS.toFixed(1)} s ` +
      `(${Math.round(totalCar / dureeS).toLocaleString('fr')} car/s) · appel API démarré après ${((t0Appel - t0) / 1000).toFixed(1)} s`
  );
  console.log(`  erreurs : ${erreurs}`);
  console.log(`  ✓ ${dureeS < 60 ? 'MOINS D’UNE MINUTE' : 'objectif 60 s non atteint'}`);

  console.log('\n— Aperçu qualité (début) —\n');
  console.log(extraits.slice(0, 3).join('\n\n').slice(0, 700));
  process.exit(erreurs > segments.length / 2 ? 1 : 0);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
