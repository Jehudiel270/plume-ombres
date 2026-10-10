// ============================================================
// scripts/test-notifications.ts — PREUVE exécutable.
//
//   npx tsx scripts/test-notifications.ts
//
// Prouve que le système de notifications persistantes est en place :
//   (a) la table public.notifications existe, RLS activée, et les 4
//       politiques « own » (select/insert/update/delete) sont présentes ;
//   (b) le trigger notifier_traduction_terminee crée EXACTEMENT UNE
//       notification quand un livre passe au statut 'traduit', et AUCUNE
//       quand on rejoue la mise à jour avec le même statut ;
//   (c) public.compter_notifications_non_lues() compte correctement ;
//   (d) public.marquer_notifications_lues() ne marque QUE les
//       notifications du compte visé (isolation entre deux comptes).
//
// Isolation : TOUT le jeu de données de test (comptes auth.users,
// livres, notifications) est écrit dans une TRANSACTION ANNULÉE
// (ROLLBACK). La base réelle n'est jamais modifiée par ce script.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

// ------------------------------------------------------------
// Chargement de .env.local (tolérant aux fins de ligne Windows)
// ------------------------------------------------------------
function chargerEnv(): void {
  const contenu = readFileSync('.env.local', 'utf8');
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

// ------------------------------------------------------------
// Vérifications
// ------------------------------------------------------------
interface Verif {
  nom: string;
  ok: boolean;
  detail: string;
}
const verifs: Verif[] = [];
function verifier(nom: string, ok: boolean, detail = ''): void {
  verifs.push({ nom, ok, detail });
}

const client = new Client({
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

async function principal(): Promise<void> {
  await client.connect();

  const proprietaireA = randomUUID();
  const proprietaireB = randomUUID();
  const livreA = randomUUID();

  await client.query('begin');
  try {
    // ---------- (a) Table + RLS + politiques ----------
    const rTable = await client.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name = 'notifications'`
    );
    const tableExiste = Number(rTable.rows[0].n) === 1;
    verifier(
      '(a) la table public.notifications existe',
      tableExiste,
      `n = ${rTable.rows[0].n}`
    );

    // Si la table est absente (migration non appliquée), on n'exécute pas
    // les contrôles qui en dépendent : le test rend un récapitulatif propre
    // au lieu de planter sur une relation inexistante.
    if (tableExiste) {
      const rRls = await client.query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class
          where oid = 'public.notifications'::regclass`
      );
      verifier(
        '(a) la RLS est activée sur la table',
        rRls.rows[0]?.relrowsecurity === true,
        `relrowsecurity = ${rRls.rows[0]?.relrowsecurity}`
      );

      const rPol = await client.query<{ policyname: string; cmd: string }>(
        `select policyname, cmd from pg_policies
          where schemaname = 'public' and tablename = 'notifications'`
      );
      const cmds = new Set(rPol.rows.map((r) => String(r.cmd).toUpperCase()));
      for (const c of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        verifier(
          `(a) politique RLS « ${c} » présente`,
          cmds.has(c),
          [...cmds].join(', ')
        );
      }
      verifier(
        '(a) exactement 4 politiques RLS propres au propriétaire',
        rPol.rows.length === 4,
        `n = ${rPol.rows.length}`
      );

      // ---------- Jeu de données synthétique ----------
      // session_replication_role = replica : neutralise les déclencheurs et
      // les clés étrangères le temps d'insérer des comptes auth.users et un
      // livre de test. On repasse ensuite à 'origin' pour que le trigger
      // notifier_traduction_terminee redevienne ACTIF.
      await client.query('set local session_replication_role = replica');
      await client.query(
        `insert into auth.users (id, email)
         values ($1, $2), ($3, $4)`,
        [proprietaireA, 'notifs-a@test.local', proprietaireB, 'notifs-b@test.local']
      );
      await client.query(
        `insert into public.livres (id, proprietaire_id, titre, statut)
         values ($1, $2, $3, 'pret')`,
        [livreA, proprietaireA, 'Livre de test']
      );
      await client.query('set local session_replication_role = origin');

      // ---------- (b) Trigger : passage à 'traduit' ----------
      await client.query(
        `update public.livres set statut = 'traduit' where id = $1`,
        [livreA]
      );
      const rN1 = await client.query<{ n: number }>(
        `select count(*)::int as n from public.notifications
          where proprietaire_id = $1 and type = 'traduction'`,
        [proprietaireA]
      );
      verifier(
        "(b) EXACTEMENT UNE notification créée au passage à 'traduit'",
        Number(rN1.rows[0].n) === 1,
        `n = ${rN1.rows[0].n}`
      );

      const rNotif = await client.query<{
        titre: string;
        corps: string | null;
        lien: string | null;
        lu: boolean;
      }>(
        `select titre, corps, lien, lu from public.notifications
          where proprietaire_id = $1 order by id desc limit 1`,
        [proprietaireA]
      );
      const notif = rNotif.rows[0];
      verifier(
        '(b) titre = « Traduction terminée »',
        notif?.titre === 'Traduction terminée',
        String(notif?.titre)
      );
      verifier(
        '(b) corps = titre du livre',
        notif?.corps === 'Livre de test',
        String(notif?.corps)
      );
      verifier(
        '(b) lien = /livres/<id du livre>',
        notif?.lien === `/livres/${livreA}`,
        String(notif?.lien)
      );
      verifier(
        '(b) la notification est NON lue par défaut',
        notif?.lu === false,
        String(notif?.lu)
      );

      // Rejeu du MÊME statut : le trigger ne doit rien créer de plus.
      await client.query(
        `update public.livres set statut = 'traduit' where id = $1`,
        [livreA]
      );
      const rN2 = await client.query<{ n: number }>(
        `select count(*)::int as n from public.notifications
          where proprietaire_id = $1`,
        [proprietaireA]
      );
      verifier(
        '(b) AUCUNE notification de plus en rejouant le même statut',
        Number(rN2.rows[0].n) === 1,
        `n = ${rN2.rows[0].n}`
      );

      // ---------- (c) Compteur de non-lues ----------
      // Reproduit la session d'un utilisateur authentifié : auth.uid() lit
      // `request.jwt.claim.sub` (cf. définition de auth.uid()).
      await client.query(
        `select set_config('request.jwt.claim.sub', $1, true)`,
        [proprietaireA]
      );

      const rCmpA = await client.query<{ n: number }>(
        `select public.compter_notifications_non_lues() as n`
      );
      verifier(
        '(c) compter_notifications_non_lues() = 1 (1 non lue pour A)',
        Number(rCmpA.rows[0].n) === 1,
        `n = ${rCmpA.rows[0].n}`
      );

      const rMarqA = await client.query<{ n: number }>(
        `select public.marquer_notifications_lues() as n`
      );
      verifier(
        '(c) marquer_notifications_lues() (toutes) marque 1 ligne',
        Number(rMarqA.rows[0].n) === 1,
        `n = ${rMarqA.rows[0].n}`
      );

      const rCmpA2 = await client.query<{ n: number }>(
        `select public.compter_notifications_non_lues() as n`
      );
      verifier(
        '(c) après marquage, 0 non lue pour A',
        Number(rCmpA2.rows[0].n) === 0,
        `n = ${rCmpA2.rows[0].n}`
      );

      // ---------- (d) Isolation entre comptes ----------
      // Deux notifications supplémentaires pour A, deux pour B.
      await client.query(
        `insert into public.notifications (proprietaire_id, type, titre)
         values ($1, 'info', 'A1'), ($1, 'info', 'A2'),
                ($2, 'info', 'B1'), ($2, 'info', 'B2')`,
        [proprietaireA, proprietaireB]
      );

      // En tant que A, « tout marquer comme lu » : 2 lignes exactement.
      const rMarqTous = await client.query<{ n: number }>(
        `select public.marquer_notifications_lues() as n`
      );
      verifier(
        '(d) A marque ses SEULES 2 notifications',
        Number(rMarqTous.rows[0].n) === 2,
        `n = ${rMarqTous.rows[0].n}`
      );

      const rBnonLues = await client.query<{ n: number }>(
        `select count(*)::int as n from public.notifications
          where proprietaire_id = $1 and lu = false`,
        [proprietaireB]
      );
      verifier(
        '(d) les notifications de B restent NON lues (isolation)',
        Number(rBnonLues.rows[0].n) === 2,
        `n = ${rBnonLues.rows[0].n}`
      );

      const rAnonlues = await client.query<{ n: number }>(
        `select count(*)::int as n from public.notifications
          where proprietaire_id = $1 and lu = false`,
        [proprietaireA]
      );
      verifier(
        '(d) toutes les notifications de A sont lues',
        Number(rAnonlues.rows[0].n) === 0,
        `n = ${rAnonlues.rows[0].n}`
      );

      // Ciblage par p_ids : A vise une notification de B → refusée.
      const rIdB = await client.query<{ id: string }>(
        `select id from public.notifications
          where proprietaire_id = $1 order by id limit 1`,
        [proprietaireB]
      );
      const idB = Number(rIdB.rows[0].id);
      const rCible = await client.query<{ n: number }>(
        `select public.marquer_notifications_lues($1::bigint[]) as n`,
        [[idB]]
      );
      verifier(
        "(d) cibler la notification d'un AUTRE compte n'en marque aucune",
        Number(rCible.rows[0].n) === 0,
        `n = ${rCible.rows[0].n}`
      );

      const rBcheck = await client.query<{ lu: boolean }>(
        `select lu from public.notifications where id = $1`,
        [idB]
      );
      verifier(
        "(d) la notification de B n'a PAS été modifiée",
        rBcheck.rows[0]?.lu === false,
        String(rBcheck.rows[0]?.lu)
      );
    }
  } finally {
    // AUCUNE donnée de test n'est conservée.
    await client.query('rollback');
    await client.end().catch(() => {});
  }

  // ---- Rapport ----
  console.log('\n=== TEST NOTIFICATIONS PERSISTANTES ===\n');
  let echecs = 0;
  for (const v of verifs) {
    if (!v.ok) echecs += 1;
    const marque = v.ok ? 'OK  ' : 'ÉCHEC';
    console.log(`[${marque}] ${v.nom}${v.detail ? `  — ${v.detail}` : ''}`);
  }
  console.log(`\n${verifs.length - echecs}/${verifs.length} vérifications réussies.`);
  if (echecs > 0) {
    console.log(`${echecs} ÉCHEC(S).`);
    process.exit(1);
  }
  console.log('TOUT VERT.');
}

principal().catch((e: unknown) => {
  console.error('Échec du test :', e instanceof Error ? e.message : e);
  process.exit(1);
});
