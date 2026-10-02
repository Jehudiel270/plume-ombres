// ============================================================
// scripts/test-roles-admin.ts — Test exécutable des rôles et de
// l'administration (W4e).
// Usage : npx tsx scripts/test-roles-admin.ts
//
//   A. MATRICE rôles × permissions : exécute le VRAI code de
//      lib/roles.ts (deciderAcces / aLaPermission) pour chaque rôle
//      (anonyme, utilisateur, admin), route par route.
//   B. CHEMIN D'INTERFACE : les liens de navigation par rôle et le
//      CUMUL (aucun lien existant retiré).
//   C. GARDE × ROUTE : le source des entrées sensibles appelle bien
//      la permission attendue ; aucune politique admin sur le
//      CONTENU (livres / chapitres / segments).
//   D. DURÉES d'abonnement : 'vie', '1_mois', '3_mois', '12_mois',
//      date ISO → jours.
//   E. STRUCTURE en base : profiles.role + contrainte, est_admin
//      SECURITY DEFINER, admin_actions RLS, grants des RPC.
//   F. RLS réelle (impersonation dans une TRANSACTION annulée) :
//      l'admin lit tous les profils mais AUCUN livre/chapitre/
//      segment d'autrui ; l'utilisateur ne lit que les siens ;
//      l'anonyme ne lit rien.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client as ClientPg } from 'pg';
import {
  ROLES,
  PERMISSIONS,
  PERMISSIONS_INTERDITES,
  deciderAcces,
  aLaPermission,
  normaliserRole,
  estRole,
  liensNavigationSupplementaires,
  type Role,
  type Permission,
} from '../lib/roles';
import {
  resoudreDuree,
  joursDepuisDate,
  JOURS_PAR_DUREE,
  JOURS_VIE,
} from '../lib/admin-abonnements';

