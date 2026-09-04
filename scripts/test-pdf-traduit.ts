// ============================================================
// test-pdf-traduit.ts — Test réel du générateur de PDF traduit.
// 1. Mesure la géométrie du PDF original (The Predator, corpus test)
//    via l'identique calculerGeo() utilisé en prod (source unique).
// 2. Charge LE LIVRE LE PLUS TRADUIT de la base (pg direct pooler).
// 3. Génère le PDF traduit en français (pdf-lib).
// 4. Vérifie via PyMuPDF : pages, caractères, accents.
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { genererPdfTraduit, type GeoOrigine } from '../lib/pdf-traduit';
import { calculerGeo, type PageBrute } from '../lib/geo-pdf';

function envVar(nom: string): string {
  const ligne = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(nom + '='));
  return (ligne ?? '').slice(nom.length + 1).trim();
}

async function main() {
  // --- 1. Géométrie de l'original (The Predator). ---
  const pdf = readFileSync('C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf');
  const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(pdf) }).promise;
  const p1 = await doc.getPage(1);
  const vp = p1.getViewport({ scale: 1 });

  // Zones de texte des 20 premières pages → marges constatées.
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity, // pdf.js : origine en BAS
    maxY = -Infinity;
  for (let i = 1; i <= 20 && i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    for (const it of (tc as any).items) {
      if (!it.str || !it.str.trim()) continue;
      const [, , , , e, f] = it.transform;
      minX = Math.min(minX, e);
      maxX = Math.max(maxX, e + it.width);
      minY = Math.min(minY, f);
      maxY = Math.max(maxY, f + it.height);
    }
  }
  // Conversion : marge basse (pdf.js, origine en bas) = marge basse PDF.
  // Marge haute PDF (origine en haut) = hauteur - maxY.
  const geo: GeoOrigine = {
    largeur: Math.round(vp.width),
    hauteur: Math.round(vp.height),
    margeGauche: Math.max(40, Math.round(minX)),
    margeDroite: Math.max(40, Math.round(vp.width - maxX)),
    margeHaut: Math.max(50, Math.round(vp.height - maxY)),
    margeBas: Math.max(50, Math.round(minY)),
  };
  console.log(
    `Original : ${doc.numPages} pages, ${vp.width}x${vp.height}pt, marges G${geo.margeGauche} D${geo.margeDroite} H${geo.margeHaut} B${geo.margeBas}`
  );
  await doc.destroy?.().catch(() => undefined);

  // --- 2. Livre le plus traduit dans la base (pg direct). ---
  const pg = new Client({
    // Host db.* non résolu ici : le pooler est le chemin fiable.
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: envVar('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const q = await pg.query(`
    SELECT l.titre, l.auteur, ch.position, ch.titre c_titre,
           ch.texte_source, ch.texte_traduit
      FROM livres l
      JOIN chapitres ch ON ch.livre_id = l.id
     WHERE l.id = (
        SELECT l2.id FROM livres l2
        JOIN chapitres ch3 ON ch3.livre_id = l2.id
        JOIN segments s ON s.chapitre_id = ch3.id
        GROUP BY l2.id
        ORDER BY count(*) FILTER (WHERE s.statut = 'fait') DESC
        LIMIT 1
      )
     ORDER BY ch.position;
  `);
  await pg.end();

  if (q.rows.length === 0) throw new Error('Aucun chapitre en base.');
  const titreLivre = q.rows[0].titre as string;
  const auteur = (q.rows[0].auteur as string) ?? '';
  const chapitres = q.rows.map((r: any) => ({
    titre: r.c_titre,
    texte: (r.texte_traduit && (r.texte_traduit as string).trim())
      ? (r.texte_traduit as string)
      : (r.texte_source as string),
  }));
  const nbChars = chapitres.reduce((n: number, c) => n + c.texte.length, 0);
  const aDejaFait = chapitres.every(
    (c, i) =>
      (q.rows[i] as any).texte_traduit &&
      (q.rows[i] as any).texte_traduit.trim().length > 0
  );
  console.log(
    `Livre traduit : « ${titreLivre} » (${chapitres.length} chapitres, ${nbChars.toLocaleString('fr-FR')} caractères)`
  );
  if (!aDejaFait) {
    console.warn('⚠ Chapitre(s) non traduits → sortie en source pour ceux-là.');
  }

  // --- 3. Génération du PDF traduit. ---
  const t0 = Date.now();
  const bytes = await genererPdfTraduit({
    titreLivre,
    auteur,
    chapitres,
    geo,
    onChapitre: (n, total) =>
      process.stdout.write(`\rChapitre ${n + 1}/${total}`),
  });
  const ms = Date.now() - t0;
  const out = 'C:/Users/dosso/dev/test-corpus/Predator_FR_test.pdf';
  writeFileSync(out, bytes);
  console.log(
    `\nGénéré en ${ms} ms → ${out} (${(bytes.length / 1024).toFixed(0)} Ko)`
  );

  // --- 4. Vérification via PyMuPDF. ---
  const check = execFileSync(
    '/c/Users/dosso/dev/lt-venv/Scripts/python.exe',
    ['C:/Users/dosso/dev/test-corpus/verifier-pdf.py', out]
  ).toString();
  console.log('Vérification PyMuPDF :', check.trim());
  const infos = JSON.parse(check);
  if (infos.pages < 3) throw new Error('Trop peu de pages générées.');
  if (aDejaFait && infos.mots_anglais > infos.lettres_accentuees)
    throw new Error('Le texte sorti en anglais — traduction non appliquée.');
  console.log('✅ PDF traduit OK — pages, langue et texte vérifiés.');
}

main().catch((e) => {
  console.error('❌ ÉCHEC :', e);
  process.exit(1);
});