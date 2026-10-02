#!/usr/bin/env node
// ============================================================
// probe-apparence.mjs — Preuve navigateur RÉELLE (Edge headless)
// du panneau « Apparence » global et du système de palettes/typos.
//
// MESURE (rien d'estimé) :
//   · le bouton flottant existe sur TOUTES les pages testées ;
//   · ouverture au clic ET via l'événement plume:ouvrir-apparence ;
//   · 5 pastilles palette + 3 tuiles typographie, vraies radios ;
//   · persistance localStorage + application après rechargement ;
//   · réinitialisation (retour au défaut système) ;
//   · contrastes AA calculés depuis les valeurs CSS réellement
//     appliquées (getComputedStyle → --color-*) pour les 5 palettes ;
//   · polices auto-hébergées réellement chargées, aucune requête CDN ;
//   · tenue sur écran mobile 390 px (pas de débordement).
//
// Usage : node scripts/probe-apparence.mjs
// ============================================================

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = process.env.PLUME_HOST || 'http://localhost:3981';
const OUT = join(process.env.LOCALAPPDATA || tmpdir(), 'Temp', 'plume-apparence');
const CLEF = 'plume.dombres.palette.v1';
const CLEF_TYPO = 'plume.dombres.typo.v1';
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const cookies = [
  {
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
  },
];

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  defaultViewport: { width: 1366, height: 900, deviceScaleFactor: 1 },
});
const page = await navigateur.newPage();
await page.setCookie(...cookies);

const erreurs = [];
const cdn = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text());
});
page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./i.test(r.url()))
    cdn.push(r.url());
});

const RAPPORT = { pages: {}, palettes: {}, typo: {}, apercu: {} };

/**
 * Ouvre le panneau « Apparence » de façon fiable : sur une page SSR,
 * React n'attache ses écouteurs qu'après l'hydratation (parfois lente
 * en `next dev`). On clique et on vérifie ; tant que le panneau
 * n'apparaît pas, on réessaie (patience ~20 s).
 */
async function ouvrirPanneau(cible) {
  await cible
    .waitForSelector('button.bouton-apparence', { timeout: 60_000 })
    .catch(() => {});
  for (let essai = 0; essai < 60; essai += 1) {
    const ouvert = await cible.evaluate(
      () => !!document.querySelector('#panneau-apparence'),
    );
    if (ouvert) return true;
    await cible.evaluate(() => {
      const b = document.querySelector('button.bouton-apparence');
      if (b) b.click();
    });
    await pause(350);
  }
  return await cible.evaluate(() => !!document.querySelector('#panneau-apparence'));
}

