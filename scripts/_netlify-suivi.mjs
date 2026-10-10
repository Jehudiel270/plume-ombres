// Suit le dernier déploiement Netlify jusqu'à sa conclusion, puis contrôle
// le site publié. N'affiche jamais un secret.
//   node scripts/_netlify-suivi.mjs
import { readFileSync } from 'node:fs';

const API = 'https://api.netlify.com/api/v1';
const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$/.exec(l);
  if (m) env[m[1]] = m[2].trim();
}
const JETON = env.NETLIFY_AUTH_TOKEN;
const SITE = 'a52ddf70-0b70-4cd6-9f42-beff93b70592';
const BASE = 'https://plume-ombres.netlify.app';
const entetes = { Authorization: `Bearer ${JETON}` };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function dernierDeploiement() {
  const r = await fetch(`${API}/sites/${SITE}/deploys?per_page=1`, { headers: entetes });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const [d] = await r.json();
  return d;
}

let deploy = null;
const limite = Date.now() + 11 * 60 * 1000;
while (Date.now() < limite) {
  deploy = await dernierDeploiement();
  const etat = deploy?.state;
  console.log(`[${new Date().toISOString().slice(11, 19)}] déploiement ${deploy?.id?.slice(0, 12)} → ${etat}`);
  if (etat !== 'building' && etat !== 'enqueued' && etat !== 'uploading' && etat !== 'processing') break;
  await pause(15_000);
}

console.log(`\nÉtat final : ${deploy?.state}`);
if (deploy?.error_message) console.log(`Message : ${deploy.error_message}`);
if (deploy?.summary?.status) console.log(`Résumé : ${JSON.stringify(deploy.summary.status).slice(0, 300)}`);
console.log(`Publié : ${deploy?.published_at ?? '(non publié)'} · url ${deploy?.ssl_url ?? '-'}`);

// ---------- Contrôles du site publié ----------
const cible = [['/', 'redirection ou 200'], ['/connexion', '200'], ['/tarifs', '200'], ['/mot-de-passe-oublie', '200'], ['/service-worker.js', '200']];
console.log('\nContrôles HTTP :');
let echecs = 0;
for (const [chemin, attendu] of cible) {
  const r = await fetch(`${BASE}${chemin}`, { redirect: 'manual' }).catch(() => null);
  const code = r?.status ?? 'réseau';
  const ok = code === 200 || (chemin === '/' && code === 307) || (chemin === '/' && code === 200);
  if (!ok) echecs += 1;
  console.log(`  ${ok ? 'OK ' : 'KO '} ${chemin.padEnd(24)} ${code} (attendu : ${attendu})`);
}
const postTranslate = await fetch(`${BASE}/api/translate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
}).catch(() => null);
const codeTranslate = postTranslate?.status ?? 'réseau';
const okTranslate = codeTranslate === 401;
if (!okTranslate) echecs += 1;
console.log(`  ${okTranslate ? 'OK ' : 'KO '} POST /api/translate      ${codeTranslate} (attendu : 401)`);

const postRoles = await fetch(`${BASE}/api/admin/roles`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
}).catch(() => null);
const codeRoles = postRoles?.status ?? 'réseau';
const okRoles = codeRoles === 401;
if (!okRoles) echecs += 1;
console.log(`  ${okRoles ? 'OK ' : 'KO '} POST /api/admin/roles     ${codeRoles} (attendu : 401)`);

console.log(`\n${echecs === 0 ? '✓ SITE NETLIFY FONCTIONNEL' : `✗ ${echecs} contrôle(s) en échec`}`);
process.exitCode = echecs === 0 ? 0 : 1;
