// Sonde ROLE (lecture seule) — état réel de la base avant la vague super_admin.
// Usage : node scripts/_probe-roles.mjs   (depuis la racine du dépôt)
import { readFileSync } from 'node:fs';
import pg from 'pg';

function chargerEnv() {
  const contenu = readFileSync('.env.local', 'utf8');
  // Découpe tolérante aux fins de ligne Windows (\r\n) : sans cela,
  // l'expression régulière échoue et AUCUNE variable n'est chargée.
  for (const ligne of contenu.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$/.exec(ligne);
    if (!m) continue;
    let valeur = m[2].trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = valeur;
  }
}

chargerEnv();

const client = new pg.Client({
  host: (process.env.SUPABASE_DB_HOST ?? '').includes('pooler')
    ? process.env.SUPABASE_DB_HOST
    : 'aws-1-eu-west-1.pooler.supabase.com',
  port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
  user: 'postgres.imbziizequckeaxuotdz',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const q = async (sql, args) => (await client.query(sql, args)).rows;

try {
  await client.connect();
  console.log('== comptes (profiles + auth.users) ==');
  console.table(
    await q(`select p.id, p.pseudo, p.role, u.email, p.created_at::date::text as cree
               from public.profiles p left join auth.users u on u.id = p.id
              order by p.created_at`)
  );

  console.log('\n== contrainte profiles.role ==');
  console.log(
    await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
              where conrelid='public.profiles'::regclass and contype='c'`)
  );

  console.log('\n== contrainte admin_actions.action ==');
  console.log(
    await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
              where conrelid='public.admin_actions'::regclass and contype='c'`)
  );

  console.log('\n== fonctions role/admin ==');
  console.table(
    await q(`select proname, prosecdef, pg_get_function_arguments(oid) as args
               from pg_proc where pronamespace='public'::regnamespace
                and (proname like '%admin%' or proname like '%role%')
              order by proname`)
  );

  console.log('\n== trigger proteger_role_profiles ==');
  console.log(
    await q(`select tgname, pg_get_triggerdef(oid) as def from pg_trigger
              where tgrelid='public.profiles'::regclass and not tgisinternal`)
  );

  console.log('\n== admin_actions récentes ==');
  console.table(
    await q(`select id, admin_id, cible_id, action, duree, cree_le::text
               from public.admin_actions order by cree_le desc limit 10`)
  );

  console.log('\n== administrateurs (liste blanche) existe ? ==');
  console.log(await q(`select to_regclass('public.administrateurs') as t`));

  console.log('\n== abonnements / credits ==');
  console.log(await q(`select to_regclass('public.abonnements') as abo, to_regclass('public.credits_traduction') as credits`));
} catch (e) {
  console.error('ERREUR:', e.message);
} finally {
  await client.end().catch(() => {});
}
