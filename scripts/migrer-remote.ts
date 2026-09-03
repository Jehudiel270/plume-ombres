// Applique la migration SQL au projet Supabase hébergé, via le pooler IPv4.
// Essaie plusieurs régions (le pooler rejette vite les mauvaises régions).
// Usage : npx tsx scripts/migrer-remote.ts
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu
    .split('\n')
    .find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable dans .env.local`);
  return ligne.split('=').slice(1).join('=').trim();
}

const REF = 'imbziizequckeaxuotdz';
const MOT_DE_PASSE = lireEnvLocal('SUPABASE_DB_PASSWORD');

// Hôte exact fourni par le dashboard (« Session pooler », IPv4).
const HOTE = 'aws-1-eu-west-1.pooler.supabase.com';
const PORT = 5432;

async function tenter(host: string, port: number): Promise<boolean> {
  const client = new Client({
    host,
    port,
    user: `postgres.${REF}`, // convention du pooler Supabase
    password: MOT_DE_PASSE,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    console.log(`✓ Connecté via ${host}:${port}`);
    const sql = readFileSync(
      'supabase/migrations/20260903000001_schema.sql',
      'utf8'
    );
    console.log('Application de la migration…');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
      console.log('✓ Migration appliquée');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
    const { rows } = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`
    );
    console.log('Tables publiques :', rows.map((r) => r.table_name).join(', '));
    await client.end();
    return true;
  } catch (e) {
    await client.end().catch(() => undefined);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('password authentication failed')) {
      console.log(`✗ ${host}:${port} — refusé (mauvaise région ou mot de passe)`);
    } else {
      console.log(`✗ ${host}:${port} — ${message.slice(0, 90)}`);
    }
    return false;
  }
}

async function principal() {
  if (await tenter(HOTE, PORT)) return;
  if (await tenter(HOTE, 6543)) return;
  console.error('Connexion impossible.');
  process.exit(1);
}

principal();
