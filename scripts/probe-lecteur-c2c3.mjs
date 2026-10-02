// JETABLE (mesure C2/C3) — pilote Edge headless : durée de rendu + nb de rendus React.
// Usage : node scripts/_w2a-mesure.mjs [mobile]
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3951';
const MOBILE = process.argv.includes('mobile');
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();
await page.setViewport(MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1366, height: 900 });

// Compteur de rendus React (hook DevTools factice, posé AVANT tout script).
await page.evaluateOnNewDocument(() => {
  window.__commits = 0;
  window.__hook = {
    renderers: new Map(),
    supportsFiber: true,
    inject() { return 1; },
    onCommitFiberRoot() { window.__commits += 1; },
    onCommitFiberUnmount() {},
    checkDCE() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: window.__hook, configurable: true,
  });
});

await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});

await page.goto(`${HOST}/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector('#corps-livre', { timeout: 30_000 });

// Ouvrir le chapitre long (le tiroir mobile peut être fermé : clic JS).
await page.evaluate(() => {
  if (window.innerWidth < 1024) document.querySelector('[aria-label="Ouvrir le sommaire"]')?.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('aside button')].find((x) =>
    x.textContent.includes('Le long corridor'));
  b?.click();
});
await page.evaluate(() => document.querySelector('[aria-label="Fermer le sommaire"]')?.click());
await page.waitForFunction(
  () => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000,
  { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1200));

const mesurer = () => page.metrics();
const avant = await mesurer();

// --- Scénario : frappe (8 caractères), navigation d'occurrences, défilement, bascule
const t0 = Date.now();
await page.click('input[type=search]');
await page.type('input[type=search]', 'ombre', { delay: 0 });
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 3; i += 1) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Occurrence suivante');
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 120));
}
const apresRecherche = Date.now() - t0;

const t1 = Date.now();
const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
for (let i = 1; i <= 14; i += 1) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((hauteur - 900) * (i / 14)));
  await new Promise((r) => setTimeout(r, 60));
}
const apresDefilement = Date.now() - t1;
await new Promise((r) => setTimeout(r, 500));

// Bascule source/traduit (2 clics).
const t2 = Date.now();
for (const libelle of ['Anglais', 'Français']) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b?.click();
  }, libelle);
  await new Promise((r) => setTimeout(r, 250));
}
const apresBascule = Date.now() - t2;

// Tiroir mobile : ouverture + fermeture si le déclencheur existe.
const tiroir = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="Ouvrir le sommaire"]');
  if (!b) return 'absent';
  b.click();
  return 'present';
});
await new Promise((r) => setTimeout(r, 300));

const apres = await mesurer();
const commits = await page.evaluate(() => window.__commits);
const longTasks = await page.evaluate(() => {
  const e = performance.getEntriesByType('longtask');
  return { n: e.length, total: Math.round(e.reduce((s, x) => s + x.duration, 0)) };
});

const d = (k) => Math.round((apres[k] - avant[k]) * 1000) / 1000;
console.log(JSON.stringify({
  vue: MOBILE ? 'mobile 390x844' : 'bureau 1366x900',
  scriptDuration_s: d('ScriptDuration'),
  recalcStyleDuration_s: d('RecalcStyleDuration'),
  layoutDuration_s: d('LayoutDuration'),
  taskDuration_s: d('TaskDuration'),
  commits_react: commits,
  longtasks: longTasks,
  ms_recherche: apresRecherche,
  ms_defilement: apresDefilement,
  ms_bascule: apresBascule,
  tiroir,
}, null, 2));

await navigateur.close();
