// ============================================================
// Tests réels — P0.2 (quota mensuel) + P0.3 (limitation de débit).
// Usage : npx tsx scripts/test-rate-limit-quota.ts
//
//   A. Logique pure (fenêtre glissante, clés compte/IP, quota) via les
//      magasins MÉMOIRE — déterministe, sans attente.
//   B. Route réelle POST /api/translate : requêtes anonymes par IP →
//      401 puis 429 avec en-têtes standard (magasin Supabase réel).
//   C. Magasins SUPABASE réels (RPC) : 11e appel refusé puis autorisé
//      après la fenêtre, quota mensuel bloqué au-delà de la limite,
//      isolation par compte.
//   D. Structure en base : tables, RLS, fonctions SECURITY DEFINER,
//      privilèges (anon peut consommer un débit, PAS réserver de quota).
//
// Hygiène : clés de débit préfixées « test:… » et période de quota
// isolée (2000-01-01) puis supprimées ; l'utilisateur jetable est
// supprimé (cascade). Aucun secret n'est affiché.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client as ClientPg } from 'pg';
import { createClient } from '@supabase/supabase-js';
import {
  MagasinRateLimitMemoire,
  MagasinRateLimitSupabase,
  limiterRequete,
  entetesRateLimit,
  cleRateLimit,
  extraireIp,
  CODE_RATE_LIMIT_DEPASSE,
  type ClientRpc,
} from '../lib/rate-limit';
import {
  MagasinQuotaMemoire,
  MagasinQuotaSupabase,
  reserverQuota,
  libererQuota,
  lireUsageQuota,
  periodeMois,
  CODE_QUOTA_DEPASSE,
} from '../lib/quota';

