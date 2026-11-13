// ============================================================
// preuve-journal.mjs — Preuve de bout en bout du journal_admin.
// 1) structure + RLS + privilèges + 4 déclencheurs ;
// 2) écriture réelle DANS UNE TRANSACTION ANNULÉE (roll back) :
//    un insert dans fonctionnalites_etats et parametres_systeme
//    doit produire une trace dans journal_admin, puis tout disparaît.
// ============================================================
import { Client } from 'pg';

const c = new Client({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = async (sql) => (await c.query(sql)).rows;

console.log('— 1. STRUCTURE —');
const t = await q(`select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='journal_admin'`);
console.log(`  journal_admin : présente, RLS ${t[0].rls ? 'activée' : '✗ ABSENTE'}`);
const p = await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='journal_admin' and grantee='anon'`);
console.log(`  droits anon   : ${p.length ? p.map((x) => x.privilege_type).join(',') : 'aucun ✓'}`);
const pol = await q(`select policyname, cmd from pg_policies where schemaname='public' and tablename='journal_admin'`);
pol.forEach((x) => console.log(`  policy        : ${x.policyname} (${x.cmd})`));

console.log('\n— 2. DÉCLENCHEURS —');
const tr = await q(`select tgrelid::regclass as table, tgname from pg_trigger where not tgisinternal and tgname like 'tracer%' order by 1,2`);
tr.forEach((x) => console.log(`  ✓ ${x.table} ← ${x.tgname}`));

console.log('\n— 3. ESSAI RÉEL (transaction annulée à la fin) —');
await c.query('begin');
try {
  await c.query(`insert into public.fonctionnalites_etats (cle, actif, deploiement) values ('essai-journal', true, 0)`);
  await c.query(`insert into public.parametres_systeme (cle, valeur) values ('essai_journal', 'valeur-fictive')`);
  const lignes = await q(`select action, motif, admin_id is null as admin_null from public.journal_admin order by cree_le`);
  lignes.forEach((l) => console.log(`  trace : ${l.action} — ${l.motif.slice(0, 70)}${l.admin_null ? ' (admin_id null : écriture hors session admin, attendu)' : ''}`));
  console.log(`  → ${lignes.length} trace(s) capturée(s) : déclencheurs OPÉRATIONNELS`);
} finally {
  await c.query('rollback');
}
const apres = await q(`select count(*)::int as n from public.journal_admin`);
console.log(`  après rollback : ${apres[0].n} ligne(s) dans journal_admin (0 attendu)`);

console.log('\n— 4. IMMUTABILITÉ API (anon ne doit rien pouvoir) —');
await c.query(`begin; set local role anon;`);
try {
  await c.query(`select count(*) from public.journal_admin`);
  console.log('  ✗ anon a pu lire !');
} catch (e) {
  console.log(`  ✓ lecture anon refusée (${String(e.message).slice(0, 60)})`);
}
await c.query('rollback');

await c.end();
