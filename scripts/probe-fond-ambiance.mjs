// Sonde FondAmbiance — preuve navigateur réelle (Edge headless + puppeteer-core).
//
// Ce que la sonde prouve :
//   1. captures du décor 1366 px pour LES 5 PALETTES + capture mobile
//      390 px, écrites dans %LOCALAPPDATA%\Temp,
//   2. métriques de perf AVANT/APRÈS sur un scénario identique
//      (accueil → chapitre) ET sur 3 fenêtres de repos de 3 s, qui
//      isolent le coût CONTINU du fond : ScriptDuration, LayoutDuration,
//      RecalcStyleDuration, TaskDuration, longtasks,
//   3. repli sous prefers-reduced-motion: reduce → html[data-fond="fixe"],
//      décor toujours peint derrière le contenu, ZÉRO erreur console.
//
// Usage : node scripts/probe-fond-ambiance.mjs <etiquette>
//   <etiquette> nomme les fichiers produits (ex. « avant », « apres »).

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3985';
const ETIQUETTE = process.argv[2] || 'run';
const PALETTES = ['brume', 'orage', 'encre', 'sangOr', 'claire'];

const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const COOKIE = {
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value:
    'base64-' +
    Buffer.from(JSON.stringify(demo.session.session), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  domain: 'localhost',
  path: '/',
};

const attente = (ms) => new Promise((r) => setTimeout(r, ms));
const mediane = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const out = tmpdir();

/** Pose la palette, le color-scheme et l'instrumentation AVANT tout script. */
async function preparer(page, palette) {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: palette === 'claire' ? 'light' : 'dark' },
  ]);
  await page.evaluateOnNewDocument((pal) => {
    try {
      window.localStorage.setItem('plume.dombres.palette.v1', pal);
    } catch {
      /* navigation privée */
    }
    window.__longtasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longtasks.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* longtask non supporté */
    }
  }, palette);
  await page.setCookie(COOKIE);
}

/** Attend que le fond ait décidé de son mode (data-fond posé par l'effet JS). */
async function attendreFond(page, timeout = 20_000) {
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.fond != null,
      { timeout, polling: 100 },
    );
  } catch {
    /* non posé : la sonde le signalera dans `dataFond` */
  }
}

/** Scénario identique avant/après : accueil → chapitre, fond animé ~3 s. */
async function scenario(page) {
  await page.goto(`${HOST}/`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await attendreFond(page);
  await attente(900);
  await page.goto(`${HOST}/livres/${demo.livreId}`, {
    waitUntil: 'networkidle2',
    timeout: 90_000,
  });
  await page.waitForSelector('#corps-livre', { timeout: 45_000 });
  await attente(3000);
}

/** Décrit le décor réellement peint (élément + opacité + z-index). */
async function decrireDecor(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-decor-fond], .fond-ambiance, .fond-fixe');
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    return {
      present: true,
      tag: el.tagName.toLowerCase(),
      zIndex: cs.zIndex,
      position: cs.position,
      opacity: Number(cs.opacity),
      affiche: cs.display !== 'none',
    };
  });
}

/** 3 fenêtres de repos de 3 s : médiane du coût continu du fond. */
async function coutRepos(page) {
  const fenetres = [];
  for (let i = 0; i < 3; i += 1) {
    const a = await page.metrics();
    const ltA = await page.evaluate(() => window.__longtasks.length);
    await attente(3000);
    const b = await page.metrics();
    const ltB = await page.evaluate(() => window.__longtasks.length);
    fenetres.push({
      ScriptDuration_s: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000) / 1000,
      LayoutDuration_s: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000) / 1000,
      RecalcStyleDuration_s: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000) / 1000,
      TaskDuration_s: Math.round((b.TaskDuration - a.TaskDuration) * 1000) / 1000,
      longtasks: ltB - ltA,
    });
  }
  return {
    fenetres,
    mediane: {
      ScriptDuration_s: mediane(fenetres.map((f) => f.ScriptDuration_s)),
      LayoutDuration_s: mediane(fenetres.map((f) => f.LayoutDuration_s)),
      RecalcStyleDuration_s: mediane(fenetres.map((f) => f.RecalcStyleDuration_s)),
      TaskDuration_s: mediane(fenetres.map((f) => f.TaskDuration_s)),
      longtasks: mediane(fenetres.map((f) => f.longtasks)),
    },
  };
}

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});

