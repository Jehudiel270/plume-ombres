// JETABLE — mesures de référence F5 : réglages PAR DÉFAUT, trois largeurs.
// Usage : node scripts/_w4a-defauts.mjs <largeur> [--shot fichier.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3971';
const LARGEUR = Number(process.argv[2] || 1366);
const shotIdx = process.argv.indexOf('--shot');
const SHOT = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const navigateur = await puppeteer.launch({
  executablePath: EDGE, headless: true,
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
    renderers: new Map(), supportsFiber: true, inject() { return 1; },
    onCommitFiberRoot() { window.__commits += 1; },
    onCommitFiberUnmount() {}, checkDCE() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: window.__hook, configurable: true });
});
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});

// Réglages par défaut : on efface les préférences avant tout rendu.
await page.evaluateOnNewDocument(() => {
  try { localStorage.removeItem('plume.dombres.prefs.v1'); } catch (e) {}
});

const ouvreLong = async () => {
  await page.goto(`${HOST}/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await page.waitForSelector('#corps-livre', { timeout: 40_000 });
  await page.evaluate(() => {
    if (window.innerWidth < 1024) document.querySelector('[aria-label="Ouvrir le sommaire"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('aside button')];
    (bs.find((x) => /corridor/i.test(x.textContent)) ?? bs[1])?.click();
  });
  await page.evaluate(() => document.querySelector('[aria-label="Fermer le sommaire"]')?.click());
  await page.waitForFunction(() => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000, { timeout: 40_000 });
  await new Promise((r) => setTimeout(r, 1500));
};
await ouvreLong();

const typo = await page.evaluate(() => {
  const corps = document.querySelector('#corps-livre');
  const ps = [...corps.querySelectorAll('p')];
  const p1 = ps[0];
  const p2 = ps[1];
  const cs = getComputedStyle(p1);
  const csC = getComputedStyle(corps);
  const r1 = p1.getBoundingClientRect();
  const nb = (s) => parseFloat(s) || 0;
  // Caractères réellement par ligne : nombre de lignes d'un paragraphe
  // mesuré par les rects d'un Range (mise en page réelle), puis densité.
  const densite = (() => {
    const echantillon = ps.slice(1, 6);
    let lettres = 0;
    let lignes = 0;
    for (const p of echantillon) {
      const r = document.createRange();
      r.selectNodeContents(p);
      lignes += r.getClientRects().length;
      lettres += p.textContent.length;
    }
    return lignes > 0 ? Math.round(lettres / lignes) : null;
  })();
  const mot = (() => {
    const el = document.createElement('span');
    el.textContent = 'n'.repeat(200);
    el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-family:${cs.fontFamily};font-size:${cs.fontSize}`;
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width / 200;
    el.remove();
    return w;
  })();
  return {
    octets: corps.textContent.length,
    paragraphes: ps.length,
    scenes: corps.querySelectorAll('.scene-separateur').length,
    paquets: corps.children.length,
    noeuds_page: document.querySelectorAll('*').length,
    police: cs.fontFamily.split(',')[0],
    taille_px: nb(cs.fontSize),
    interligne: Math.round((nb(cs.lineHeight) / nb(cs.fontSize)) * 100) / 100,
    alignement: cs.textAlign,
    cesure: cs.hyphens,
    retrait_1er: cs.textIndent,
    retrait_2e: getComputedStyle(p2).textIndent,
    marge_para_1: cs.marginTop,
    marge_para_2: getComputedStyle(p2).marginTop,
    colonnes: csC.columnCount,
    largeur_colonne_px: Math.round(r1.width),
    caracteres_par_ligne: densite,
    caracteres_par_ligne_majore: Math.round(r1.width / mot),
    max_width: csC.maxWidth,
    padding_gauche_corps: csC.paddingLeft,
    hauteur_doc: document.documentElement.scrollHeight,
    largeur_ecran: window.innerWidth,
    largeur_zone_lecture: Math.round(document.querySelector('#lecteur-chapitre').getBoundingClientRect().width),
  };
});

// Perf : scénario identique à la référence de la vague 2.
const SANS_MOUVEMENT = process.argv.includes('--sansmouvement');
if (SANS_MOUVEMENT) {
  // L'appli force `scroll-behavior: auto` sous prefers-reduced-motion :
  // on isole ainsi le coût des animations de défilement du coût de rendu.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
}
const mesurer = () => page.metrics();
const avant = await mesurer();
const SANS_RECHERCHE = process.argv.includes('--sansrecherche');
const t0 = Date.now();
if (!SANS_RECHERCHE) {
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
}
const msRecherche = Date.now() - t0;
const t1 = Date.now();
const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
for (let i = 1; i <= 14; i += 1) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((hauteur - 900) * (i / 14)));
  await new Promise((r) => setTimeout(r, 60));
}
const msDefilement = Date.now() - t1;
await new Promise((r) => setTimeout(r, 500));
const t2 = Date.now();
for (const libelle of ['Anglais', 'Français']) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b?.click();
  }, libelle);
  await new Promise((r) => setTimeout(r, 250));
}
const msBascule = Date.now() - t2;
const apres = await mesurer();
const d = (k) => Math.round((apres[k] - avant[k]) * 1000) / 1000;
const commits = await page.evaluate(() => window.__commits);
const longtasks = await page.evaluate(() => {
  const e = performance.getEntriesByType('longtask');
  return { n: e.length, total: Math.round(e.reduce((s, x) => s + x.duration, 0)) };
});
const prefs = await page.evaluate(() => localStorage.getItem('plume.dombres.prefs.v1'));

if (SHOT) {
  await page.evaluate(() => document.querySelector('#corps-livre')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT });
}

const sortie = {
  vue: `${LARGEUR}px`,
  typo,
  prefs_stockees: prefs,
  perf: {
    scriptDuration_s: d('ScriptDuration'),
    recalcStyleDuration_s: d('RecalcStyleDuration'),
    layoutDuration_s: d('LayoutDuration'),
    taskDuration_s: d('TaskDuration'),
    commits_react: commits,
    longtasks,
    ms_recherche: msRecherche,
    ms_defilement: msDefilement,
    ms_bascule: msBascule,
  },
};
writeFileSync(join(tmpdir(), `_w4a_defauts_${LARGEUR}.json`), JSON.stringify(sortie, null, 2));
console.log(JSON.stringify(sortie, null, 2));
await navigateur.close();
