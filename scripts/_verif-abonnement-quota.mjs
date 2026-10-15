// ============================================================
// _verif-abonnement-quota.mjs — Preuve HTTP RÉELLE (dev, port 3000).
//
//   node scripts/_verif-abonnement-quota.mjs [base] [email] [mdp]
//
// • SESSION : connexion avec un compte DÉJÀ EXISTANT (aucune création),
//   cookie sb-<ref>-auth-token posé comme le fait le navigateur.
// • LECTURE SEULE : aucune écriture (jamais /api/translate, aucun update).
// • Sorties : statuts HTTP, corps JSON, extraits du HTML rendu.
// ============================================================

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Client as ClientPg } from 'pg';

const BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.argv[3] || 'moteur-admin@plume-ombres.local';
const MDP = process.argv[4] || 'PlumeMoteur.2026!'; // compte de test du dépôt
const REF = 'imbziizequckeaxuotdz';

const lignes = readFileSync('.env.local', 'utf8').split('\n');
const val = (k) => {
  const l = lignes.find((x) => x.trim().startsWith(`${k}=`));
  if (!l) throw new Error(`absent: ${k}`);
  return l.split('=').slice(1).join('=').trim();
};

const pg = new ClientPg({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: `postgres.${REF}`,
  password: val('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await pg.connect();

const { rows: compte } = await pg.query('select id from auth.users where email = $1', [EMAIL]);
if (compte.length === 0) throw new Error('Compte absent — arrêt (aucune création).');
const uid = compte[0].id;
console.log(`compte EXISTANT réutilisé : ${EMAIL} → id ${uid.slice(0, 8)}…`);

const supabase = createClient(`https://${REF}.supabase.co`, val('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
const co = await supabase.auth.signInWithPassword({ email: EMAIL, password: MDP });
if (!co.data?.session) throw new Error('Connexion échouée : ' + (co.error?.message ?? '?'));
const COOKIE = `sb-${REF}-auth-token=${'base64-' + Buffer.from(JSON.stringify(co.data.session), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

// --- 0. vérité en base (SELECT) ----------------------------------
const { rows: usage } = await pg.query(
  `select periode::text, caracteres, coalesce(credits,0) as credits
     from public.usage_mensuel where proprietaire_id = $1 order by periode desc limit 2`,
  [uid]
);
console.log('usage_mensuel (SELECT) :', JSON.stringify(usage));
const { rows: ab } = await pg.query(
  `select plan, statut, periode_fin::text from public.abonnements where proprietaire_id = $1`,
  [uid]
);
console.log('abonnements  (SELECT) :', JSON.stringify(ab));

const sansBalises = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extraire = (texte, motif, avant = 70, apres = 120) => {
  const i = texte.indexOf(motif);
  return i === -1 ? 'ABSENT' : `« ${texte.slice(Math.max(0, i - avant), i + apres).trim()} »`;
};

// --- 1. GET /api/abonnement (session) ----------------------------
const r1 = await fetch(`${BASE}/api/abonnement`, { headers: { Cookie: COOKIE } });
const j1 = await r1.json();
console.log(`\n[1] GET /api/abonnement → ${r1.status}`);
console.log('    quota    =', JSON.stringify(j1.quota));
console.log('    credits  =', j1.credits?.solde, '| periodeFin =', j1.periodeFin, '| plan =', j1.plan, '| statut =', j1.statut);
console.log('    attendu en base :', usage[0] ? `${usage[0].caracteres} consommés → ${j1.quota?.effectif - usage[0].caracteres} restants` : '(aucune ligne)');
console.log('    restant servi == limite - base :', j1.quota?.restant === (j1.quota?.effectif - (usage[0]?.caracteres ?? 0)));

// --- 2. GET /abonnement (HTML rendu serveur) ---------------------
const r2 = await fetch(`${BASE}/abonnement`, { headers: { Cookie: COOKIE, Accept: 'text/html' }, redirect: 'manual' });
const html = await r2.text();
const t2 = sansBalises(html);
console.log(`\n[2] GET /abonnement → ${r2.status} (${html.length} octets de HTML)`);
console.log('    « Caractères restants ce mois » :', extraire(t2, 'Caractères restants ce mois'));
console.log('    « consommés · période »        :', extraire(t2, 'consommés · période'));
console.log('    « Crédits prépayés »           :', extraire(t2, 'Crédits prépayés', 20, 80));
console.log('    jauge (data-testid=quota-restant) présente :', html.includes('data-testid="quota-restant"'));
console.log('    progressbar ARIA présente      :', html.includes('aria-label="Quota mensuel consommé"'));

// --- 3. GET /compte ---------------------------------------------
const r3 = await fetch(`${BASE}/compte`, { headers: { Cookie: COOKIE, Accept: 'text/html' }, redirect: 'manual' });
const t3 = sansBalises(await r3.text());
console.log(`\n[3] GET /compte → ${r3.status}`);
console.log('    « Aucun plafond de traduction » (ancienne formule fausse) :', t3.includes('Aucun plafond de traduction'));
console.log('    « Il vous reste » :', extraire(t3, 'Il vous reste', 10, 140));

// --- 4. anonyme --------------------------------------------------
const r4 = await fetch(`${BASE}/api/abonnement`);
console.log(`\n[4] GET /api/abonnement (anonyme) → ${r4.status} ${JSON.stringify(await r4.json())}`);
const r5 = await fetch(`${BASE}/abonnement`, { redirect: 'manual' });
console.log(`    GET /abonnement (anonyme) → ${r5.status} location=${r5.headers.get('location')}`);

await pg.end();
