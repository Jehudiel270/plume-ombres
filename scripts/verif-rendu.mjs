#!/usr/bin/env node
// ============================================================
// verif-rendu.mjs — Vérification du RENDU réel (headless Chrome).
//
//   node scripts/verif-rendu.mjs [http://localhost:3210] [dossier-sortie]
//
// Contrôle, sur une vraie page servie par `next dev` :
//   · aucune requête vers un CDN de polices tiers,
//   · polices auto-hébergées réellement chargées (document.fonts),
//   · polices de titre ≠ police de corps (valeur calculée),
//   · changement de palette via localStorage + rechargement
//     (vrai chemin utilisateur : le décor CSS suit la palette),
//   · repli « décor figé » effectif sous prefers-reduced-motion,
//   · panneau RegleLecture : ouverture, sélection au clavier (flèche),
//     tenue sur un écran mobile étroit.
// Outil de contrôle manuel (nécessite Chrome + next dev).
// ============================================================

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:3210';
const OUT = process.argv[3] || 'C:/Users/dosso/AppData/Local/Temp/plume-rendu';
const BIN =
  process.env.CHROME_BIN ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const CLEF = 'plume.dombres.palette.v1';
const CLEF_TYPO = 'plume.dombres.typo.v1';

mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const navigateur = await puppeteer.launch({
  executablePath: BIN,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1280, height: 860, deviceScaleFactor: 1 },
});

const erreurs = [];
const requetesTierces = [];
const page = await navigateur.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text());
});
page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./i.test(r.url())) {
    requetesTierces.push(r.url());
  }
});

await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 90000 });
await page.evaluate(() => document.fonts.ready);

const info = await page.evaluate(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const h1 = document.querySelector('h1');
  return {
    palette: document.documentElement.dataset.palette ?? null,
    typo: document.documentElement.dataset.typo ?? null,
    fond: document.documentElement.dataset.fond ?? null,
    policeTitre: h1 ? cs(h1).fontFamily.split(',')[0] : null,
    policeCorps: cs(document.body).fontFamily.split(',')[0],
    policesChargees: {
      bodoni: document.fonts.check('16px bodoniModa'),
      literata: document.fonts.check('16px literata'),
      cormorant: document.fonts.check('16px cormorantGaramond'),
    },
  };
});
console.log('--- ÉTAT INITIAL (/) ---');
console.log(JSON.stringify(info, null, 2));
console.log('Requêtes vers un CDN tiers :', requetesTierces.length);

const PALETTES = ['brume', 'orage', 'encre', 'sangOr', 'claire'];
for (const p of PALETTES) {
  await page.evaluate((id, clef) => localStorage.setItem(clef, id), p, CLEF);
  await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await pause(800);
  await page.screenshot({ path: `${OUT}/palette-${p}.png` });
  const c = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return {
      active: document.documentElement.dataset.palette,
      fond: document.documentElement.dataset.fond,
      texte: cs.color,
      fondPage: cs.backgroundColor,
    };
  });
  console.log(
    `palette ${p.padEnd(7)} → [${c.active}/${c.fond}] texte ${c.texte} sur ${c.fondPage}`,
  );
}
await page.evaluate((clef) => localStorage.removeItem(clef), CLEF);

// ---- Typographie : changement via localStorage + rechargement ----
await page.evaluate((clef) => localStorage.setItem(clef, 'velin'), CLEF_TYPO);
await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
await page.evaluate(() => document.fonts.ready);
await pause(600);
const typoInfo = await page.evaluate(() => ({
  typo: document.documentElement.dataset.typo,
  policeTitre: getComputedStyle(document.querySelector('h1') ?? document.body)
    .fontFamily.split(',')[0],
  policeCorps: getComputedStyle(document.body).fontFamily.split(',')[0],
  cormorantChargee: document.fonts.check('16px cormorantGaramond'),
}));
console.log('--- TYPOGRAPHIE « velin » ---');
console.log(JSON.stringify(typoInfo, null, 2));
await page.evaluate((clef) => localStorage.removeItem(clef), CLEF_TYPO);
// ---- Pages publiques (non-régression) ----
for (const chemin of ['/tarifs', '/faq', '/connexion']) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle0', timeout: 90000 });
  const etat = await page.evaluate(() => ({
    titre: document.title.slice(0, 40),
    h1: document.querySelector('h1,h2')?.textContent?.trim().slice(0, 40) ?? null,
    police: getComputedStyle(document.querySelector('h1,h2') ?? document.body)
      .fontFamily.split(',')[0],
  }));
  console.log(`page ${chemin} →`, JSON.stringify(etat));
  await page.screenshot({ path: `${OUT}/page${chemin.replace('/', '-')}.png` });
}

// ---- Repli sous prefers-reduced-motion (décor figé) ----
const pageFix = await navigateur.newPage();
await pageFix.emulateMediaFeatures([
  { name: 'prefers-reduced-motion', value: 'reduce' },
]);
await pageFix.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 90000 });
await pause(700);
const repli = await pageFix.evaluate(() => {
  const decor = document.querySelector('[data-decor-fond]');
  const brume = decor?.firstElementChild ?? null;
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    fond: document.documentElement.dataset.fond ?? null,
    decor: decor ? cs(decor).display : null,
    decorZIndex: decor ? cs(decor).zIndex : null,
    // La dérive de brume doit être à l'arrêt.
    animationBrume: brume ? cs(brume).animationName : null,
  };
});
console.log('--- REPLI prefers-reduced-motion ---');
console.log(JSON.stringify(repli, null, 2));
await pageFix.screenshot({ path: `${OUT}/repli-reduced-motion.png` });

// ---- Panneau RegleLecture (page d'aperçu, mobile 390px) ----
try {
  const ui = await navigateur.newPage();
  await ui.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await ui.goto(`${BASE}/connexion/apercu`, {
    waitUntil: 'networkidle0',
    timeout: 90000,
  });
  await ui.evaluate(() => document.fonts.ready);
  await ui.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === 'Aa',
    );
    b?.click();
  });
  await pause(500);
  const mesure = await ui.evaluate(() => {
    const panneau = document.querySelector('[role="dialog"]');
    const r = panneau?.getBoundingClientRect();
    return {
      panneau: !!panneau,
      largeurPx: r ? Math.round(r.width) : null,
      droiteDepasse: r ? r.right > window.innerWidth + 1 : null,
      radios: document.querySelectorAll('input[name="palette-plume"]').length,
    };
  });
  await ui.screenshot({ path: `${OUT}/panneau-mobile.png` });
  console.log('--- PANNEAU (mobile 390px) ---');
  console.log(JSON.stringify(mesure, null, 2));

  // Clavier : focus 1er radio palette puis flèche droite.
  const avant = await ui.evaluate(() => {
    document.querySelector('input[name="palette-plume"]')?.focus();
    return document.activeElement?.value ?? null;
  });
  await ui.keyboard.press('ArrowRight');
  await pause(400);
  const apres = await ui.evaluate(() => ({
    coche: document.querySelector('input[name="palette-plume"]:checked')?.value,
    palette: document.documentElement.dataset.palette,
  }));
  console.log('--- CLAVIER (palette) ---');
  console.log(JSON.stringify({ focusAvant: avant, apres }, null, 2));
  await ui.screenshot({ path: `${OUT}/panneau-clavier.png` });
} catch (e) {
  console.log('Panneau : page d’aperçu absente —', e.message);
}

console.log('--- ERREURS CONSOLE ---');
console.log(erreurs.length ? erreurs.join('\n') : '(aucune)');
console.log('Captures :', OUT);

await navigateur.close();