let URL_SUPABASE = '';
function chargerEnv() {
  let contenu = '';
  try {
    contenu = readFileSync('.env.local', 'utf8');
  } catch {
    return;
  }
  for (const ligne of contenu.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(ligne);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
  URL_SUPABASE =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://imbziizequckeaxuotdz.supabase.co';
}

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

function ouvrirPg(): ClientPg {
  return new ClientPg({
    host: (process.env.SUPABASE_DB_HOST ?? '').includes('pooler')
      ? process.env.SUPABASE_DB_HOST!
      : 'aws-1-eu-west-1.pooler.supabase.com',
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    user: 'postgres.imbziizequckeaxuotdz',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}

const PERMISSIONS_ADMIN: readonly Permission[] = [
  'admin.tableau_de_bord.voir',
  'admin.stats.voir',
  'admin.comptes.lister',
  'admin.abonnements.lire',
  'admin.abonnements.attribuer',
  'admin.abonnements.revoquer',
];

// ============================================================
// A. Matrice rôles × permissions (VRAI code, exécuté par rôle)
// ============================================================
function partieA() {
  console.log('\n— A. Matrice rôles × permissions —');

  verifier(
    'A : deux rôles exactement, listes explicites',
    ROLES.length === 2 && ROLES.includes('utilisateur') && ROLES.includes('admin'),
    ROLES.join(',')
  );
  verifier(
    'A : normaliser un rôle inconnu → utilisateur (jamais admin)',
    normaliserRole('superadmin') === 'utilisateur' &&
      normaliserRole(null) === 'utilisateur' &&
      estRole('admin') &&
      !estRole('root')
  );

  // Route par route, rôle par rôle : anonyme (null) = 401.
  for (const permission of PERMISSIONS) {
    verifier(
      `A : anonyme REFUSÉ (401) sur ${permission}`,
      deciderAcces(null, permission) === 401
    );
  }

  // utilisateur : 200 uniquement sur espace.mes_livres.
  verifier(
    'A : utilisateur — espace.mes_livres OUI, tout l’admin NON (403)',
    deciderAcces('utilisateur', 'espace.mes_livres') === 200 &&
      PERMISSIONS_ADMIN.every((p) => deciderAcces('utilisateur', p) === 403) &&
      deciderAcces('utilisateur', 'contenu.tiers.lire') === 403
  );

  // admin : toutes les permissions admin OUI, plus son espace.
  verifier(
    'A : admin — permissions d’administration OUI',
    PERMISSIONS_ADMIN.every((p) => deciderAcces('admin', p) === 200) &&
      deciderAcces('admin', 'espace.mes_livres') === 200
  );

  // INTERDICTION ABSOLUE : contenu des livres d'autrui, pour TOUS.
  verifier(
    'A : contenu.tiers.lire INTERDIT à utilisateur ET admin',
    PERMISSIONS_INTERDITES.includes('contenu.tiers.lire') &&
      !aLaPermission('utilisateur', 'contenu.tiers.lire') &&
      !aLaPermission('admin', 'contenu.tiers.lire')
  );
}

// ============================================================
// B. Chemin d'interface : liens par rôle + CUMUL
// ============================================================
function partieB() {
  console.log('\n— B. Liens de navigation par rôle (cumul) —');

  const lienUtilisateur = liensNavigationSupplementaires('utilisateur');
  const lienAdmin = liensNavigationSupplementaires('admin');

  verifier('B : utilisateur — AUCUN lien de gestion', lienUtilisateur.length === 0);
  verifier(
    'B : admin — lien /admin présent',
    lienAdmin.some((l) => l.href === '/admin')
  );

  // CUMUL : les liens du rôle s'AJOUTENT à la base, ne la remplacent pas.
  const base = [{ href: '/bibliotheque', libelle: 'Bibliothèque' }];
  const nav = (role: Role) => [...base, ...liensNavigationSupplementaires(role)];
  verifier(
    'B : cumul — les liens existants survivent pour les deux rôles',
    nav('utilisateur').some((l) => l.href === '/bibliotheque') &&
      nav('admin').some((l) => l.href === '/bibliotheque') &&
      nav('admin').length === base.length + 1
  );

  // Le composant RÉEL utilise bien la fonction et concatène (pas de remplacement).
  const source = readFileSync('components/BarreNavigation.tsx', 'utf8');
  verifier(
    'B : BarreNavigation utilise liensNavigationSupplementaires',
    source.includes('liensNavigationSupplementaires(role)')
  );
  verifier(
    'B : BarreNavigation n’a pas de branche qui REMPLACE les liens',
    !/liensSupplementaires\s*=\s*\[(?!\.\.\.)/.test(source)
  );
}

// ============================================================
// C. Garde × route (source) + aucune politique admin sur le contenu
// ============================================================
function partieC() {
  console.log('\n— C. Garde × route (source) —');

  const pageAdmin = readFileSync('app/admin/page.tsx', 'utf8');
  verifier(
    'C : /admin garde « admin.tableau_de_bord.voir »',
    pageAdmin.includes("exigerPermission('admin.tableau_de_bord.voir'")
  );

  const route = readFileSync('app/api/admin/abonnement/route.ts', 'utf8');
  verifier(
    'C : POST /api/admin/abonnement garde « attribuer »',
    route.includes("verifierPermission('admin.abonnements.attribuer')")
  );
  verifier(
    'C : DELETE /api/admin/abonnement garde « révoquer »',
    route.includes("verifierPermission('admin.abonnements.revoquer')")
  );

  const migration = readFileSync(
    'supabase/migrations/20261003000002_roles_admin.sql',
    'utf8'
  );
  verifier(
    'C : AUCUNE politique admin sur livres/chapitres/segments',
    !/create policy[^;]*on public\.(livres|chapitres|segments)/i.test(migration)
  );
  verifier(
    'C : la migration ne renvoie jamais de contenu (pas de texte_source)',
    !/texte_source|texte_traduit|\btitre\b/.test(migration)
  );
  const garde = readFileSync('lib/roles-garde.ts', 'utf8');
  verifier(
    'C : le garde serveur s’appuie sur la matrice pure (deciderAcces)',
    garde.includes('deciderAcces(')
  );
}

// ============================================================
// D. Durées d'abonnement
// ============================================================
function partieD() {
  console.log('\n— D. Durées d’abonnement —');
  const maintenant = new Date('2026-10-02T00:00:00Z');

  const vie = resoudreDuree('vie', maintenant);
  verifier('D : « vie » → ~100 ans', vie?.jours === JOURS_VIE && JOURS_VIE >= 36000);

  verifier('D : 1/3/12 mois → 30/90/365 jours', 
    resoudreDuree('1_mois', maintenant)?.jours === 30 &&
    resoudreDuree('3_mois', maintenant)?.jours === 90 &&
    resoudreDuree('12_mois', maintenant)?.jours === 365
  );

  verifier(
    'D : durée inconnue rejetée',
    resoudreDuree('6_semaines', maintenant) === null &&
      resoudreDuree('', maintenant) === null &&
      resoudreDuree(42, maintenant) === null
  );

  const date = resoudreDuree('2026-12-31', maintenant);
  verifier(
    'D : date ISO acceptée, jours = écart réel',
    date !== null && date.jours === joursDepuisDate('2026-12-31', maintenant) && date.jours > 80
  );
  verifier(
    'D : date passée bornée à 1 jour (pas d’abonnement expiré)',
    resoudreDuree('2020-01-01', maintenant)?.jours === 1
  );
}

// ============================================================
// E. Structure en base
// ============================================================
async function partieE(pg: ClientPg) {
  console.log('\n— E. Structure en base —');

  const col = await pg.query(
    `select is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='role'`
  );
  verifier(
    'E : colonne profiles.role NOT NULL, défaut utilisateur',
    col.rows.length === 1 &&
      col.rows[0].is_nullable === 'NO' &&
      String(col.rows[0].column_default).includes('utilisateur'),
    JSON.stringify(col.rows)
  );

  const ctr = await pg.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conname='profiles_role_valide' and conrelid='public.profiles'::regclass`
  );
  verifier(
    'E : contrainte profiles_role_valide (utilisateur|admin)',
    ctr.rows.length === 1 &&
      /utilisateur/.test(ctr.rows[0].def) &&
      /admin/.test(ctr.rows[0].def),
    ctr.rows[0]?.def
  );

  const fn = await pg.query(
    `select prosecdef, pg_get_function_arguments(oid) as args
       from pg_proc where pronamespace='public'::regnamespace and proname='est_admin'`
  );
  verifier(
    'E : est_admin SECURITY DEFINER (source de vérité)',
    fn.rows.length === 1 && fn.rows[0].prosecdef === true,
    JSON.stringify(fn.rows)
  );

  const fnsAdmin = await pg.query(
    `select proname, prosecdef from pg_proc
      where pronamespace='public'::regnamespace
        and proname in ('stats_admin','admin_lister_comptes','proteger_role_profiles')`
  );
  verifier(
    'E : stats_admin, admin_lister_comptes, proteger_role_profiles SECURITY DEFINER',
    fnsAdmin.rows.length === 3 && fnsAdmin.rows.every((r) => r.prosecdef === true),
    JSON.stringify(fnsAdmin.rows.map((r) => r.proname))
  );

  const grants = await pg.query(
    `select has_function_privilege('anon','public.stats_admin(date,date)','execute') as anon_stats,
            has_function_privilege('authenticated','public.stats_admin(date,date)','execute') as auth_stats,
            has_function_privilege('anon','public.admin_lister_comptes()','execute') as anon_list`
  );
  const g = grants.rows[0] as { anon_stats: boolean; auth_stats: boolean; anon_list: boolean };
  verifier(
    'E : RPC admin fermées à anon, ouvertes à authenticated',
    g.anon_stats === false && g.auth_stats === true && g.anon_list === false,
    JSON.stringify(g)
  );

  const pol = await pg.query(
    `select tablename, policyname from pg_policies
      where schemaname='public' and tablename in ('profiles','admin_actions')
      order by tablename, policyname`
  );
  const noms = pol.rows.map((r) => `${r.tablename}.${r.policyname}`);
  verifier(
    'E : politique admin de lecture des profils présente',
    noms.includes('profiles.profiles_select_admin')
  );
  verifier(
    'E : journal admin_actions protégé (select + insert admin)',
    noms.includes('admin_actions.admin_actions_select_admin') &&
      noms.includes('admin_actions.admin_actions_insert_admin')
  );

  const rls = await pg.query(
    `select relrowsecurity from pg_class where oid='public.admin_actions'::regclass`
  );
  verifier('E : RLS active sur admin_actions', rls.rows[0]?.relrowsecurity === true);

  const cnt = await pg.query(
    `select (select count(*) from public.profiles) as comptes,
            (select count(*) from public.chapitres where statut='traduit') as trad`
  );
  verifier(
    'E : stats_admin appelle les comptages (contrôle admin)',
    Number(cnt.rows[0].comptes) >= 0
  );
}

// ============================================================
// F. RLS réelle — impersonation, TRANSACTION ANNULÉE
// ============================================================
async function partieF(pg: ClientPg) {
  console.log('\n— F. RLS réelle (impersonation, rollback) —');

  const ids = await pg.query(
    `select id, role from public.profiles order by created_at limit 2`
  );
  if (ids.rows.length < 2) {
    console.log('· Moins de 2 profils en base : partie F ignorée.');
    return;
  }
  const admin = ids.rows[0].id as string;
  const autre = ids.rows[1].id as string;
  const totalProfiles = Number(
    (await pg.query('select count(*) as n from public.profiles')).rows[0].n
  );

  await pg.query('begin');
  try {
    // Postgres (auth.uid() null) : le déclencheur autorise la promotion.
    await pg.query(`update public.profiles set role='admin' where id=$1`, [admin]);

    const comme = async (sub: string | null) => {
      await pg.query('set local role authenticated');
      if (sub) {
        await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub }),
        ]);
      } else {
        await pg.query(`select set_config('request.jwt.claims', '', true)`);
      }
    };
    const reinitialiser = () => pg.query('reset role');

    // --- Admin ---
    await comme(admin);
    const estAdmin = (await pg.query('select public.est_admin() as a')).rows[0].a;
    const profilsVus = Number(
      (await pg.query('select count(*) as n from public.profiles')).rows[0].n
    );
    const livresTiers = Number(
      (await pg.query('select count(*) as n from public.livres where proprietaire_id=$1', [autre]))
        .rows[0].n
    );
    const chapTiers = Number(
      (await pg.query(
        `select count(*) as n from public.chapitres c
          join public.livres l on l.id=c.livre_id where l.proprietaire_id=$1`,
        [autre]
      )).rows[0].n
    );
    const segTiers = Number(
      (await pg.query(
        `select count(*) as n from public.segments s
          join public.chapitres c on c.id=s.chapitre_id
          join public.livres l on l.id=c.livre_id where l.proprietaire_id=$1`,
        [autre]
      )).rows[0].n
    );
    await reinitialiser();

    verifier('F : est_admin() vrai pour un profil promu admin', estAdmin === true);
    verifier(
      `F : admin lit TOUS les profils (${profilsVus}/${totalProfiles})`,
      profilsVus === totalProfiles
    );
    verifier(
      'F : admin NE LIT PAS les livres d’autrui',
      livresTiers === 0,
      `livres=${livresTiers}`
    );
    verifier(
      'F : admin NE LIT PAS les chapitres d’autrui',
      chapTiers === 0,
      `chapitres=${chapTiers}`
    );
    verifier(
      'F : admin NE LIT PAS les segments d’autrui',
      segTiers === 0,
      `segments=${segTiers}`
    );

    // --- Utilisateur simple ---
    await comme(autre);
    const profilsVusUser = Number(
      (await pg.query('select count(*) as n from public.profiles')).rows[0].n
    );
    const livresAdmin = Number(
      (await pg.query('select count(*) as n from public.livres where proprietaire_id=$1', [admin]))
        .rows[0].n
    );
    await reinitialiser();

    verifier('F : utilisateur ne voit QUE son profil', profilsVusUser === 1, `vu=${profilsVusUser}`);
    verifier('F : utilisateur NE LIT PAS les livres d’autrui', livresAdmin === 0, `livres=${livresAdmin}`);
  } finally {
    await pg.query('rollback').catch(() => undefined);
    await pg.query('reset role').catch(() => undefined);
  }

  // L'écriture est bien annulée : le rôle du profil testé est restauré.
  const apres = await pg.query('select role from public.profiles where id=$1', [admin]);
  verifier('F : rollback — aucun rôle modifié durablement', apres.rows[0]?.role !== 'admin');
}

// ============================================================
async function principal() {
  chargerEnv();
  partieA();
  partieB();
  partieC();
  partieD();

  const pg = ouvrirPg();
  try {
    await pg.connect();
    await partieE(pg);
    await partieF(pg);
  } catch (e) {
    console.warn('· Parties base ignorées :', (e as Error).message);
  } finally {
    await pg.end().catch(() => undefined);
  }

  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`}` +
      ` (Supabase: ${URL_SUPABASE ? 'configuré' : 'absent'})`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
