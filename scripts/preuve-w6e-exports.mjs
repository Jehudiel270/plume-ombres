// ============================================================
// preuve-w6e-exports.mjs — Preuve navigateur RÉELLE (Edge headless +
// puppeteer-core) des trois livrables de la branche w6/exports-promesses :
//
//   1. /tarifs présente le catalogue réel (prix F CFA, essai 7 jours,
//      usage raisonnable) et ne nomme aucun prestataire ;
//   2. la bibliothèque exporte un VRAI .epub, téléchargé puis inspecté
//      (scripts/inspecter-epub.py : structure ZIP + validité XML) ;
//   3. un chapitre passé en erreur est SIGNALÉ (bibliothèque + espace de
//      lecture) et la relance le RÉPARE (vérifié en base).
//
// Usage : node scripts/preuve-w6e-exports.mjs
// Pré-requis : serveur `npx next dev --webpack -p 3996` lancé, Edge installé,
// %TEMP%\shader-demo.json (session + livreId de démo) présent.
// ============================================================

import { readFileSync, readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3996';
const RACINE = join(tmpdir(), 'preuve-w6e');
mkdirSync(RACINE, { recursive: true });
const dest = join(RACINE, 'telechargements-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dest, { recursive: true });

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Environnement (jamais commité : secrets lus à l'exécution) ----------
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SUPA = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1];
const ANON = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)[1];
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const LIVRE = demo.livreId;

/**
 * La session de démo expire (JWT ~1 h). On la rafraîchit si besoin et on
 * réécrit le jeton dans le fichier TEMPORAIRE (jamais suivi par git).
 */
async function sessionValide() {
  const session = demo.session.session;
  if (session.expires_at * 1000 > Date.now() + 60_000) return session;
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!r.ok) {
    throw new Error(`Rafraîchissement de session impossible : ${r.status} ${await r.text()}`);
  }
  const frais = await r.json();
  demo.session.session = frais;
  writeFileSync(join(tmpdir(), 'shader-demo.json'), JSON.stringify(demo, null, 2), 'utf8');
  console.log('[session] jeton de démo rafraîchi.');
  return frais;
}
const SESSION = await sessionValide();
const TOKEN_ACTIF = SESSION.access_token;

function base64url(entree) {
  return Buffer.from(entree, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function entetes(extra = {}) {
  return { apikey: ANON, Authorization: `Bearer ${TOKEN_ACTIF}`, Accept: 'application/json', ...extra };
}

async function restGet(chemin) {
  const r = await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: entetes() });
  if (!r.ok) throw new Error(`REST GET ${chemin} → ${r.status}`);
  return r.json();
}

