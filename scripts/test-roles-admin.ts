// ============================================================
// scripts/test-roles-admin.ts — Test exécutable des rôles et de
// l'administration (W4e + vague super_admin).
// Usage : npx tsx scripts/test-roles-admin.ts
//
//   A. MATRICE rôles × permissions : exécute le VRAI code de
//      lib/roles.ts (deciderAcces / aLaPermission) pour chaque rôle
//      (anonyme, utilisateur, admin, super_admin), route par route.
//   B. CHEMIN D'INTERFACE : les liens de navigation par rôle et le
//      CUMUL (aucun lien existant retiré).
//   C. GARDE × ROUTE : le source des entrées sensibles appelle bien
//      la permission attendue ; aucune politique admin sur le
//      CONTENU (livres / chapitres / segments).
//   D. DURÉES d'abonnement : 'vie', '1_mois', '3_mois', '12_mois',
//      date ISO → jours.
//   E. STRUCTURE en base : profiles.role + contraintes (dont
//      « super_admin »), est_admin / est_super_admin SECURITY DEFINER,
//      admin_actions (actions étendues, colonne role_cible), RLS,
//      grants des RPC.
//   F. RLS + DÉCLENCHEUR de rôle (impersonation dans une TRANSACTION
//      annulée) : le super-admin lit tous les profils mais AUCUN livre
//      d'autrui ; un simple admin NE PEUT PAS s'octroyer un rôle ; un
//      utilisateur non plus ; un super-admin PEUT promouvoir un autre
//      compte.
//   G. GARDE DES RPC : un compte non super-admin qui appelle
//      directement public.admin_changer_role est refusé (42501) ; un
//      anonyme n'a même pas le droit d'exécution.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client as ClientPg } from 'pg';
import {
  ROLES,
  PERMISSIONS,
  PERMISSIONS_INTERDITES,
  LIBELLES_ROLES,
  deciderAcces,
  aLaPermission,
  normaliserRole,
  estRole,
  estAdmin,
  estSuperAdmin,
  peutGererLesRoles,
  permissionPourChangerRole,
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
  // Découpe tolérante aux fins de ligne Windows (\r\n) : sans cela, AUCUNE
  // variable n'était chargée et les parties E/F/G étaient silencieusement
  // ignorées (« Parties base ignorées : client password must be a string »).
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

/** Permissions d'EXPLOITATION : celles d'`admin`, sans la gestion des rôles. */
const PERMISSIONS_ADMIN: readonly Permission[] = [
  'admin.tableau_de_bord.voir',
  'admin.stats.voir',
  'admin.comptes.lister',
  'admin.abonnements.lire',
  'admin.abonnements.attribuer',
  'admin.abonnements.revoquer',
];

/** Permissions de GESTION DES RÔLES : super_admin uniquement. */
const PERMISSIONS_ROLES: readonly Permission[] = [
  'admin.roles.attribuer',
  'admin.roles.super_admin',
];

// ============================================================
// A. Matrice rôles × permissions (VRAI code, exécuté par rôle)
// ============================================================
function partieA() {
  console.log('\n— A. Matrice rôles × permissions —');

  verifier(
    'A : trois rôles exactement, listes explicites',
    ROLES.length === 3 &&
      ROLES.includes('utilisateur') &&
      ROLES.includes('admin') &&
      ROLES.includes('super_admin'),
    ROLES.join(',')
  );
  verifier(
    'A : normaliser un rôle inconnu → utilisateur (jamais admin)',
    normaliserRole('superadmin') === 'utilisateur' &&
      normaliserRole(null) === 'utilisateur' &&
      estRole('admin') &&
      estRole('super_admin') &&
      !estRole('root')
  );
  verifier(
    'A : estAdmin couvre admin ET super_admin ; estSuperAdmin seulement super_admin',
    estAdmin('admin') && estAdmin('super_admin') && !estAdmin('utilisateur') &&
      estSuperAdmin('super_admin') && !estSuperAdmin('admin') &&
      peutGererLesRoles('super_admin') && !peutGererLesRoles('admin')
  );
  verifier(
    'A : libellés de rôle présents pour les trois rôles',
    ROLES.every((r) => typeof LIBELLES_ROLES[r] === 'string' && LIBELLES_ROLES[r].length > 0)
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
      [...PERMISSIONS_ADMIN, ...PERMISSIONS_ROLES].every(
        (p) => deciderAcces('utilisateur', p) === 403
      ) &&
      deciderAcces('utilisateur', 'contenu.tiers.lire') === 403
  );

  // admin : toutes les permissions d'exploitation OUI…
  verifier(
    'A : admin — permissions d’exploitation OUI',
    PERMISSIONS_ADMIN.every((p) => deciderAcces('admin', p) === 200) &&
      deciderAcces('admin', 'espace.mes_livres') === 200
  );
  // …mais AUCUNE permission de gestion des rôles.
  verifier(
    'A : admin — gestion des rôles REFUSÉE (403)',
    PERMISSIONS_ROLES.every((p) => deciderAcces('admin', p) === 403) &&
      !peutGererLesRoles('admin')
  );

  // super_admin : tout, exploitation + rôles.
  verifier(
    'A : super_admin — exploitation ET rôles OUI',
    [...PERMISSIONS_ADMIN, ...PERMISSIONS_ROLES].every(
      (p) => deciderAcces('super_admin', p) === 200
    ) &&
      deciderAcces('super_admin', 'espace.mes_livres') === 200
  );

  // INTERDICTION ABSOLUE : contenu des livres d'autrui, pour TOUS
  // (y compris le super-admin : il ne l'hérite pas silencieusement).
  verifier(
    'A : contenu.tiers.lire INTERDIT à utilisateur, admin ET super_admin',
    PERMISSIONS_INTERDITES.includes('contenu.tiers.lire') &&
      !aLaPermission('utilisateur', 'contenu.tiers.lire') &&
      !aLaPermission('admin', 'contenu.tiers.lire') &&
      !aLaPermission('super_admin', 'contenu.tiers.lire')
  );

  // Permission exigée pour changer un rôle.
  verifier(
    'A : permissionPourChangerRole — cible ou visée super_admin ⇒ permission forte',
    permissionPourChangerRole('utilisateur', 'admin') === 'admin.roles.attribuer' &&
      permissionPourChangerRole('admin', 'utilisateur') === 'admin.roles.attribuer' &&
      permissionPourChangerRole('utilisateur', 'super_admin') === 'admin.roles.super_admin' &&
      permissionPourChangerRole('super_admin', 'admin') === 'admin.roles.super_admin' &&
      permissionPourChangerRole('admin', 'super_admin') === 'admin.roles.super_admin'
  );
}

// ============================================================
// B. Chemin d'interface : liens par rôle + CUMUL
// ============================================================
function partieB() {
  console.log('\n— B. Liens de navigation par rôle (cumul) —');

  const lienUtilisateur = liensNavigationSupplementaires('utilisateur');
  const lienAdmin = liensNavigationSupplementaires('admin');
  const lienSuper = liensNavigationSupplementaires('super_admin');

  verifier('B : utilisateur — AUCUN lien de gestion', lienUtilisateur.length === 0);
  verifier('B : admin — lien /admin présent', lienAdmin.some((l) => l.href === '/admin'));
  verifier(
    'B : super_admin — lien /admin présent',
    lienSuper.some((l) => l.href === '/admin')
  );

  // CUMUL : les liens du rôle s'AJOUTENT à la base, ne la remplacent pas.
  const base = [{ href: '/bibliotheque', libelle: 'Bibliothèque' }];
  const nav = (role: Role) => [...base, ...liensNavigationSupplementaires(role)];
  verifier(
    'B : cumul — les liens existants survivent pour les trois rôles',
    nav('utilisateur').some((l) => l.href === '/bibliotheque') &&
      nav('admin').some((l) => l.href === '/bibliotheque') &&
      nav('super_admin').some((l) => l.href === '/bibliotheque') &&
      nav('utilisateur').length === base.length &&
      nav('admin').length === base.length + 1 &&
      nav('super_admin').length === base.length + 1
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
  verifier(
    'C : le panneau « Rôles » n’est monté que si estSuperAdmin',
    pageAdmin.includes('estSuperAdmin(roleCourant)') && pageAdmin.includes('...(superAdmin')
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

  // --- Nouvelle route : /api/admin/roles ---
  const routeRoles = readFileSync('app/api/admin/roles/route.ts', 'utf8');
  verifier(
    'C : POST /api/admin/roles garde « admin.roles.attribuer »',
    routeRoles.includes("verifierPermission('admin.roles.attribuer')")
  );
  verifier(
    'C : /api/admin/roles réutilise la matrice (permissionPourChangerRole)',
    routeRoles.includes('permissionPourChangerRole(roleActuel, roleVise)')
  );
  verifier(
    'C : /api/admin/roles appelle la RPC admin_changer_role',
    routeRoles.includes("rpc('admin_changer_role'")
  );

  // Le panneau d'interface cache les commandes hors super-admin.
  const panneauRoles = readFileSync('components/admin/GestionRoles.tsx', 'utf8');
  verifier(
    'C : GestionRoles refuse l’affichage des commandes hors super_admin',
    panneauRoles.includes('estSuperAdmin(roleCourant)') &&
      panneauRoles.includes("fetch('/api/admin/roles'")
  );

  // --- Ordre des moteurs de traduction, réglable depuis l'admin ---
  const routeChaine = readFileSync('app/api/admin/chaine/route.ts', 'utf8');
  verifier(
    'C : /api/admin/chaine garde « admin.tableau_de_bord.voir »',
    routeChaine.includes('verifierPermission(PERMISSION_CHAINE)') &&
      routeChaine.includes("const PERMISSION_CHAINE = 'admin.tableau_de_bord.voir'")
  );
  verifier(
    'C : OrdreChaine est MONTÉ dans la page admin (sinon la fonctionnalité est morte)',
    pageAdmin.includes("import OrdreChaine from '@/components/admin/OrdreChaine'") &&
      pageAdmin.includes('<OrdreChaine />')
  );
  verifier(
    'C : l’ordre est persisté en base via la RPC definir_ordre_chaine',
    readFileSync('lib/chaine-ordre.ts', 'utf8').includes('definir_ordre_chaine') &&
      readFileSync('lib/chaine-ordre.ts', 'utf8').includes('chaine_traduction_ordre')
  );

  for (const fichier of [
    'supabase/migrations/20261003000002_roles_admin.sql',
    'supabase/migrations/20261010000001_super_admin.sql',
  ]) {
    const migration = readFileSync(fichier, 'utf8');
    verifier(
      `C : AUCUNE politique admin sur livres/chapitres/segments (${fichier.split('/').pop()})`,
      !/create policy[^;]*on public\.(livres|chapitres|segments)/i.test(migration)
    );
    verifier(
      `C : la migration ne renvoie jamais de contenu (${fichier.split('/').pop()})`,
      !/texte_source|texte_traduit|\btitre\b/.test(migration)
    );
  }

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

  verifier(
    'D : 1/3/12 mois → 30/90/365 jours',
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
    'E : contrainte profiles_role_valide (utilisateur|admin|super_admin)',
    ctr.rows.length === 1 &&
      /utilisateur/.test(ctr.rows[0].def) &&
      /admin/.test(ctr.rows[0].def) &&
      /super_admin/.test(ctr.rows[0].def),
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

  const fnSuper = await pg.query(
    `select prosecdef, pg_get_function_arguments(oid) as args
       from pg_proc where pronamespace='public'::regnamespace and proname='est_super_admin'`
  );
  verifier(
    'E : est_super_admin SECURITY DEFINER (garde de la gestion des rôles)',
    fnSuper.rows.length === 1 && fnSuper.rows[0].prosecdef === true,
    JSON.stringify(fnSuper.rows)
  );

  const fnRpc = await pg.query(
    `select prosecdef, pg_get_function_arguments(oid) as args
       from pg_proc where pronamespace='public'::regnamespace and proname='admin_changer_role'`
  );
  verifier(
    'E : admin_changer_role SECURITY DEFINER (p_user_id, p_role, p_motif)',
    fnRpc.rows.length === 1 &&
      fnRpc.rows[0].prosecdef === true &&
      /p_user_id/.test(fnRpc.rows[0].args) &&
      /p_role/.test(fnRpc.rows[0].args),
    JSON.stringify(fnRpc.rows)
  );

  const fnsAdmin = await pg.query(
    `select proname, prosecdef from pg_proc
      where pronamespace='public'::regnamespace
        and proname in ('stats_admin','admin_lister_comptes','proteger_role_profiles','miroir_role_admin')`
  );
  verifier(
    'E : stats_admin, admin_lister_comptes, proteger_role_profiles, miroir_role_admin SECURITY DEFINER',
    fnsAdmin.rows.length === 4 && fnsAdmin.rows.every((r) => r.prosecdef === true),
    JSON.stringify(fnsAdmin.rows.map((r) => r.proname))
  );

  const grants = await pg.query(
    `select has_function_privilege('anon','public.stats_admin(date,date)','execute') as anon_stats,
            has_function_privilege('authenticated','public.stats_admin(date,date)','execute') as auth_stats,
            has_function_privilege('anon','public.admin_lister_comptes()','execute') as anon_list,
            has_function_privilege('anon','public.est_super_admin(uuid)','execute') as anon_super,
            has_function_privilege('authenticated','public.est_super_admin(uuid)','execute') as auth_super,
            has_function_privilege('anon','public.admin_changer_role(uuid,text,text)','execute') as anon_changer,
            has_function_privilege('authenticated','public.admin_changer_role(uuid,text,text)','execute') as auth_changer`
  );
  const g = grants.rows[0] as Record<string, boolean>;
  verifier(
    'E : RPC admin fermées à anon, ouvertes à authenticated',
    g.anon_stats === false &&
      g.auth_stats === true &&
      g.anon_list === false &&
      g.anon_super === false &&
      g.auth_super === true &&
      g.anon_changer === false &&
      g.auth_changer === true,
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

  // --- Journal : actions étendues + colonne role_cible ---
  const ctrActions = await pg.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conname='admin_actions_action_valide' and conrelid='public.admin_actions'::regclass`
  );
  verifier(
    'E : admin_actions accepte nommer_role / retrograder_role',
    ctrActions.rows.length === 1 &&
      /nommer_role/.test(ctrActions.rows[0].def) &&
      /retrograder_role/.test(ctrActions.rows[0].def) &&
      /attribuer/.test(ctrActions.rows[0].def) &&
      /revoquer/.test(ctrActions.rows[0].def),
    ctrActions.rows[0]?.def
  );

  const colRole = await pg.query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name='admin_actions' and column_name='role_cible'`
  );
  verifier('E : colonne admin_actions.role_cible présente', colRole.rows.length === 1);

  const rls = await pg.query(
    `select relrowsecurity from pg_class where oid='public.admin_actions'::regclass`
  );
  verifier('E : RLS active sur admin_actions', rls.rows[0]?.relrowsecurity === true);

  const cnt = await pg.query(
    `select (select count(*) from public.profiles) as comptes,
            (select count(*) from public.profiles where role='super_admin') as supers,
            (select count(*) from public.chapitres where statut='traduit') as trad`
  );
  verifier(
    'E : au moins un super-administrateur en base',
    Number(cnt.rows[0].supers) >= 1,
    JSON.stringify(cnt.rows[0])
  );
}

// ============================================================
// F. RLS + déclencheur de rôle (impersonation, TRANSACTION ANNULÉE)
// ============================================================
async function partieF(pg: ClientPg) {
  console.log('\n— F. RLS et protection du rôle (impersonation, rollback) —');

  const ids = await pg.query(
    `select id, role, pseudo from public.profiles order by created_at`
  );
  const parRole = (r: string) => ids.rows.filter((x) => x.role === r);
  const supers = parRole('super_admin');
  const adminsSimples = parRole('admin');
  const utilisateurs = parRole('utilisateur');

  if (supers.length === 0 || adminsSimples.length === 0 || utilisateurs.length === 0) {
    console.log('· Il faut au moins un profil de chaque rôle (super_admin, admin, utilisateur) : partie F ignorée.');
    return;
  }
  const superUid = supers[0].id as string;
  const adminUid = adminsSimples[0].id as string;
  const userUid = utilisateurs[0].id as string;
  const totalProfiles = ids.rows.length;

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
  /**
   * Exécute une requête en attendant une ERREUR ; renvoie le code SQLSTATE.
   * Chaque essai est encadré d'un POINT DE SAUVEGARDE : sans lui, la
   * première erreur attendue avortait la transaction et toutes les
   * vérifications suivantes étaient ignorées (« current transaction is
   * aborted ») — le test passait alors sans rien prouver.
   */
  const attendreErreur = async (sql: string, args: unknown[] = []) => {
    await pg.query('savepoint essai');
    try {
      const r = await pg.query(sql, args);
      await pg.query('release savepoint essai');
      return { code: null as string | null, rowCount: r.rowCount ?? 0 };
    } catch (e) {
      await pg.query('rollback to savepoint essai');
      return { code: (e as { code?: string }).code ?? 'ERREUR', rowCount: -1 };
    }
  };

  await pg.query('begin');
  try {
    // --- 1. Le super-admin lit TOUS les profils, mais aucun contenu d'autrui ---
    await comme(superUid);
    const estAdminSuper = (await pg.query('select public.est_admin() as a')).rows[0].a;
    const estSuper = (await pg.query('select public.est_super_admin() as s')).rows[0].s;
    const profilsVus = Number(
      (await pg.query('select count(*) as n from public.profiles')).rows[0].n
    );
    const livresTiers = Number(
      (await pg.query('select count(*) as n from public.livres where proprietaire_id=$1', [userUid]))
        .rows[0].n
    );
    const chapTiers = Number(
      (await pg.query(
        `select count(*) as n from public.chapitres c
          join public.livres l on l.id=c.livre_id where l.proprietaire_id=$1`,
        [userUid]
      )).rows[0].n
    );
    const segTiers = Number(
      (await pg.query(
        `select count(*) as n from public.segments s
          join public.chapitres c on c.id=s.chapitre_id
          join public.livres l on l.id=c.livre_id where l.proprietaire_id=$1`,
        [userUid]
      )).rows[0].n
    );
    await reinitialiser();

    verifier('F : est_admin() ET est_super_admin() vrais pour un super-admin', estAdminSuper === true && estSuper === true);
    verifier(
      `F : super-admin lit TOUS les profils (${profilsVus}/${totalProfiles})`,
      profilsVus === totalProfiles
    );
    verifier('F : super-admin NE LIT PAS les livres d’autrui', livresTiers === 0, `livres=${livresTiers}`);
    verifier('F : super-admin NE LIT PAS les chapitres d’autrui', chapTiers === 0, `chapitres=${chapTiers}`);
    verifier('F : super-admin NE LIT PAS les segments d’autrui', segTiers === 0, `segments=${segTiers}`);

    // --- 2. Un ADMIN SIMPLE ne peut pas s'octroyer un rôle ---
    // profiles_update_own l'autorise à modifier SA ligne : c'est donc le
    // DÉCLENCHEUR qui doit trancher. C'est l'escalade de privilèges la
    // plus directe (admin → super_admin), elle doit échouer.
    await comme(adminUid);
    const adminEstSuper = (await pg.query('select public.est_super_admin() as s')).rows[0].s;
    const codeAutoPromotion = await attendreErreur(
      `update public.profiles set role='super_admin' where id=$1`,
      [adminUid]
    );
    const codeAutoDemotion = await attendreErreur(
      `update public.profiles set role='utilisateur' where id=$1`,
      [adminUid]
    );
    await reinitialiser();

    verifier('F : un admin simple n’est PAS super_admin côté base', adminEstSuper === false);
    verifier(
      'F : admin simple → auto-promotion super_admin REFUSÉE (42501)',
      codeAutoPromotion.code === '42501',
      `code=${codeAutoPromotion.code}`
    );
    verifier(
      'F : admin simple → écriture de son propre rôle REFUSÉE (42501)',
      codeAutoDemotion.code === '42501',
      `code=${codeAutoDemotion.code}`
    );

    // --- 3. Un UTILISATEUR non plus ---
    await comme(userUid);
    const codeUser = await attendreErreur(
      `update public.profiles set role='admin' where id=$1`,
      [userUid]
    );
    await reinitialiser();
    verifier(
      'F : utilisateur → auto-promotion admin REFUSÉE (42501)',
      codeUser.code === '42501',
      `code=${codeUser.code}`
    );

    // --- 4. Un super-admin face à un AUTRE compte ---
    // RLS (profiles_update_own) n'autorise chacun à écrire que SA ligne :
    // une écriture DIRECTE sur le profil d'autrui ne touche donc AUCUNE
    // ligne. Le seul chemin légitime est la RPC SECURITY DEFINER
    // admin_changer_role, éprouvée en partie G.
    await comme(superUid);
    const tentativeDirecte = await attendreErreur(
      `update public.profiles set role='admin' where id=$1`,
      [userUid]
    );
    const roleApresTentative = (
      await pg.query('select role from public.profiles where id=$1', [userUid])
    ).rows[0]?.role;
    // …et il ne peut pas non plus toucher SON PROPRE rôle (anti-verrouillage).
    const codeSoiMeme = await attendreErreur(
      `update public.profiles set role='admin' where id=$1`,
      [superUid]
    );
    await reinitialiser();

    verifier(
      'F : super-admin → écriture DIRECTE sur autrui sans effet (RLS : 0 ligne, rôle inchangé)',
      tentativeDirecte.code === null &&
        tentativeDirecte.rowCount === 0 &&
        roleApresTentative === 'utilisateur',
      `code=${tentativeDirecte.code}, rowCount=${tentativeDirecte.rowCount}, role=${roleApresTentative}`
    );
    verifier(
      'F : super-admin → modification de SON PROPRE rôle REFUSÉE (42501)',
      codeSoiMeme.code === '42501',
      `code=${codeSoiMeme.code}`
    );
  } finally {
    await pg.query('rollback').catch(() => undefined);
    await pg.query('reset role').catch(() => undefined);
  }

  // L'écriture est bien annulée : aucun rôle modifié durablement.
  const apres = await pg.query(
    `select role from public.profiles where id=$1`,
    [userUid]
  );
  verifier(
    'F : rollback — aucun rôle modifié durablement',
    apres.rows[0]?.role === 'utilisateur',
    `role=${apres.rows[0]?.role}`
  );
}

// ============================================================
// G. GARDE DES RPC — public.admin_changer_role
// ============================================================
async function partieG(pg: ClientPg) {
  console.log('\n— G. Garde des RPC (admin_changer_role) —');

  const rows = await pg.query(`select id, role from public.profiles order by created_at`);
  const superUid = rows.rows.find((r) => r.role === 'super_admin')?.id as string | undefined;
  const adminUid = rows.rows.find((r) => r.role === 'admin')?.id as string | undefined;
  const userUid = rows.rows.find((r) => r.role === 'utilisateur')?.id as string | undefined;

  if (!superUid || !adminUid || !userUid) {
    console.log('· Profils de chaque rôle requis : partie G ignorée.');
    return;
  }

  const comme = async (sub: string) => {
    await pg.query('set local role authenticated');
    await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub }),
    ]);
  };
  const attendreErreur = async (sql: string, args: unknown[] = []) => {
    await pg.query('savepoint essai');
    try {
      const r = await pg.query(sql, args);
      await pg.query('release savepoint essai');
      return { code: null, rows: r.rows };
    } catch (e) {
      await pg.query('rollback to savepoint essai');
      return { code: (e as { code?: string }).code ?? 'ERREUR', rows: [] };
    }
  };

  await pg.query('begin');
  try {
    // 1. Un ADMIN SIMPLE ne peut pas nommer (garde DANS la fonction).
    await comme(adminUid);
    const r1 = await attendreErreur(`select public.admin_changer_role($1, 'admin', 'test')`, [
      userUid,
    ]);
    // 2. Un UTILISATEUR non plus.
    await pg.query('reset role');
    await comme(userUid);
    const r2 = await attendreErreur(`select public.admin_changer_role($1, 'admin', 'test')`, [
      userUid,
    ]);
    // 3. Un ANONYME n'a même pas le privilège d'exécution.
    await pg.query('reset role');
    await pg.query('set local role anon');
    const r3 = await attendreErreur(`select public.admin_changer_role($1, 'admin', 'test')`, [
      userUid,
    ]);
    // 4. Le SUPER-ADMIN, lui, réussit — puis on annule tout.
    await pg.query('reset role');
    await comme(superUid);
    const r4 = await attendreErreur(`select public.admin_changer_role($1, 'admin', 'test G')`, [
      userUid,
    ]);
    const journal = await pg.query(
      `select action, role_cible from public.admin_actions
        where cible_id=$1 and motif='test G' order by cree_le desc limit 1`,
      [userUid]
    );
    await pg.query('reset role');

    verifier(
      'G : admin simple → admin_changer_role REFUSÉ (42501)',
      r1.code === '42501',
      `code=${r1.code}`
    );
    verifier(
      'G : utilisateur → admin_changer_role REFUSÉ (42501)',
      r2.code === '42501',
      `code=${r2.code}`
    );
    verifier(
      'G : anonyme → admin_changer_role REFUSÉ (42501, pas de droit d’exécution)',
      r3.code === '42501',
      `code=${r3.code}`
    );
    verifier(
      'G : super-admin → admin_changer_role AUTORISÉ et journalisé',
      r4.code === null &&
        journal.rows.length === 1 &&
        journal.rows[0].action === 'nommer_role' &&
        journal.rows[0].role_cible === 'admin',
      `code=${r4.code}, journal=${JSON.stringify(journal.rows)}`
    );
  } finally {
    await pg.query('rollback').catch(() => undefined);
    await pg.query('reset role').catch(() => undefined);
  }
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
    await partieG(pg);
  } catch (e) {
    // Un échec des parties base n'est JAMAIS un succès silencieux : sans
    // cette ligne, une connexion impossible (mot de passe illisible, CRLF)
    // laissait croire que tout était vert alors que rien n'avait été testé.
    echecs += 1;
    console.error('✗ Parties base NON exécutées :', (e as Error).message);
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