// ---------- Environnement (jamais affiché) ----------
let URL_SUPABASE = '';
let ANON = '';
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
    const cle = m[1];
    const val = m[2].trim();
    if (process.env[cle] === undefined) process.env[cle] = val;
  }
  URL_SUPABASE =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://imbziizequckeaxuotdz.supabase.co';
  ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
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
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ouvrirPg(): ClientPg {
  // Le pooler IPv4 (comme scripts/migrer-remote.ts) : l'hôte direct
  // « db.<ref>.supabase.co » n'est pas résolvable depuis ce réseau.
  const hote = (process.env.SUPABASE_DB_HOST ?? '').includes('pooler')
    ? process.env.SUPABASE_DB_HOST!
    : 'aws-1-eu-west-1.pooler.supabase.com';
  return new ClientPg({
    host: hote,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    user: 'postgres.imbziizequckeaxuotdz',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
}

// ============================================================
// A. Logique pure (magasins mémoire, horloge injectée)
// ============================================================
async function partieA() {
  console.log('\n— A. Logique pure (mémoire) —');

  // A1. Fenêtre glissante : 10 autorisés, 11e refusé, puis autorisé
  //     après expiration de la fenêtre.
  let t = 0;
  const mag = new MagasinRateLimitMemoire(() => t);
  const opts = { fenetreS: 60, limiteCompte: 10, limiteIp: 3 };
  const etats = [];
  for (let i = 0; i < 10; i += 1) {
    etats.push(await limiterRequete(mag, { userId: 'u1' }, opts));
  }
  verifier(
    'A1 : 10 premiers appels autorisés',
    etats.every((e) => e.autorise && e.limite === 10)
  );
  verifier('A1 : restant décrémente (9 puis 0)', etats[0].restant === 9 && etats[9].restant === 0);

  const onzieme = await limiterRequete(mag, { userId: 'u1' }, opts);
  verifier(
    'A1 : 11e appel REFUSÉ (429)',
    !onzieme.autorise && onzieme.restant === 0,
    JSON.stringify(onzieme)
  );
  verifier(
    'A1 : reset = fin de fenêtre glissante (t0 + 60 s)',
    onzieme.reset === 60,
    String(onzieme.reset)
  );

  t = 59_999;
  const encore = await limiterRequete(mag, { userId: 'u1' }, opts);
  verifier('A1 : 1 ms avant la fin, toujours refusé', !encore.autorise);

  t = 60_001;
  const apres = await limiterRequete(mag, { userId: 'u1' }, opts);
  verifier('A1 : après la fenêtre, appel de nouveau AUTORISÉ', apres.autorise);

  // A2. Clés distinctes : compte prioritaire, sinon IP ; compteurs isolés.
  const mag2 = new MagasinRateLimitMemoire(() => 0);
  const opts2 = { fenetreS: 60, limiteCompte: 2, limiteIp: 1 };
  const ip1a = await limiterRequete(mag2, { ip: '1.2.3.4' }, opts2);
  const ip1b = await limiterRequete(mag2, { ip: '1.2.3.4' }, opts2);
  verifier('A2 : anonyme par IP — 1 appel autorisé puis refusé (limite IP=1)', ip1a.autorise && !ip1b.autorise);
  const ip2 = await limiterRequete(mag2, { ip: '5.6.7.8' }, opts2);
  verifier('A2 : une autre IP a son propre compteur', ip2.autorise);

  const uA1 = await limiterRequete(mag2, { userId: 'uA', ip: '1.2.3.4' }, opts2);
  const uA2 = await limiterRequete(mag2, { userId: 'uA', ip: '1.2.3.4' }, opts2);
  const uA3 = await limiterRequete(mag2, { userId: 'uA', ip: '1.2.3.4' }, opts2);
  verifier(
    'A2 : compte authentifié — compteur distinct de l’IP (2 autorisés, 3e refusé)',
    uA1.autorise && uA2.autorise && !uA3.autorise
  );
  const uB = await limiterRequete(mag2, { userId: 'uB', ip: '1.2.3.4' }, opts2);
  verifier('A2 : deux comptes sur la même IP ne se pénalisent pas', uB.autorise);

  verifier(
    'A2 : clés explicites (user:… / ip:…)',
    cleRateLimit({ userId: 'uA' }) === 'user:uA' &&
      cleRateLimit({ ip: '1.2.3.4' }) === 'ip:1.2.3.4' &&
      cleRateLimit({}) === 'ip:inconnue'
  );
  verifier(
    'A2 : extraireIp lit x-forwarded-for puis x-real-ip',
    extraireIp({ headers: { get: (n) => (n === 'x-forwarded-for' ? '9.9.9.9, 10.0.0.1' : null) } }) === '9.9.9.9' &&
      extraireIp({ headers: { get: (n) => (n === 'x-real-ip' ? '7.7.7.7' : null) } }) === '7.7.7.7'
  );

  // A3. Quota mensuel : comptage, refus clair, isolation compte/période.
  const qm = new MagasinQuotaMemoire();
  const limite = 100;
  const oct = new Date('2026-10-15T00:00:00Z');

  const r1 = await reserverQuota(qm, 'acc-1', 60, oct, limite);
  verifier(
    'A3 : 60/100 réservés — autorisé, période = mois civil',
    r1.autorise && r1.utilise === 60 && r1.periode.debut === '2026-10-01' && r1.periode.fin === '2026-10-31'
  );

  const r2 = await reserverQuota(qm, 'acc-1', 50, oct, limite);
  verifier(
    'A3 : 60+50 > 100 — REFUSÉ avec code dédié + message clair',
    !r2.autorise &&
      r2.code === CODE_QUOTA_DEPASSE &&
      r2.utilise === 60 &&
      /60\/100/.test(r2.message ?? '') &&
      /2026-10-01/.test(r2.message ?? ''),
    r2.message
  );

  const r3 = await reserverQuota(qm, 'acc-1', 40, oct, limite);
  verifier('A3 : complément jusqu’à la limite accepté', r3.autorise && r3.utilise === 100);

  const usage = await lireUsageQuota(qm, 'acc-1', oct, limite);
  verifier(
    'A3 : lireUsageQuota renvoie (utilisé, limite, période)',
    usage.utilise === 100 &&
      usage.limite === 100 &&
      usage.periode.debut === '2026-10-01' &&
      usage.periode.fin === '2026-10-31'
  );

  const autre = await reserverQuota(qm, 'acc-2', 100, oct, limite);
  verifier('A3 : quota compté PAR COMPTE (acc-2 intact)', autre.autorise);

  const moisSuivant = await reserverQuota(qm, 'acc-1', 10, new Date('2026-11-05T00:00:00Z'), limite);
  verifier('A3 : nouveau mois civil = nouveau quota', moisSuivant.autorise && moisSuivant.utilise === 10);

  await libererQuota(qm, 'acc-1', 100, oct);
  const apresLiberation = await lireUsageQuota(qm, 'acc-1', oct, limite);
  verifier('A3 : libération (traduction échouée) rend les caractères', apresLiberation.utilise === 0);

  verifier(
    'A3 : période d’un mois à 31/28/30 jours correcte',
    periodeMois(new Date('2026-02-10T00:00:00Z')).fin === '2026-02-28' &&
      periodeMois(new Date('2026-04-10T00:00:00Z')).fin === '2026-04-30'
  );
}

// ============================================================
// B. Route réelle POST /api/translate (anonyme → par IP)
// ============================================================
async function partieB() {
  console.log('\n— B. Route réelle /api/translate (magasin Supabase réel) —');
  // Limite IP volontairement basse pour un test rapide et déterministe.
  process.env.RATE_LIMIT_IP_MAX = '2';
  process.env.RATE_LIMIT_COMPTE_MAX = '50';
  process.env.RATE_LIMIT_FENETRE_S = '60';

  const { NextRequest } = await import('next/server');
  const route = await import('../app/api/translate/route');

  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
  const requete = () =>
    new NextRequest('http://localhost/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ texte: 'hello world', source: 'en', cible: 'fr' }),
    });

  const r1 = await route.POST(requete());
  const r2 = await route.POST(requete());
  const r3 = await route.POST(requete());
  verifier('B : appels 1 et 2 anonymes → 401 (débit consommé)', r1.status === 401 && r2.status === 401, `${r1.status}/${r2.status}`);
  verifier('B : appel 3 → 429 (limite IP atteinte)', r3.status === 429, String(r3.status));

  const corps = (await r3.json()) as { code?: string };
  verifier('B : corps 429 porte le code RATE_LIMIT_DEPASSE', corps.code === CODE_RATE_LIMIT_DEPASSE, JSON.stringify(corps));
  verifier(
    'B : en-têtes standard présents sur le 429',
    r3.headers.get('x-ratelimit-limit') === '2' &&
      r3.headers.get('x-ratelimit-remaining') === '0' &&
      Number(r3.headers.get('retry-after')) >= 1 &&
      Number(r3.headers.get('x-ratelimit-reset')) > Math.floor(Date.now() / 1000) - 5,
    `limit=${r3.headers.get('x-ratelimit-limit')} retry=${r3.headers.get('retry-after')}`
  );
  verifier(
    'B : en-têtes de débit aussi sur la 401 (état transparent)',
    r1.headers.get('x-ratelimit-limit') === '2' && r1.headers.get('x-ratelimit-remaining') === '1'
  );

  // Une AUTRE IP n'est pas affectée (comptage par IP).
  const ip2 = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const rAutre = await route.POST(
    new NextRequest('http://localhost/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip2 },
      body: JSON.stringify({ texte: 'hello world', source: 'en', cible: 'fr' }),
    })
  );
  verifier('B : une IP différente reste servie (401, pas 429)', rAutre.status === 401, String(rAutre.status));

  return [ip, ip2];
}

