// JETABLE (mesure F5 — confort de lecture + perf lecteur).
// Usage : node scripts/_w4a-probe-lecteur.mjs <largeur> [--shot sortie.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = `http://localhost:${process.env.PORT_PROBE || 3971}`;
const LARGEUR = Number(process.argv[2] || 1366);
const shotIdx = process.argv.indexOf('--shot');
const SHOT = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();
await page.setViewport(
  LARGEUR <= 400
    ? { width: LARGEUR, height: 844, isMobile: true, hasTouch: true }
    : { width: LARGEUR, height: 900 }
);

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

await page.evaluate(() => {
  if (window.innerWidth < 1024) document.querySelector('[aria-label="Ouvrir le sommaire"]')?.click();
});
await new Promise((r) => setTimeout(r, 600));
const chapitre = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('aside button')];
  const cible = bs.find((x) => /corridor/i.test(x.textContent)) ?? bs[1] ?? bs[0];
  cible?.click();
  return cible?.textContent?.trim().slice(0, 60) ?? null;
});
await page.evaluate(() => document.querySelector('[aria-label="Fermer le sommaire"]')?.click());
await page.waitForFunction(
  () => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000,
  { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1400));

// --- Caractéristiques typographiques réellement calculées ---
const typo = await page.evaluate(() => {
  const corps = document.querySelector('#corps-livre');
  const p = corps?.querySelector('p') ?? corps;
  const cs = p ? getComputedStyle(p) : null;
  const r = corps?.getBoundingClientRect();
  const etendue = corps?.querySelector('p')?.getBoundingClientRect();
  const ch = (() => {
    // Largeur MOYENNE d'un caractère du texte réellement affiché :
    // on mesure l'échantillon du chapitre avec la police calculée.
    const p0 = corps?.querySelector('p');
    if (!p0 || !cs) return 0;
    const echantillon = (p0.textContent ?? '').slice(0, 800) || 'x';
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText(echantillon).width / echantillon.length;
  })();
  return {
    texte_octets: corps?.textContent?.length ?? 0,
    noeuds_total: document.querySelectorAll('*').length,
    noeuds_corps: corps?.querySelectorAll('*').length ?? 0,
    paragraphes: corps?.querySelectorAll('p').length ?? 0,
    blocs: corps?.querySelectorAll(':scope > div').length ?? 0,
    police: cs?.fontFamily ?? null,
    taille_px: cs ? parseFloat(cs.fontSize) : null,
    interligne: cs?.lineHeight ?? null,
    alignement: cs?.textAlign ?? null,
    cesure: cs ? `${cs.hyphens}/${cs.webkitHyphens ?? '-'}` : null,
    retrait: cs?.textIndent ?? null,
    largeur_colonne_px: etendue ? Math.round(etendue.width) : (r ? Math.round(r.width) : null),
    colonnes: cs?.columnCount ?? null,
    caracteres_par_ligne: etendue && ch ? Math.round(etendue.width / ch) : null,
    hauteur_doc: document.documentElement.scrollHeight,
  };
});

const mesurer = () => page.metrics();
const avant = await mesurer();

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

const t2 = Date.now();
for (const libelle of ['Anglais', 'Français']) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b?.click();
  }, libelle);
  await new Promise((r) => setTimeout(r, 250));
}
const apresBascule = Date.now() - t2;

// Réglages : ouvrir le panneau et vérifier ce qui s'y trouve (clavier).
const reglages = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Réglages de lecture|Confort/i.test(x.getAttribute('aria-label') || x.title || ''));
  if (!b) return { panneau: 'absent' };
  b.focus(); b.click();
  return { panneau: 'ouvert', focus: document.activeElement?.tagName ?? null };
});
await new Promise((r) => setTimeout(r, 250));
const champs = await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] input, [role=dialog] button, [role=dialog] select')]
    .map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24))
);
await page.keyboard.press('Escape');

const apres = await mesurer();
const commits = await page.evaluate(() => window.__commits);
const longTasks = await page.evaluate(() => {
  const e = performance.getEntriesByType('longtask');
  return { n: e.length, total: Math.round(e.reduce((s, x) => s + x.duration, 0)) };
});
const d = (k) => Math.round((apres[k] - avant[k]) * 1000) / 1000;

if (SHOT) {
  await page.evaluate(() => document.querySelector('#corps-livre')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: SHOT });
}

const sortie = {
  vue: `${LARGEUR}px`,
  chapitre_ouvert: chapitre,
  scriptDuration_s: d('ScriptDuration'),
  recalcStyleDuration_s: d('RecalcStyleDuration'),
  layoutDuration_s: d('LayoutDuration'),
  taskDuration_s: d('TaskDuration'),
  commits_react: commits,
  longtasks: longTasks,
  ms_recherche: apresRecherche,
  ms_defilement: apresDefilement,
  ms_bascule: apresBascule,
  reglages,
  champs_reglages: champs,
  typo,
};
writeFileSync(join(tmpdir(), `_w4a_${LARGEUR}.json`), JSON.stringify(sortie, null, 2));
console.log(JSON.stringify(sortie, null, 2));
await navigateur.close();
