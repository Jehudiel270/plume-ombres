// ============================================================
// traduire-livre.ts — Traduit le livre PDF de test EN→FR et
// sauvegarde le résultat complet sur disque.
// Usage : npx tsx scripts/traduire-livre.ts [fichierSortie]
// Fournisseur : auto (Gemini si clé, sinon Google libre).
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraireTexteDocument, type DocumentPdf } from '../lib/texte-pdf';
import { decouperTexte } from '../lib/segmenter';
import { fournisseurActif } from '../lib/providers';

const ENTREE = 'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf';
const SORTIE = process.argv[2] ?? 'C:/Users/dosso/dev/test-corpus/The_Predator_FR.md';
const CONCURRENCE = 12;

async function principal() {
  const donnees = new Uint8Array(readFileSync(ENTREE));
  const tache = getDocument({ data: donnees });
  const doc = (await tache.promise) as unknown as DocumentPdf;

  console.log('— Extraction du PDF complet…');
  const texte = await extraireTexteDocument(doc, {
    onPage: (p, t) => process.stdout.write(`\r  page ${p}/${t}`),
  });
  console.log(`\n  ${texte.length.toLocaleString('fr')} caractères`);
  await tache.destroy().catch(() => undefined);

  // Segments = paragraphes (≤ 6000 car.), avec leur « suite » (espacement).
  const unites = decouperTexte(texte, 6000);

  const fournisseur = fournisseurActif();
  console.log(`— Traduction EN→FR via ${fournisseur.nom} (×${CONCURRENCE}) —`);

  const traductions: string[] = new Array(unites.length).fill('');
  let suivant = 0;
  let erreurs = 0;
  const debut = Date.now();

  const travailleurs = Array.from({ length: CONCURRENCE }, async () => {
    for (;;) {
      const i = suivant++;
      if (i >= unites.length) return;
      const u = unites[i];
      if (!u.source) {
        traductions[i] = '';
        continue;
      }
      try {
        traductions[i] = await fournisseur.traduire(u.source, {
          source: 'en',
          cible: 'fr',
        });
      } catch {
        erreurs += 1;
        traductions[i] = u.source; // repli : texte source conservé
      }
    }
  });
  await Promise.all(travailleurs);

  const dureeS = (Date.now() - debut) / 1000;
  const totalCar = unites.reduce((n, u) => n + u.source.length, 0);
  console.log(
    `\n  ${totalCar.toLocaleString('fr')} car. → ${dureeS.toFixed(1)} s (${Math.round(totalCar / dureeS).toLocaleString('fr')} car/s) · erreurs : ${erreurs}`
  );

  // Réassemblage : chaque unité traduite + sa « suite », paragraphes aérés.
  const corps = unites
    .map((u, i) => (traductions[i] || '') + u.suite)
    .join('')
    // On rétablit des paragraphes lisibles (séparés par une ligne vide)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const markdown = `# The Predator — Dark Verse #1\n### RuNyx — Traduction française (${new Date().toLocaleDateString('fr-FR')})\n\n${corps}\n`;
  writeFileSync(SORTIE, markdown, 'utf8');
  console.log(`✓ Écrit : ${SORTIE} (${markdown.length.toLocaleString('fr')} caractères)`);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