// ---------- 1) Mesure ANIMÉE, palette sombre (bureau 1366) -----------------
const page = await navigateur.newPage();
await page.setViewport({ width: 1366, height: 900 });
await preparer(page, 'brume');

const corpsAvant = await page.metrics();
await scenario(page);
const corpsApres = await page.metrics();

const delta = (k) => Math.round((corpsApres[k] - corpsAvant[k]) * 1000) / 1000;
const longtasks = await page.evaluate(() => ({
  n: window.__longtasks.length,
  total_ms: window.__longtasks.reduce((s, x) => s + x, 0),
  max_ms: window.__longtasks.length ? Math.max(...window.__longtasks) : 0,
}));

// Coût CONTINU du fond (aucune interaction) : 3 fenêtres de 3 s.
const repos = await coutRepos(page);

const fondAttr = await page.evaluate(() => document.documentElement.dataset.fond || null);
const decorAnime = await decrireDecor(page);
const shotBureau = join(out, `fond-${ETIQUETTE}-brume-chapitre-1366.png`);
await page.screenshot({ path: shotBureau });

// ---------- 2) Les 5 palettes, accueil, 1366 ------------------------------
const capturesPalettes = {};
for (const pal of PALETTES) {
  const pg = await navigateur.newPage();
  await pg.setViewport({ width: 1366, height: 900 });
  await preparer(pg, pal);
  await pg.goto(`${HOST}/`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await attendreFond(pg);
  await attente(1500);
  const f = join(out, `fond-${ETIQUETTE}-${pal}-1366.png`);
  await pg.screenshot({ path: f });
  capturesPalettes[pal] = f;
  await pg.close();
}

// ---------- 3) Capture mobile 390 (palette sombre « brume ») ---------------
const pageM = await navigateur.newPage();
await pageM.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await preparer(pageM, 'brume');
await pageM.goto(`${HOST}/`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendreFond(pageM);
await attente(1600);
const shotMobile = join(out, `fond-${ETIQUETTE}-brume-390.png`);
await pageM.screenshot({ path: shotMobile });
await pageM.close();

// ---------- 4) Repli prefers-reduced-motion: reduce ------------------------
const pageR = await navigateur.newPage();
await pageR.setViewport({ width: 1366, height: 900 });
await preparer(pageR, 'brume');
await pageR.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const erreurs = [];
pageR.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`console: ${m.text()}`);
});
pageR.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
await pageR.goto(`${HOST}/`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendreFond(pageR);
try {
  await pageR.waitForFunction(
    () => document.documentElement.dataset.fond === 'fixe',
    { timeout: 15_000, polling: 100 },
  );
} catch {
  /* signalé dans dataFond */
}
await attente(1200);
const fondReduit = await pageR.evaluate(() => document.documentElement.dataset.fond || null);
const decorReduit = await decrireDecor(pageR);
// La dérive doit être à l'arrêt : animation-name absent ou « none ».
const animReduite = await pageR.evaluate(() => {
  const d = document.querySelector('[data-decor-fond]');
  const b = d && d.querySelector('div');
  return b ? getComputedStyle(b).animationName : null;
});
const shotReduit = join(out, `fond-${ETIQUETTE}-reduit.png`);
await pageR.screenshot({ path: shotReduit });

const bilan = {
  etiquette: ETIQUETTE,
  dataFond: fondAttr,
  metriques: {
    ScriptDuration_s: delta('ScriptDuration'),
    LayoutDuration_s: delta('LayoutDuration'),
    RecalcStyleDuration_s: delta('RecalcStyleDuration'),
    TaskDuration_s: delta('TaskDuration'),
  },
  longtasks,
  cout_repos: repos,
  decor_anime: decorAnime,
  repli_reduced_motion: {
    dataFond: fondReduit,
    decor: decorReduit,
    animation_brume: animReduite,
    erreurs_console: erreurs,
  },
  captures: {
    chapitre: shotBureau,
    mobile: shotMobile,
    reduit: shotReduit,
    palettes: capturesPalettes,
  },
};

writeFileSync(join(out, `fond-mesure-${ETIQUETTE}.json`), JSON.stringify(bilan, null, 2), 'utf8');
console.log(JSON.stringify(bilan, null, 2));

await navigateur.close();
