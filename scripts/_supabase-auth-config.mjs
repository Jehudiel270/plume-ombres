// Interroge la configuration d'authentification Supabase via l'API de
// gestion (jeton personnel). N'affiche JAMAIS un secret : seulement
// l'état « renseigné / vide » des champs sensibles.
//
// Usage :
//   node scripts/_supabase-auth-config.mjs            (lecture)
//   node scripts/_supabase-auth-config.mjs --patch     (écriture SMTP + redirections)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REF = 'imbziizequckeaxuotdz';

function lireEnv() {
  const c = readFileSync('.env.local', 'utf8');
  const t = {};
  for (const l of c.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$/.exec(l);
    if (m) t[m[1]] = m[2].trim();
  }
  return t;
}

const e = lireEnv();
const TOKEN = e.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN absent de .env.local');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const entetes = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

/** Champs sensibles : on n'en montre que la présence. */
const SENSIBLES = ['smtp_pass', 'smtp_user', 'smtp_admin_email', 'smtp_host'];
const A_MONTRER = [
  'mailer_autoconfirm',
  'smtp_port',
  'smtp_sender_name',
  'smtp_max_frequency',
  'rate_limit_email_sent',
  'security_captcha_enabled',
  'external_email_enabled',
  'external_phone_enabled',
  'mailer_otp_exp',
  'mailer_secure_email_change_enabled',
];

const patch = process.argv.includes('--patch');

if (!patch) {
  const r = await fetch(API, { headers: entetes });
  if (!r.ok) {
    console.error(`Lecture refusée : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const cfg = await r.json();
  console.log('=== CONFIG AUTH ACTUELLE ===');
  for (const k of A_MONTRER) {
    if (k in cfg) console.log(`  ${k} = ${JSON.stringify(cfg[k])}`);
  }
  console.log('--- champs sensibles : renseigné / vide ---');
  for (const k of SENSIBLES) {
    const v = cfg[k];
    console.log(`  ${k} = ${v ? 'RENSEIGNÉ' : 'VIDE'}`);
  }
  console.log('--- redirections autorisées ---');
  console.log(`  uri_allow_list = ${JSON.stringify(cfg.uri_allow_list ?? null)}`);
  console.log('--- secrets disponibles localement (.env.local) ---');
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_EXPEDITEUR', 'SMTP_EXPEDITEUR_NOM']) {
    console.log(`  ${k} = ${e[k] ? 'présent' : 'ABSENT'}`);
  }
  writeFileSync(
    'C:/Users/dosso/dev/dark-romance-w6d/.supabase-auth-config-avant.json',
    JSON.stringify(
      Object.fromEntries(Object.entries(cfg).filter(([k]) => !k.includes('pass') && !k.includes('secret'))),
      null,
      2
    )
  );
  console.log('\n· copie (sans secret) : .supabase-auth-config-avant.json');
} else {
  // ---------- ÉCRITURE ----------
  const port = Number(e.SMTP_PORT || 587);
  const redirections = [
    'http://localhost:3951/**',
    'http://localhost:3000/**',
    'https://plume-ombres.vercel.app/**',
  ].join(',');

  const corps = {
    smtp_host: e.SMTP_HOST,
    smtp_port: String(port),
    smtp_user: e.SMTP_USER,
    smtp_pass: e.SMTP_PASSWORD,
    smtp_admin_email: e.SMTP_EXPEDITEUR,
    smtp_sender_name: e.SMTP_EXPEDITEUR_NOM ?? "Plume d'Ombres",
    // 60 s minimum entre deux e-mails vers la MÊME adresse (anti-spam).
    smtp_max_frequency: 60,
    // Le défaut Supabase est de 2 e-mails/heure pour TOUT le projet : avec un
    // SMTP dédié (Brevo), c'est un vrai blocage au lancement.
    rate_limit_email_sent: 30,
    uri_allow_list: redirections,
  };

  // On refuse d'envoyer un champ vide (Brevo incomplet = configuration cassée).
  const vides = Object.entries(corps).filter(([, v]) => !v).map(([k]) => k);
  if (vides.length) {
    console.error(`Champs manquants dans .env.local : ${vides.join(', ')}`);
    process.exit(1);
  }

  const r = await fetch(API, { method: 'PATCH', headers: entetes, body: JSON.stringify(corps) });
  const texte = await r.text();
  if (!r.ok) {
    console.error(`Écriture refusée : HTTP ${r.status} — ${texte.slice(0, 500)}`);
    process.exit(1);
  }
  const cfg = JSON.parse(texte);
  console.log('✓ Configuration SMTP appliquée');
  console.log(`  smtp_host = ${cfg.smtp_host}`);
  console.log(`  smtp_port = ${cfg.smtp_port}`);
  console.log(`  smtp_user = ${cfg.smtp_user ? 'RENSEIGNÉ' : 'VIDE'}`);
  console.log(`  smtp_pass = ${cfg.smtp_pass ? 'RENSEIGNÉ' : 'VIDE'}`);
  console.log(`  smtp_admin_email = ${cfg.smtp_admin_email ? 'RENSEIGNÉ' : 'VIDE'}`);
  console.log(`  smtp_sender_name = ${cfg.smtp_sender_name}`);
  console.log(`  uri_allow_list = ${cfg.uri_allow_list}`);
}