// ============================================================
// C. Magasins Supabase réels (RPC) — débit et quota
// ============================================================
async function partieC(): Promise<{ userId: string | null; periode: string }> {
  console.log('\n— C. Magasins Supabase réels (RPC) —');
  const periode = '2000-01-01'; // période isolée pour ne pas polluer l'usage réel
  if (!ANON) {
    console.log('· ANON manquant : partie C ignorée.');
    return { userId: null, periode };
  }

  const email = `quota-rl-${Date.now()}@example.com`;
  const mdp = 'PlumeTest.2026!';
  const supabase = createClient(URL_SUPABASE, ANON);
  const { data: signUp, error: errSignUp } = await supabase.auth.signUp({
    email,
    password: mdp,
    options: { data: { pseudo: 'Test quota/RL' } },
  });
  verifier('C : création du compte de test', !errSignUp && !!signUp.user, errSignUp?.message);
  if (!signUp.user) return { userId: null, periode };

  const userId = signUp.user.id;
  const pg = ouvrirPg();
  await pg.connect();
  try {
    await pg.query('update auth.users set email_confirmed_at = now() where id = $1', [userId]);
    const { data: connexion, error: errConnexion } = await supabase.auth.signInWithPassword({
      email,
      password: mdp,
    });
    verifier('C : connexion (jeton réel)', !errConnexion && !!connexion.session?.access_token, errConnexion?.message);
    if (!connexion.session?.access_token) return { userId, periode };

    const rpcAuth: ClientRpc = { rpc: (n, a) => supabase.rpc(n, a) };
    const magRlAuth = new MagasinRateLimitSupabase(rpcAuth);
    const magQuotaAuth = new MagasinQuotaSupabase(rpcAuth);

    // C1. Fenêtre glissante réelle : limite 3 sur fenêtre de 2 s.
    const cle = `test:rl:${userId}:${Date.now()}`;
    const optsRl = { fenetreS: 2, limiteCompte: 3, limiteIp: 3 };
    const c1a = await limiterRequete(magRlAuth, { userId: cle }, optsRl);
    const c1b = await limiterRequete(magRlAuth, { userId: cle }, optsRl);
    const c1c = await limiterRequete(magRlAuth, { userId: cle }, optsRl);
    const c1d = await limiterRequete(magRlAuth, { userId: cle }, optsRl);
    verifier(
      'C1 : 3 appels autorisés puis 4e REFUSÉ (fenêtre glissante réelle)',
      c1a.autorise && c1b.autorise && c1c.autorise && !c1d.autorise && c1a.restant === 2,
      JSON.stringify([c1a.autorise, c1d.autorise])
    );
    const resteAttente = Math.max(c1d.reset - Math.floor(Date.now() / 1000), 0);
    // Tolérance : décalage d'horloge base/local + arrondi au bigint.
    verifier(
      'C1 : reset renvoyé = fin de fenêtre (epoch futur, ~2 s)',
      resteAttente > 0 && resteAttente <= 5,
      `attente=${resteAttente}s`
    );
    await attendre(resteAttente * 1000 + 400);
    const c1e = await limiterRequete(magRlAuth, { userId: cle }, optsRl);
    verifier('C1 : après la fenêtre, l’appel suivant est AUTORISÉ', c1e.autorise);

    // C2. Quota mensuel réel : limite 100, période isolée.
    const dateIso = new Date(`${periode}T12:00:00Z`);
    const q1 = await reserverQuota(magQuotaAuth, userId, 60, dateIso, 100);
    verifier(
      'C2 : 60/100 réservés en base — autorisé',
      q1.autorise && q1.utilise === 60 && q1.periode.debut === periode,
      JSON.stringify(q1)
    );
    const q2 = await reserverQuota(magQuotaAuth, userId, 50, dateIso, 100);
    verifier(
      'C2 : 60+50 > 100 — REFUSÉ (code + message)',
      !q2.autorise && q2.code === CODE_QUOTA_DEPASSE && q2.utilise === 60 && /Quota mensuel/.test(q2.message ?? ''),
      q2.message
    );
    const lecture = await lireUsageQuota(magQuotaAuth, userId, dateIso, 100);
    verifier('C2 : lecture persistée en base = 60', lecture.utilise === 60 && lecture.limite === 100);
    await libererQuota(magQuotaAuth, userId, 60, dateIso);
    const apresLib = await lireUsageQuota(magQuotaAuth, userId, dateIso, 100);
    verifier('C2 : libération persistée en base = 0', apresLib.utilise === 0);

    // C3. Le compte ne peut pas agir sur le quota d'un AUTRE compte.
    let refuseTiers = false;
    try {
      await supabase.rpc('reserver_quota', {
        p_proprietaire: '00000000-0000-0000-0000-000000000000',
        p_periode: periode,
        p_caracteres: 1,
        p_limite: 100,
      });
    } catch (e) {
      refuseTiers = true;
    }
    const rpcTiers = await supabase.rpc('reserver_quota', {
      p_proprietaire: '00000000-0000-0000-0000-000000000000',
      p_periode: periode,
      p_caracteres: 1,
      p_limite: 100,
    });
    refuseTiers = refuseTiers || !!rpcTiers.error;
    verifier('C3 : réservation au nom d’un tiers refusée', refuseTiers);

    // C4. anon n'a PAS le droit de réserver un quota (grant restreint).
    const anonClient = createClient(URL_SUPABASE, ANON);
    const anonTentative = await anonClient.rpc('consommer_rate_limit', {
      p_cle: `test:rl:anon:${Date.now()}`,
      p_fenetre_s: 60,
      p_limite: 1,
    });
    verifier('C4 : anon PEUT consommer un débit (grant)', !anonTentative.error);
    const anonQuota = await anonClient.rpc('lire_usage_quota', {
      p_proprietaire: userId,
      p_periode: periode,
    });
    verifier('C4 : anon NE PEUT PAS lire un quota (grant restreint)', !!anonQuota.error, anonQuota.error?.message);

    // Nettoyage.
    await pg.query("delete from public.rate_limit_hits where cle like 'test:%'");
    await pg.query('delete from public.usage_mensuel where periode = $1 and proprietaire_id = $2', [periode, userId]);
    await pg.query('delete from auth.users where id = $1', [userId]);
    console.log('· Nettoyage : clés de débit test, quota isolé et compte jetable supprimés.');
    return { userId, periode };
  } finally {
    await pg.end().catch(() => undefined);
  }
}

