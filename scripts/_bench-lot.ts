// ============================================================
// scripts/_bench-lot.ts — Mesure RÉELLE du débit de la route par lot.
//
// Prend de vrais segments « en attente » d'un livre en base et les
// traduit avec la VRAIE chaîne de secours (aucun mock), dans un seul
// lot serveur. N'écrit RIEN en base : mesure uniquement.
//
// Usage : npx tsx scripts/_bench-lot.ts [segments] [concurrence]
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { traiterLotSegments } from '../lib/traduction/lot';

// --- Chargement de .env.local (jamais affiché) ----------------
try {
  for (const ligne of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, cle, valeur] = m;
    if (!process.env[cle]) process.env[cle] = valeur.trim();
  }
} catch {
  /* fichier absent : l'environnement fournit déjà les clés */
}

const ligneEnv = (c: string) =>
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(c + '='))!
    .split('=')
    .slice(1)
    .join('=')
    .trim();

async function principal() {
  const nombre = Number(process.argv[2] ?? 24);
  const concurrence = Number(process.argv[3] ?? 8);

  const pg = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: ligneEnv('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
  });
  await pg.connect();

  const { rows: livres } = await pg.query(`
    SELECT l.id, l.titre, l.langue_source, l.langue_cible,
           count(s.id) FILTER (WHERE s.statut IN ('en_attente','erreur')) AS restants,
           sum(length(s.source)) FILTER (WHERE s.statut IN ('en_attente','erreur')) AS caracteres
    FROM livres l
    JOIN chapitres c ON c.livre_id = l.id
    JOIN segments s ON s.chapitre_id = c.id
    GROUP BY l.id, l.titre, l.langue_source, l.langue_cible
    HAVING count(s.id) FILTER (WHERE s.statut IN ('en_attente','erreur')) > 100
    ORDER BY restants DESC
    LIMIT 1
  `);
  const livre = livres[0];
  if (!livre) throw new Error('Aucun livre avec des segments en attente.');
  console.log(
    `Livre de mesure : « ${livre.titre} » — ${livre.restants} segments restants, ${livre.caracteres} caractères`
  );

  const { rows: segments } = await pg.query(
    `
    SELECT s.id, s.source
    FROM segments s
    JOIN chapitres c ON c.id = s.chapitre_id
    WHERE c.livre_id = $1 AND s.statut IN ('en_attente','erreur')
      AND length(s.source) > 0
    ORDER BY s.position
    LIMIT $2
  `,
    [livre.id, nombre]
  );
  await pg.end();

  const lot = segments.map((s) => ({ id: String(s.id), texte: s.source as string }));
  const caracteres = lot.reduce((n, s) => n + s.texte.length, 0);
  console.log(
    `Lot : ${lot.length} segments, ${caracteres} caractères, concurrence ${concurrence}\n`
  );

  const t0 = Date.now();
  const resultat = await traiterLotSegments(lot, {
    source: livre.langue_source,
    cible: livre.langue_cible,
    concurrence,
  });
  const duree = (Date.now() - t0) / 1000;

  const moteurs: Record<string, number> = {};
  for (const r of resultat.resultats) {
    moteurs[r.fournisseur] = (moteurs[r.fournisseur] ?? 0) + 1;
  }

  console.log(`Segments traduits : ${resultat.resultats.length}/${lot.length}`);
  console.log(`Échecs           : ${resultat.echecs.length}`);
  if (resultat.echecs.length > 0) {
    const raisons: Record<string, number> = {};
    for (const e of resultat.echecs) raisons[e.raison] = (raisons[e.raison] ?? 0) + 1;
    console.log(`Raisons          : ${JSON.stringify(raisons)}`);
  }
  console.log(`Moteurs          : ${JSON.stringify(moteurs)}`);
  console.log(`Durée            : ${duree.toFixed(1)} s`);
  console.log(`Débit            : ${Math.round(caracteres / duree)} car/s`);
  console.log(
    `Projection livre : ${((Number(livre.caracteres) / (caracteres / duree)) / 60).toFixed(1)} min pour ${livre.restants} segments restants`
  );
  console.log('\nAperçu :');
  console.log((resultat.resultats[0]?.traduit ?? '').slice(0, 300));
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
