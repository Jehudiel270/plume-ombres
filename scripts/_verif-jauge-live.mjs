// ============================================================
// _verif-jauge-live.mjs — Preuve NAVIGATEUR de l'actualisation live.
//
//   node scripts/_verif-jauge-live.mjs [base]
//
// Vérifie sur la page RÉELLE /abonnement (Edge headless, session
// Supabase existante) :
//   1. le premier rendu affiche ce qui RESTE (valeur serveur exacte) ;
//   2. un `plume:quota-consomme` (l'événement émis par
//      lib/useMoteurTraduction.ts après une traduction facturée)
//      déclenche un VRAI GET /api/abonnement depuis la page ;
//   3. la valeur affichée SUIT la réponse de l'API (aucune valeur figée) ;
//   4. un retour d'onglet (focus) relit aussi l'état.
//
// AUCUNE écriture en base : on ne passe jamais par /api/translate.
// ============================================================

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:3000';
const REF = 'imbziizequckeaxuotdz';
const EMAIL = 'moteur-admin@plume-ombres.local';
const MDP = 'PlumeMoteur.2026!';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const lignes = readFileSync('.env.local', 'utf8').split('\n');
const val = (k) => lignes.find((x) => x.trim().startsWith(`${k}=`)).split('=').slice(1).join('=').trim();
const supabase = createClient(`https://${REF}.supabase.co`, val('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
const co = await supabase.auth.signInWithPassword({ email: EMAIL, password: MDP });
if (!co.data?.session) throw new Error('Connexion impossible.');
const cookie = {
  name: `sb-${REF}-auth-token`,
  value:
    'base64-' +
    Buffer.from(JSON.stringify(co.data.session), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  domain: 'localhost',
  path: '/',
};

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check'],
  defaultViewport: { width: 1366, height: 900, deviceScaleFactor: 1 },
});

const page = await navigateur.newPage();
const requetesAbonnement = [];
page.on('response', (r) => {
  if (r.url().includes('/api/abonnement')) requetesAbonnement.push(r.status());
});
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.setCookie(cookie);
await page.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2', timeout: 90_000 });

// Attendre l'hydratation React du composant client (dev : plusieurs s).
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="quota-restant"]');
    return !!el && Object.keys(el).some((k) => k.startsWith('__react'));
  },
  { timeout: 90_000, polling: 300 }
);

const lire = () =>
  page.evaluate(() => ({
    quota: document.querySelector('[data-testid="quota-restant"]')?.innerText.replace(/\s+/g, ' ').trim(),
    credits: document.querySelector('[data-testid="quota-credits"]')?.innerText.replace(/\s+/g, ' ').trim(),
  }));

console.log('[1] rendu initial (valeur SERVEUR) :', JSON.stringify(await lire()));
console.log('    GET /api/abonnement au chargement :', JSON.stringify(requetesAbonnement));

// --- 2/3. événement de traduction → refetch RÉEL → DOM mis à jour ----
await page.evaluate(() => {
  window.__fetchesQuota = 0;
  window.__fetchOriginal = window.fetch.bind(window);
  window.fetch = (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? '';
    if (url.includes('/api/abonnement')) window.__fetchesQuota += 1;
    return window.__fetchOriginal(entree, init);
  };
});

// 2.a — refetch RÉEL, avec la vraie réponse du serveur.
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('plume:quota-consomme', { detail: { utilise: 999 } }));
});
await new Promise((r) => setTimeout(r, 4000));
console.log('\n[2] après `plume:quota-consomme` :');
console.log('    requêtes /api/abonnement déclenchées par la page :', await page.evaluate(() => window.__fetchesQuota));
console.log('    statuts observés (réseau réel) :', JSON.stringify(requetesAbonnement));
console.log('    valeur réaffichée :', JSON.stringify(await lire()));

// 3 — le DOM suit bien la réponse de l'API (payload déterministe).
await page.evaluate(() => {
  const vrai = window.fetch.bind(window);
  window.fetch = (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? '';
    if (url.includes('/api/abonnement')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quota: { effectif: 500000, utilise: 1200000, restant: 380000, periode: { debut: '2026-10-01', fin: '2026-10-31' } },
            credits: { solde: 250000 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    return vrai(entree, init);
  };
});
await page.evaluate(() => window.dispatchEvent(new CustomEvent('plume:quota-consomme')));
await page.waitForFunction(
  () => (document.querySelector('[data-testid="quota-restant"]')?.innerText || '').includes('380'),
  { timeout: 15_000, polling: 200 }
);
const apres = await lire();
console.log('\n[3] après réponse d’API différente (utilisé 1 200 000 / restant 380 000) :');
console.log('    quota   =', apres.quota);
console.log('    credits =', apres.credits);
console.log('    DOM suit la réponse serveur :', apres.quota.includes('380 000') && apres.credits.includes('250 000'));

// --- 4. retour d'onglet -------------------------------------------------
await page.evaluate(() => {
  // On rétablit un compteur AU-DESSUS du vrai fetch (le payload
  // synthétique de l'étape 3 ne comptait pas les appels).
  window.__fetchesQuota = 0;
  window.fetch = (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? '';
    if (url.includes('/api/abonnement')) window.__fetchesQuota += 1;
    return window.__fetchOriginal(entree, init);
  };
  window.dispatchEvent(new Event('focus'));
});
await new Promise((r) => setTimeout(r, 3000));
console.log(
  '\n[4] après retour d’onglet (focus) : requêtes déclenchées =',
  await page.evaluate(() => window.__fetchesQuota),
  '| statuts réseau :',
  JSON.stringify(requetesAbonnement)
);
console.log('    valeur après retour d’onglet :', JSON.stringify(await lire()));

// --- 5. capture ---------------------------------------------------------
const capture = `${process.env.LOCALAPPDATA}\\Temp\\plume-jauge-abonnement.png`;
await page.screenshot({ path: capture, fullPage: true });
console.log('\ncapture :', capture);

await navigateur.close();