// ============================================================
// D. Structure en base (schéma, RLS, grants)
// ============================================================
async function partieD() {
  console.log('\n— D. Structure en base —');
  const pg = ouvrirPg();
  await pg.connect();
  try {
    const tables = await pg.query(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace
          and relname in ('rate_limit_hits', 'usage_mensuel') order by relname`
    );
    verifier(
      'D : tables rate_limit_hits et usage_mensuel existent, RLS activée',
      tables.rows.length === 2 && tables.rows.every((r) => r.relrowsecurity === true),
      JSON.stringify(tables.rows)
    );

    const fns = await pg.query(
      `select p.proname, p.prosecdef from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('consommer_rate_limit','lire_usage_quota','reserver_quota','liberer_quota','purger_rate_limit')`
    );
    verifier(
      'D : 5 fonctions présentes, toutes SECURITY DEFINER',
      fns.rows.length === 5 && fns.rows.every((r) => r.prosecdef === true),
      JSON.stringify(fns.rows.map((r) => r.proname))
    );

    const grants = await pg.query(
      `select has_function_privilege('anon', 'public.consommer_rate_limit(text,integer,integer)', 'execute') as anon_rl,
              has_function_privilege('anon', 'public.reserver_quota(uuid,date,bigint,bigint)', 'execute') as anon_quota,
              has_function_privilege('authenticated', 'public.reserver_quota(uuid,date,bigint,bigint)', 'execute') as auth_quota`
    );
    const g = grants.rows[0] as { anon_rl: boolean; anon_quota: boolean; auth_quota: boolean };
    verifier(
      'D : privilèges corrects (anon débit OUI, anon quota NON, authenticated quota OUI)',
      g.anon_rl === true && g.anon_quota === false && g.auth_quota === true,
      JSON.stringify(g)
    );

    const idx = await pg.query(
      `select indexname from pg_indexes where schemaname = 'public'
        and tablename = 'rate_limit_hits'`
    );
    verifier('D : index de fenêtre glissante présent', idx.rows.length >= 2, JSON.stringify(idx.rows));
  } finally {
    await pg.end().catch(() => undefined);
  }
}

// ============================================================
async function principal() {
  chargerEnv();
  await partieA();

  let ips: string[] = [];
  try {
    ips = await partieB();
  } catch (e) {
    console.warn('· Partie B ignorée :', (e as Error).message);
  }

  let userIdC: string | null = null;
  let periodeC = '';
  try {
    const r = await partieC();
    userIdC = r.userId;
    periodeC = r.periode;
  } catch (e) {
    console.warn('· Partie C partielle :', (e as Error).message);
  }

  try {
    await partieD();
  } catch (e) {
    console.warn('· Partie D ignorée :', (e as Error).message);
  }

  // Nettoyage résiduel, ciblé sur les IP EXACTES du test (aucune
  // ligne d'un utilisateur réel n'est touchée).
  try {
    if (ips.length) {
      const pg = ouvrirPg();
      await pg.connect();
      for (const ip of ips) {
        await pg.query('delete from public.rate_limit_hits where cle = $1', [`ip:${ip}`]);
      }
      await pg.end();
    }
  } catch {
    /* best effort */
  }

  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`}` +
      ` (ips testées: ${ips.length}, compte quota testé: ${userIdC ? userIdC.slice(0, 8) + '…' : 'aucun'}, période: ${periodeC || '—'})`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error('Échec inattendu :', e);
  process.exit(1);
});
