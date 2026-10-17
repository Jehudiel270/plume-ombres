import { readFileSync } from 'node:fs';
import { Client } from 'pg';
const contenu = readFileSync('.env.local', 'utf8');
const ligne = (c) =>
  contenu
    .split('\n')
    .find((l) => l.trim().startsWith(c + '='))
    .split('=')
    .slice(1)
    .join('=')
    .trim();
const pg = new Client({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: ligne('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
});
await pg.connect();
const { rows: trg } = await pg.query(`
  SELECT t.tgname, c.relname AS table_cible, p.proname AS fonction
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND (c.relname IN ('livres','notifications') OR p.proname LIKE '%notif%')
`);
console.log('TRIGGERS:', trg.length ? trg.map((t) => `${t.tgname} sur ${t.table_cible} -> ${t.fonction}`).join(' | ') : 'AUCUN');
const { rows: st } = await pg.query(`SELECT statut, count(*)::int AS n FROM livres GROUP BY statut`);
console.log('LIVRES PAR STATUT:', JSON.stringify(st));
await pg.end();
