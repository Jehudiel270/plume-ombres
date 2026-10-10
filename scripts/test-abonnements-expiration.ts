// ============================================================
// scripts/test-abonnements-expiration.ts — PREUVE exécutable.
//
//   npx tsx scripts/test-abonnements-expiration.ts
//
// Prouve que l'expiration d'un abonnement est garantie PAR LE CODE :
//   (a) public.expirer_abonnements() passe un 'actif' périmé en 'expire';
//   (b) la LECTURE applicative (lib/abonnement.ts) le considère INACTIF
//       même SANS réconciliation (défense en profondeur) ;
//   (c) un abonnement 'actif' NON périmé reste actif (aucun faux positif) ;
//   (d) un abonnement résilié n'est jamais ressuscité ;
//   (e) pg_cron est installé ET le job horaire est programmé ;
//   (f) après correction, le contrôle « aucun 'actif' dont periode_fin
//       est dépassée » renvoie 0.
//
// Isolation : TOUT le jeu de données de test est écrit dans une
// TRANSACTION ANNULÉE (ROLLBACK). La base réelle n'est jamais modifiée
// par ce script.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  abonnementActif,
  planEnVigueur,
  planParCode,
  quotaPourPlan,
  statutEffectif,
  type Abonnement,
} from '../lib/abonnement';

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