async function restPatch(chemin, corps) {
  const r = await fetch(`${SUPA}/rest/v1/${chemin}`, {
    method: 'PATCH',
    headers: entetes({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`REST PATCH ${chemin} → ${r.status} ${await r.text()}`);
  return r.json();
}

// --- Bilan ---------------------------------------------------------------
const rapport = {
  base: BASE,
  horodatage: new Date().toISOString(),
  tarifs: { ok: false, manquants: [], interdits: [], capture: null },
  epub: { ok: false, fichier: null, inspection: null },
  erreur: { ok: false, captureBibliotheque: null, captureLivre: null, statutAvant: null, statutApres: null },
  erreursConsole: [],
};

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    `--user-data-dir=${join(tmpdir(), 'po-edge-preuve-' + Date.now())}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
  ],
});
const cibleNavigateur = navigateur.target();
const sessionBrowser = await cibleNavigateur.createCDPSession();
await sessionBrowser.send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  eventsEnabled: true,
  downloadPath: dest,
});

const page = await navigateur.newPage();
await page.setViewport({ width: 1366, height: 900 });
// Les window.alert éventuels sont acceptés (sinon le dialogue bloque la page).
page.on('dialog', (d) => d.accept().catch(() => undefined));
page.on('console', (m) => {
  if (m.type() === 'error') rapport.erreursConsole.push('console: ' + m.text());
});
page.on('pageerror', (e) => rapport.erreursConsole.push('pageerror: ' + String(e)));

// ============================================================
// 1. /tarifs — catalogue réel, aucun nom de prestataire
// ============================================================
await page.goto(`${BASE}/tarifs`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendre(800);
rapport.tarifs.capture = join(RACINE, 'tarifs.png');
await page.screenshot({ path: rapport.tarifs.capture, fullPage: true });

const texteTarifsBrut = await page.evaluate(() => document.body.innerText);
// Les montants formatés en fr-FR utilisent une espace fine insécable (U+202F).
const texteTarifs = texteTarifsBrut.replace(/[\u202f\u00a0]/g, ' ');
const attendus = ['F CFA', '3 000', '30 000', '7 jours', 'usage raisonnable', 'Premium'];
rapport.tarifs.manquants = attendus.filter((a) => !texteTarifs.toLowerCase().includes(a.toLowerCase()));
const interdits = ['LibreTranslate', 'Gemini', 'MyMemory', 'Google Traduction', 'Google Translate'];
rapport.tarifs.interdits = interdits.filter((a) => texteTarifs.toLowerCase().includes(a.toLowerCase()));
rapport.tarifs.ok = rapport.tarifs.manquants.length === 0 && rapport.tarifs.interdits.length === 0;
console.log(
  `[tarifs] attendus manquants : ${rapport.tarifs.manquants.join(', ') || 'aucun'} | ` +
    `noms de moteurs présents : ${rapport.tarifs.interdits.join(', ') || 'aucun'}`
);

// ============================================================
// 2. Bibliothèque — export EPUB réellement téléchargé
// ============================================================
await page.setCookie({
  name: `sb-${SUPA.match(/https:\/\/([^.]+)\./)[1]}-auth-token`,
  value: 'base64-' + base64url(JSON.stringify(demo.session.session)),
  domain: 'localhost',
  path: '/',
});
await page.goto(`${BASE}/bibliotheque`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendre(4000); // laisse React s'hydrater avant tout clic
if (page.url().includes('/connexion')) {
  throw new Error('Session de démo refusée (cookie) — vérifier jeton/expiration.');
}

const SELECTEUR_EPUB = 'button[title*="EPUB"]';
let fichierEpub = null;
for (let essai = 0; essai < 4 && !fichierEpub; essai += 1) {
  const bouton = await page.$(SELECTEUR_EPUB);
  if (!bouton) throw new Error('Bouton EPUB introuvable dans la bibliothèque.');
  await bouton.click().catch(() => undefined);
  for (let i = 0; i < 20 && !fichierEpub; i += 1) {
    await attendre(500);
    fichierEpub =
      readdirSync(dest).find((n) => n.endsWith('.epub') && statSync(join(dest, n)).size > 0) ?? null;
  }
}
if (!fichierEpub) {
  const message = await page
    .evaluate(() => {
      const noeud = [...document.querySelectorAll('p[role="status"]')].map((p) => p.textContent);
      return noeud.join(' | ') || '(aucun message)';
    })
    .catch(() => '(page illisible)');
  throw new Error(`Aucun fichier .epub téléchargé après clic. Message de la page : ${message}`);
}
const cheminEpub = join(dest, fichierEpub);
const inspection = JSON.parse(
  execFileSync('python', ['scripts/inspecter-epub.py', cheminEpub], { encoding: 'utf8' })
);
rapport.epub = {
  ok: Boolean(inspection.valide),
  fichier: cheminEpub,
  inspection,
};
console.log(
  `[epub] ${fichierEpub} — ${inspection.taille} octets, ${inspection.nb_chapitres} chapitres, ` +
    `langue=${inspection.langue}, XML=${inspection.xml_valide ? 'OK' : 'KO'}, valide=${inspection.valide}`
);
await page.screenshot({ path: join(RACINE, 'bibliotheque-success.png'), fullPage: true });

// ============================================================
// 3. Chapitre en erreur — signalement + relance réparatrice
// ============================================================
const chapitres = await restGet(
  `chapitres?livre_id=eq.${LIVRE}&select=id,titre,position,statut&order=position.asc`
);
if (chapitres.length === 0) throw new Error('Le livre de démo n’a aucun chapitre.');
const cible = chapitres[chapitres.length - 1];

// Provoque l'erreur : le chapitre passe en « erreur » (relu ensuite).
await restPatch(`chapitres?id=eq.${cible.id}`, { statut: 'erreur' });
const force = await restGet(`chapitres?id=eq.${cible.id}&select=statut`);
rapport.erreur.statutAvant = force[0]?.statut ?? null;

await page.goto(`${BASE}/bibliotheque`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector(`[data-alerte-chapitres="${LIVRE}"]`, { timeout: 30_000 });
await attendre(500);
rapport.erreur.captureBibliotheque = join(RACINE, 'bibliotheque-erreur.png');
await page.screenshot({ path: rapport.erreur.captureBibliotheque, fullPage: true });
const texteAlerte = await page.$eval(`[data-alerte-chapitres="${LIVRE}"]`, (el) => el.innerText);
console.log(`[erreur] bibliothèque : « ${texteAlerte.replace(/\n/g, ' | ')} »`);

// Le sommaire de l'espace de lecture signale lui aussi le chapitre.
await page.goto(`${BASE}/livres/${LIVRE}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector('[data-alerte-chapitres-livre]', { timeout: 30_000 });
await attendre(500);
rapport.erreur.captureLivre = join(RACINE, 'livre-erreur-sommaire.png');
await page.screenshot({ path: rapport.erreur.captureLivre, fullPage: true });
const texteLivre = await page.$eval('[data-alerte-chapitres-livre]', (el) => el.innerText);
console.log(`[erreur] espace livre : « ${texteLivre.replace(/\n/g, ' | ')} »`);

// Relance depuis la bibliothèque.
await page.goto(`${BASE}/bibliotheque`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector(`[data-alerte-chapitres="${LIVRE}"]`, { timeout: 30_000 });
await attendre(4000); // laisse React s'hydrater (sinon le clic n'atteint pas le handler)

const SELECTEUR_RELANCE = 'button[title="Relancer la traduction des chapitres en erreur"]';
let repare = false;
for (let essai = 0; essai < 4 && !repare; essai += 1) {
  const bouton = await page.$(SELECTEUR_RELANCE);
  if (!bouton) break;
  await bouton.click().catch(() => undefined);
  try {
    await page.waitForFunction(() => !document.querySelector('[data-alerte-chapitres]'), {
      timeout: 20_000,
    });
    repare = true;
  } catch {
    await attendre(2000);
  }
}
if (!repare) {
  throw new Error('La relance n’a pas fait disparaître l’alerte (clic non pris en compte ?).');
}
await attendre(500);
rapport.erreur.captureApres = join(RACINE, 'bibliotheque-reparee.png');
await page.screenshot({ path: rapport.erreur.captureApres, fullPage: true });

const apres = await restGet(`chapitres?id=eq.${cible.id}&select=statut`);
rapport.erreur.statutApres = apres[0]?.statut ?? null;
rapport.erreur.ok = rapport.erreur.statutApres === 'traduit';
console.log(`[erreur] statut en base : ${rapport.erreur.statutAvant} → ${rapport.erreur.statutApres}`);

await navigateur.close();

const cheminRapport = join(RACINE, 'rapport.json');
writeFileSync(cheminRapport, JSON.stringify(rapport, null, 2), 'utf8');
console.log(`\nRapport : ${cheminRapport}`);
if (!rapport.tarifs.ok || !rapport.epub.ok || !rapport.erreur.ok) {
  console.error('❌ Preuve incomplète.');
  process.exit(1);
}
console.log('✅ Preuve complète : tarifs, EPUB téléchargé/inspecté, erreur signalée et réparée.');
