// ============================================================
// scripts/sauvegarde-bdd.mts — Sauvegarde de la base (W10 / P1.7).
//
// Le plan gratuit Supabase ne fournit AUCUNE sauvegarde : ce script
// exporte toutes les tables du schéma `public` en JSON compressé,
// horodaté, HORS du dépôt Git (les textes de livres ne doivent
// jamais finir dans un commit).
//
// Usage   : npx tsx scripts/sauvegarde-bdd.mts [dossierSortie]
// Défaut  : <dev>/sauvegardes-plume
// Rétention : 14 fichiers les plus récents (configurable ci-dessous).
//
// Le schéma `auth` est VOLONTAIREMENT exclu : il contient des
// empreintes de mots de passe et relève de Supabase, pas de l'app.
// ============================================================

import { readFileSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { Client } from 'pg';

const RETENTION = 14;
const DOSSIER_DEFAUT = 'C:/Users/dosso/dev/sauvegardes-plume';

function lireEnv(): Record<string, string> {
  const env = readFileSync('.env.local', 'utf8');
  const sortie: Record<string, string> = {};
  for (const ligne of env.split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) sortie[m[1]] = m[2].trim();
  }
  return sortie;
}

async function principal() {
  const dossier = process.argv[2] ?? DOSSIER_DEFAUT;
  mkdirSync(dossier, { recursive: true });

  const env = lireEnv();
  const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https:\/\//, '').split('.')[0];
  const pg = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${ref}`,
    password: env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const tables = await pg.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`
  );

  const donnees: Record<string, unknown[]> = {};
  const compte: Record<string, number> = {};
  for (const { tablename } of tables.rows) {
    const r = await pg.query(`select * from public."${tablename}"`);
    donnees[tablename] = r.rows;
    compte[tablename] = r.rows.length;
  }
  await pg.end();

  const paquet = {
    version: 1,
    horodatage: new Date().toISOString(),
    projet: ref,
    tables: compte,
    donnees,
  };
  const brut = Buffer.from(JSON.stringify(paquet), 'utf8');
  const comprime = gzipSync(brut, { level: 9 });

  const horo = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const fichier = join(dossier, `plume-${horo}.json.gz`);
  writeFileSync(fichier, comprime);

  // Rétention : on ne garde que les N plus récents.
  const anciens = readdirSync(dossier)
    .filter((f) => f.startsWith('plume-') && f.endsWith('.json.gz'))
    .map((f) => ({ f, t: statSync(join(dossier, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  let supprimes = 0;
  for (const { f } of anciens.slice(RETENTION)) {
    unlinkSync(join(dossier, f));
    supprimes += 1;
  }

  const total = Object.values(compte).reduce((n, v) => n + v, 0);
  console.log(`sauvegarde : ${fichier}`);
  console.log(`taille     : ${(comprime.length / 1024).toFixed(1)} Ko (${(brut.length / 1024).toFixed(1)} Ko brut)`);
  console.log(`tables     : ${tables.rows.length} · lignes : ${total}`);
  console.log(`détail     : ${Object.entries(compte).map(([t, n]) => `${t}=${n}`).join(' ')}`);
  console.log(`rétention  : ${anciens.length - supprimes}/${RETENTION} fichiers conservés (+${supprimes} purgés)`);
  console.log('RÉSUMÉ_JSON ' + JSON.stringify({ fichier, tables: tables.rows.length, lignes: total, ko: Math.round(comprime.length / 1024), purges: supprimes }));
}

principal().catch((e) => {
  console.error('ÉCHEC sauvegarde :', e instanceof Error ? e.message : e);
  process.exit(1);
});