// ------------------------------------------------------------
// Mise en forme
// ------------------------------------------------------------
function versAbonnement(l: Record<string, unknown>): Abonnement {
  return {
    proprietaire_id: String(l.proprietaire_id),
    plan: l.plan as Abonnement['plan'],
    statut: l.statut as Abonnement['statut'],
    periode_debut:
      l.periode_debut instanceof Date
        ? l.periode_debut.toISOString()
        : ((l.periode_debut as string | null) ?? null),
    periode_fin:
      l.periode_fin instanceof Date
        ? l.periode_fin.toISOString()
        : ((l.periode_fin as string | null) ?? null),
    paiement_reference: (l.paiement_reference as string | null) ?? null,
    created_at:
      l.created_at instanceof Date
        ? l.created_at.toISOString()
        : String(l.created_at),
    updated_at:
      l.updated_at instanceof Date
        ? l.updated_at.toISOString()
        : String(l.updated_at),
  };
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

  const idPerime = randomUUID();
  const idValide = randomUUID();
  const idResilie = randomUUID();

  await client.query('begin');
  try {
    // Les clés étrangères et déclencheurs sont neutralisés DANS la
    // transaction : on insère des abonnements synthétiques sans avoir
    // à créer des comptes auth.users. Tout est annulé au ROLLBACK.
    await client.query('set local session_replication_role = replica');

    // ---- Jeu de données ----
    // (A) 'actif' + période DÉPASSÉE  → défaut à corriger
    // (C) 'actif' + période À VENIR   → doit rester actif
    // (D) 'resilie' + période dépassée → ne doit jamais bouger
    await client.query(
      `insert into public.abonnements
         (proprietaire_id, plan, statut, periode_debut, periode_fin)
       values
         ($1, 'essai', 'actif',   now() - interval '20 days', now() - interval '1 day'),
         ($2, 'essai', 'actif',   now() - interval '1 day',  now() + interval '10 days'),
         ($3, 'essai', 'resilie', now() - interval '20 days', now() - interval '1 day')`,
      [idPerime, idValide, idResilie]
    );

    const lireLigne = async (id: string): Promise<Abonnement> => {
      const { rows } = await client.query(
        `select proprietaire_id, plan, statut, periode_debut, periode_fin,
                paiement_reference, created_at, updated_at
           from public.abonnements where proprietaire_id = $1`,
        [id]
      );
      return versAbonnement(rows[0] as Record<string, unknown>);
    };

    // ---------- (b) LECTURE APPLICATIVE AVANT toute réconciliation ----------
    const avantPerime = await lireLigne(idPerime);
    verifier(
      '(b) statut en BASE = actif avant réconciliation',
      avantPerime.statut === 'actif',
      avantPerime.statut
    );
    verifier(
      '(b) lecture applicative : abonnementActif() = FAUX pour un actif périmé',
      abonnementActif(avantPerime) === false
    );
    verifier(
      "(b) lecture applicative : statutEffectif() = 'expire' (jamais 'actif')",
      statutEffectif(avantPerime) === 'expire',
      statutEffectif(avantPerime)
    );

    // ---------- (c) Un actif NON périmé reste actif ----------
    const avantValide = await lireLigne(idValide);
    verifier(
      '(c) lecture applicative : abonnement actif non périmé = ACTIF (aucun faux positif)',
      abonnementActif(avantValide) === true && statutEffectif(avantValide) === 'actif',
      statutEffectif(avantValide)
    );

    // ---------- Quota effectif (défense en profondeur, côté lecture) ----------
    // Règle câblée dans /abonnement et /api/abonnement : le quota élargi
    // du plan n'est accordé QUE si l'abonnement est effectivement actif.
    // Miroir exact de public.limite_abonnement (SQL).
    const BASE = 400_000;
    const planEssai = planParCode('essai');
    if (planEssai) {
      const quotaPlan = quotaPourPlan(planEssai, BASE);
      const quotaPerime = quotaPourPlan(
        planParCode(planEnVigueur(avantPerime)) ?? planParCode('gratuit')!,
        BASE
      );
      const quotaValide = quotaPourPlan(
        planParCode(planEnVigueur(avantValide)) ?? planParCode('gratuit')!,
        BASE
      );
      verifier(
        '(b) plan considéré EN VIGUEUR = aucun pour un abonnement échu',
        planEnVigueur(avantPerime) === null,
        String(planEnVigueur(avantPerime))
      );
      verifier(
        '(c) plan considéré EN VIGUEUR = le plan payant quand il est valide',
        planEnVigueur(avantValide) === 'essai',
        String(planEnVigueur(avantValide))
      );
      verifier(
        '(b) quota : un abonnement ÉCHU retombe sur le plafond de base',
        quotaPerime === BASE && quotaPlan > BASE,
        `échu = ${quotaPerime} (plan = ${quotaPlan})`
      );
      verifier(
        '(c) quota : un abonnement VALIDE n’est jamais coupé (garde le quota du plan)',
        quotaValide === quotaPlan && quotaValide > BASE,
        `valide = ${quotaValide}`
      );
    }

    // ---------- (a) RÉCONCILIATION ----------
    const r1 = await client.query<{ n: number }>(
      'select public.expirer_abonnements() as n'
    );
    const corriges = Number(r1.rows[0].n);
    const apresPerime = await lireLigne(idPerime);
    verifier(
      '(a) expirer_abonnements() a corrigé au moins 1 ligne',
      corriges >= 1,
      `corrigées = ${corriges}`
    );
    verifier(
      "(a) l'abonnement périmé porte désormais le statut 'expire'",
      apresPerime.statut === 'expire',
      apresPerime.statut
    );

    // Idempotence : un deuxième appel ne corrige plus rien.
    const r2 = await client.query<{ n: number }>(
      'select public.expirer_abonnements() as n'
    );
    verifier(
      '(a) idempotence : 2ᵉ appel = 0 correction',
      Number(r2.rows[0].n) === 0,
      `corrigées = ${r2.rows[0].n}`
    );

    // ---------- (c) toujours actif après réconciliation ----------
    const apresValide = await lireLigne(idValide);
    verifier(
      "(c) l'abonnement non périmé reste 'actif' après réconciliation",
      apresValide.statut === 'actif',
      apresValide.statut
    );

    // ---------- (d) résilié non ressuscité ----------
    const apresResilie = await lireLigne(idResilie);
    verifier(
      "(d) l'abonnement résilié n'est PAS ressuscité (reste 'resilie')",
      apresResilie.statut === 'resilie',
      apresResilie.statut
    );

    // ---------- (f) Contrôle global = 0 ----------
    const rControle = await client.query<{ n: number }>(
      `select count(*)::int as n from public.abonnements
        where statut = 'actif' and periode_fin is not null and periode_fin <= now()`
    );
    const restants = Number(rControle.rows[0].n);
    verifier(
      "(f) contrôle : AUCUN abonnement 'actif' avec periode_fin dépassée",
      restants === 0,
      `restants = ${restants}`
    );

    // ---------- (e) Planificateur pg_cron ----------
    const rExt = await client.query<{ n: number }>(
      `select count(*)::int as n from pg_extension where extname = 'pg_cron'`
    );
    verifier(
      '(e) pg_cron est installé',
      Number(rExt.rows[0].n) === 1,
      `extensions = ${rExt.rows[0].n}`
    );

    const rJob = await client.query<{
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
    }>(
      `select jobname, schedule, command, active from cron.job
        where jobname = 'expirer-abonnements-horaire'`
    );
    const job = rJob.rows[0];
    verifier(
      '(e) le job horaire est programmé et ACTIF',
      !!job && job.schedule === '0 * * * *' && job.active === true,
      job ? `${job.schedule} — ${job.command} (active=${job.active})` : 'job absent'
    );
  } finally {
    // AUCUNE donnée de test n'est conservée.
    await client.query('rollback');
    await client.end().catch(() => {});
  }

  // ---- Rapport ----
  console.log('\n=== TEST EXPIRATION DES ABONNEMENTS ===\n');
  let echecs = 0;
  for (const v of verifs) {
    if (!v.ok) echecs += 1;
    const marque = v.ok ? 'OK  ' : 'ÉCHEC';
    console.log(`[${marque}] ${v.nom}${v.detail ? `  — ${v.detail}` : ''}`);
  }
  console.log(
    `\n${verifs.length - echecs}/${verifs.length} vérifications réussies.`
  );
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
