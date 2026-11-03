// ============================================================
// scripts/configurer-domaine-supabase.mjs
//
// Ajoute le domaine définitif aux URL autorisées de Supabase Auth
// (réinitialisation de mot de passe, confirmation) et en fait le
// site_url par défaut. Ne touche NI au SMTP NI à aucun secret.
//
// Usage : node --env-file=.env.local scripts/configurer-domaine-supabase.mjs
// ============================================================
import { readFileSync } from 'node:fs';

const DOMAINE = 'https://plumedombres.kodelyza.com';
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
const jeton = e.SUPABASE_ACCESS_TOKEN;
if (!jeton) {
  console.error('SUPABASE_ACCESS_TOKEN absent de .env.local');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const entetes = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };

const avant = await fetch(API, { headers: entetes });
if (!avant.ok) {
  console.error(`Lecture refusée : HTTP ${avant.status}`);
  process.exit(1);
}
const cfg = await avant.json();
const liste = String(cfg.uri_allow_list ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

console.log(`site_url actuel : ${cfg.site_url}`);
console.log(`URL autorisées   : ${liste.length}`);

if (liste.includes(`${DOMAINE}/**`) && cfg.site_url === DOMAINE) {
  console.log('✓ Rien à faire : le domaine est déjà autorisé et par défaut.');
  process.exit(0);
}

const nouvelle = [...new Set([`${DOMAINE}/**`, ...liste])].join(',');
const r = await fetch(API, {
  method: 'PATCH',
  headers: entetes,
  body: JSON.stringify({ site_url: DOMAINE, uri_allow_list: nouvelle }),
});
if (!r.ok) {
  console.error(`Écriture refusée : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
const apres = await r.json();
console.log(`✓ site_url = ${apres.site_url}`);
console.log(`✓ URL autorisées = ${String(apres.uri_allow_list).split(',').length}`);
console.log(`  contient le domaine définitif : ${String(apres.uri_allow_list).includes(DOMAINE)}`);