// ---------------- 1. Bouton présent sur toutes les pages ----------------
// Préchauffage : en `next dev`, la 1ʳᵉ visite d'une route déclenche la
// compilation ; on l'absorbe ici pour que la boucle mesure un vrai rendu.
for (const chemin of ['/', '/tarifs', '/faq', '/bibliotheque', `/livres/${demo.livreId}`]) {
  await page.goto(`${HOST}${chemin}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
}
await pause(1500);

const PAGES = ['/', '/tarifs', '/faq', '/bibliotheque', `/livres/${demo.livreId}`];
for (const chemin of PAGES) {
  await page.goto(`${HOST}${chemin}`, {
    waitUntil: 'networkidle2',
    timeout: 120_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('button.bouton-apparence', { timeout: 60_000 });
  await pause(600);
  const etat = await page.evaluate(() => {
    const bouton = document.querySelector('button.bouton-apparence');
    return {
      bouton: !!bouton,
      libelle: bouton?.textContent?.trim() ?? null,
      ariaHaspopup: bouton?.getAttribute('aria-haspopup') ?? null,
      paletteHtml: document.documentElement.dataset.palette ?? null,
      typoHtml: document.documentElement.dataset.typo ?? null,
    };
  });
  RAPPORT.pages[chemin] = etat;
  await page.screenshot({ path: join(OUT, `page${chemin.replace(/\//g, '_')}.png`) });
}

// ---------------- 2. Ouverture au clic + contenu du panneau -------------
await ouvrirPanneau(page);
const CONTENU = await page.evaluate(async () => {
  const p = document.querySelector('#panneau-apparence');
  if (!p) return { ouvert: false };
  const r = p.getBoundingClientRect();
  return {
    ouvert: true,
    role: p.getAttribute('role'),
    paletteRadios: document.querySelectorAll('input[name="palette-plume"]').length,
    typoRadios: document.querySelectorAll('input[name="typo-plume"]').length,
    droitPanneau: Math.round(r.right),
    largeurPanneau: Math.round(r.width),
    dansEcran: r.left >= 0 && r.right <= window.innerWidth + 1,
    focusDansPanneau: p.contains(document.activeElement),
  };
});

// ---------------- 3. Ouverture via l'événement global ----------------
const PAR_EVENEMENT = await page.evaluate(async () => {
  // fermeture (Échap) puis réouverture par l'événement
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const ferme = !document.querySelector('#panneau-apparence');
  window.dispatchEvent(new Event('plume:ouvrir-apparence'));
  await new Promise((r) => setTimeout(r, 300));
  return { fermeParEchap: ferme, ouvertParEvenement: !!document.querySelector('#panneau-apparence') };
});

// ---------------- 4. Sélection via le panneau + persistance -------------
const selection = await page.evaluate(async (id) => {
  const input = [...document.querySelectorAll('input[name="palette-plume"]')].find(
    (i) => i.value === id,
  );
  input?.click();
  await new Promise((r) => setTimeout(r, 300));
  return {
    coche: document.querySelector('input[name="palette-plume"]:checked')?.value,
    html: document.documentElement.dataset.palette,
    localStorage: localStorage.getItem('plume.dombres.palette.v1'),
    fondCorps: getComputedStyle(document.body).backgroundColor,
    accentTexte: getComputedStyle(document.documentElement)
      .getPropertyValue('--color-grenat-400')
      .trim(),
  };
}, 'sangOr');
await page.screenshot({ path: `${OUT}/panneau-ouvert.png` });

await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
await page.evaluate(() => document.fonts.ready);
await pause(500);
const apresRechargement = await page.evaluate(() => ({
  paletteHtml: document.documentElement.dataset.palette,
  localStorage: localStorage.getItem('plume.dombres.palette.v1'),
  fondCorps: getComputedStyle(document.body).backgroundColor,
}));
await page.screenshot({ path: `${OUT}/sangOr-apres-rechargement.png` });

// ---------------- 5. Typographie via le panneau + persistance -------------
const typoAvant = await page.evaluate(() => ({
  typo: document.documentElement.dataset.typo,
  corps: getComputedStyle(document.body).fontFamily,
  titre: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
  bodoni: document.fonts.check('16px bodoniModa'),
  literata: document.fonts.check('16px literata'),
  cormorant: document.fonts.check('16px cormorantGaramond'),
}));
await ouvrirPanneau(page);
const typoSelection = await page.evaluate(async () => {
  const input = document.querySelector('input[name="typo-plume"][value="velin"]');
  input?.click();
  await new Promise((r) => setTimeout(r, 350));
  return {
    coche: document.querySelector('input[name="typo-plume"]:checked')?.value,
    html: document.documentElement.dataset.typo,
    localStorage: localStorage.getItem('plume.dombres.typo.v1'),
    corps: getComputedStyle(document.body).fontFamily,
  };
});
await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
await page.evaluate(() => document.fonts.ready);
await pause(500);
const typoApres = await page.evaluate(() => ({
  typo: document.documentElement.dataset.typo,
  corps: getComputedStyle(document.body).fontFamily,
  policesChargees: {
    bodoni: document.fonts.check('16px bodoniModa'),
    literata: document.fonts.check('16px literata'),
    cormorant: document.fonts.check('16px cormorantGaramond'),
  },
}));
await page.screenshot({ path: `${OUT}/typo-velin.png` });

// ---------------- 6. Contrastes réels par palette ----------------
// On lit les jetons CSS RÉELLEMENT appliqués après bascule de data-palette.
const luminance = (hexTriplet) => {
  const [r, g, b] = hexTriplet.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const hexVersRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ratio = (a, b) => {
  const la = luminance(hexVersRgb(a));
  const lb = luminance(hexVersRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

for (const palette of ['brume', 'orage', 'encre', 'sangOr', 'claire']) {
  await page.evaluate(
    (id, c) => localStorage.setItem(c, id),
    palette,
    CLEF,
  );
  await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
  await pause(500);
  const jetons = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const lire = (n) => cs.getPropertyValue(n).trim();
    return {
      palette: document.documentElement.dataset.palette,
      fond: getComputedStyle(document.body).backgroundColor,
      encre100: lire('--color-encre-100'),
      encre500: lire('--color-encre-500'),
      nuit950: lire('--color-nuit-950'),
      nuit800: lire('--color-nuit-800'),
      grenat400: lire('--color-grenat-400'),
    };
  });
  RAPPORT.palettes[palette] = {
    applique: jetons.palette,
    texte_sur_fond: +ratio(jetons.encre100, jetons.nuit950).toFixed(2),
    texte_doux_sur_fond: +ratio(jetons.encre500, jetons.nuit950).toFixed(2),
    accent_sur_fond: +ratio(jetons.grenat400, jetons.nuit950).toFixed(2),
    accent_sur_surface: +ratio(jetons.grenat400, jetons.nuit800).toFixed(2),
    fondCalcule: jetons.fond,
  };
  await page.screenshot({ path: `${OUT}/palette-${palette}.png` });
}

// ---------------- 7. Réinitialisation ----------------
// On pose d'abord un choix explicite PAR L'INTERFACE, puis on vérifie
// que « Réinitialiser » efface bien la préférence stockée.
await ouvrirPanneau(page);
const avantReset = await page.evaluate(async () => {
  document.querySelector('input[name="palette-plume"][value="orage"]')?.click();
  await new Promise((r) => setTimeout(r, 300));
  return {
    html: document.documentElement.dataset.palette,
    clef: localStorage.getItem('plume.dombres.palette.v1'),
  };
});
await ouvrirPanneau(page);
const reinit = await page.evaluate(async () => {
  const bouton = [...document.querySelectorAll('#panneau-apparence button')].find((b) =>
    b.textContent.includes('Réinitialiser'),
  );
  bouton?.click();
  await new Promise((r) => setTimeout(r, 400));
  return {
    panneauFerme: !document.querySelector('#panneau-apparence'),
    paletteHtml: document.documentElement.dataset.palette,
    typoHtml: document.documentElement.dataset.typo,
    clefPalette: localStorage.getItem('plume.dombres.palette.v1'),
    clefTypo: localStorage.getItem('plume.dombres.typo.v1'),
  };
});

// ---------------- 8. Mobile 390 px : pas de débordement ----------------
const mobile = await navigateur.newPage();
await mobile.setCookie(...cookies);
await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await mobile.goto(`${HOST}/bibliotheque`, { waitUntil: 'networkidle2', timeout: 120_000 });
await pause(400);
await ouvrirPanneau(mobile);
const mobileEtat = await mobile.evaluate(() => {
  const bouton = document.querySelector('button.bouton-apparence');
  const p = document.querySelector('#panneau-apparence');
  const r = p?.getBoundingClientRect();
  return {
    bouton: !!bouton,
    libelleVisible: bouton
      ? [...bouton.querySelectorAll('span')].map((s) => ({
          texte: s.textContent.trim(),
          visible:
            s.offsetParent !== null && getComputedStyle(s).display !== 'none',
        }))
      : [],
    ouvert: !!p,
    gauche: r ? Math.round(r.left) : null,
    droite: r ? Math.round(r.right) : null,
    debordement: r ? r.left < -1 || r.right > window.innerWidth + 1 : null,
    scrollHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    radiosVisibles: document.querySelectorAll('#panneau-apparence input[type=radio]').length,
  };
});
await mobile.screenshot({ path: `${OUT}/mobile-390.png` });

// Clavier : premier radio palette focus puis flèche → la palette change.
const clavier = await mobile.evaluate(async () => {
  const premier = document.querySelector('input[name="palette-plume"]');
  const avant = premier?.value;
  premier?.focus();
  return { focus: document.activeElement?.value ?? null, avant };
});
await mobile.keyboard.press('ArrowRight');
await pause(400);
const clavierApres = await mobile.evaluate(() => ({
  coche: document.querySelector('input[name="palette-plume"]:checked')?.value,
  html: document.documentElement.dataset.palette,
}));

RAPPORT.contenu = CONTENU;
RAPPORT.evenement = PAR_EVENEMENT;
RAPPORT.selection = selection;
RAPPORT.apresRechargement = apresRechargement;
RAPPORT.typo = { avant: typoAvant, selection: typoSelection, apres: typoApres };
RAPPORT.reinitialisation = { avantReset, ...reinit };
RAPPORT.mobile = mobileEtat;
RAPPORT.clavier = { ...clavier, apres: clavierApres };
RAPPORT.requetesCdn = cdn;
RAPPORT.erreursConsole = erreurs;
RAPPORT.erreursImputablesApparence = erreurs.filter((e) =>
  /PanneauApparence|panneau-apparence|bouton-apparence|zone-apparence/.test(e),
);
RAPPORT.captures = OUT;

console.log(JSON.stringify(RAPPORT, null, 2));
writeFileSync(join(OUT, 'rapport.json'), JSON.stringify(RAPPORT, null, 2));

await navigateur.close();
