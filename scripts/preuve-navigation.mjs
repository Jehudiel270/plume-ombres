// ============================================================
// preuve-navigation.mjs — Sonde Edge headless (puppeteer-core).
//
// Preuve réelle de la navigation de l'espace connecté :
//  • liens du site visibles et atteignables (bureau + mobile) ;
//  • état actif exposé par aria-current ;
//  • menu utilisateur complet (compte, apparence, légal, sortie) ;
//  • contrat d'interface « plume:ouvrir-apparence » ;
//  • parcours clavier réel Tab / Entrée / flèches / Échap ;
//  • fermeture au clic extérieur.
//
// Usage : node scripts/preuve-navigation.mjs
// Prérequis : `npx next dev --webpack -p 3982` et la session de
// démonstration <Temp>/shader-demo.json.
// ============================================================
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3982';
const CAPTURES = join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp');
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

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});

const rapport = {};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Décrit l'élément focalisé (preuve du parcours clavier). */
const DECRIRE = () => {
  const a = document.activeElement;
  if (!a) return 'aucun';
  return [
    a.tagName.toLowerCase(),
    a.id ? `#${a.id}` : '',
    a.getAttribute('aria-label') ?? '',
    (a.textContent ?? '').trim().slice(0, 32),
  ]
    .filter(Boolean)
    .join(' | ');
};

const liensEntete = (p) =>
  p.$$eval('header a', (els) =>
    els.map((a) => ({
      href: a.getAttribute('href'),
      texte: (a.textContent ?? '').trim(),
      courant: a.getAttribute('aria-current'),
      visible: a.getClientRects().length > 0,
    }))
  );

/**
 * Le dev server hydrate en différé : les premiers clics peuvent tomber
 * avant la pose des gestionnaires. Clic JS (sans déplacer le focus du
 * document) jusqu'à obtention d'une réaction de React.
 */
async function attendreInteractif(p) {
  const d = '#menu-utilisateur-declencheur';
  const c = '#menu-utilisateur';
  for (let i = 1; i <= 40; i += 1) {
    await p.evaluate((sel) => document.querySelector(sel)?.click(), d);
    await pause(120);
    if ((await p.$(c)) !== null) {
      await p.evaluate((sel) => document.querySelector(sel)?.click(), d);
      await pause(120);
      return { clique_utile: i, hydratation_ok: true };
    }
  }
  return { clique_utile: -1, hydratation_ok: false };
}

/** Ouvre un menu à la souris, avec réessai. */
async function ouvrirMenu(p, declencheur, cible) {
  for (let i = 0; i < 6; i += 1) {
    await p.click(declencheur);
    await pause(250);
    if (await p.$(cible)) return true;
  }
  return false;
}

// ------------------------------------------------------------
// 1. BUREAU (1366×900)
// ------------------------------------------------------------
const page = await navigateur.newPage();
await page.evaluateOnNewDocument(() => {
  window.__apparence = 0;
  window.addEventListener('plume:ouvrir-apparence', () => {
    window.__apparence += 1;
  });
});
await page.setViewport({ width: 1366, height: 900 });
await page.setCookie(COOKIE);

const reponse = await page.goto(`${HOST}/bibliotheque`, {
  waitUntil: 'networkidle2',
  timeout: 90_000,
});
await page.waitForSelector('header', { timeout: 30_000 });
rapport.http_bureau = reponse.status();
rapport.hydratation = await attendreInteractif(page);

// --- Inventaire des liens de l'en-tête (bureau) + état actif
const liensBureau = await liensEntete(page);
rapport.bureau_liens = liensBureau.filter((l) => l.visible).map((l) => `${l.texte} → ${l.href}`);
rapport.bureau_actif = liensBureau
  .filter((l) => l.visible && l.courant === 'page')
  .map((l) => `${l.texte} → ${l.href}`);
rapport.bureau_hamburger_cache = await page.$eval(
  'button[aria-controls="menu-mobile"]',
  (b) => b.getClientRects().length === 0
);
await page.screenshot({ path: join(CAPTURES, 'nav-bureau.png') });

// --- PARCOURS CLAVIER (page intacte, départ en tête de document)
rapport.parcours_tab = [];
for (let i = 0; i < 16; i += 1) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(DECRIRE);
  rapport.parcours_tab.push(info);
  if (info.includes('#menu-utilisateur-declencheur')) break;
}
rapport.tab_atteint_declencheur = rapport.parcours_tab.some((s) =>
  s.includes('#menu-utilisateur-declencheur')
);
rapport.tab_nb_pour_declencheur = rapport.parcours_tab.findIndex((s) =>
  s.includes('#menu-utilisateur-declencheur')
);

await page.keyboard.press('Enter');
await pause(200);
rapport.entree_ouvre = await page.$eval('#menu-utilisateur-declencheur', (b) =>
  b.getAttribute('aria-expanded')
);
rapport.focus_apres_entree = await page.evaluate(DECRIRE);

rapport.parcours_fleches = [];
for (const touche of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
  await page.keyboard.press(touche);
  await pause(120);
  rapport.parcours_fleches.push(`${touche} → ${await page.evaluate(DECRIRE)}`);
}
await page.screenshot({ path: join(CAPTURES, 'nav-menu-clavier.png') });

await page.keyboard.press('Escape');
await pause(200);
rapport.echap_ferme =
  (await page.$eval('#menu-utilisateur-declencheur', (b) => b.getAttribute('aria-expanded'))) ===
  'false';
rapport.echap_rend_focus = (await page.evaluate(DECRIRE)).includes('#menu-utilisateur-declencheur');

// --- Menu utilisateur à la souris : inventaire complet
rapport.menu_ouvert = await ouvrirMenu(page, '#menu-utilisateur-declencheur', '#menu-utilisateur');
rapport.menu_entrees = await page.$$eval('#menu-utilisateur [role="menuitem"]', (els) =>
  els.map((e) => ({
    texte: (e.textContent ?? '').trim(),
    href: e.getAttribute('href'),
    type: e.tagName === 'A' ? 'lien' : 'bouton',
    role: e.getAttribute('role'),
    tabindex: e.getAttribute('tabindex'),
  }))
);
rapport.menu_aria = await page.$eval('#menu-utilisateur-declencheur', (b) => ({
  haspopup: b.getAttribute('aria-haspopup'),
  expanded: b.getAttribute('aria-expanded'),
  controls: b.getAttribute('aria-controls'),
}));
rapport.menu_role = await page.$eval('#menu-utilisateur', (m) => ({
  role: m.getAttribute('role'),
  label: m.getAttribute('aria-label'),
}));
await page.screenshot({ path: join(CAPTURES, 'nav-menu-utilisateur.png') });

// --- Contrat d'interface : bouton « Apparence »
await page.$$eval('#menu-utilisateur [role="menuitem"]', (els) => {
  els.find((e) => e.textContent.trim() === 'Apparence')?.click();
});
await pause(250);
rapport.evenement_apparence = await page.evaluate(() => window.__apparence);
rapport.menu_ferme_apres_apparence =
  (await page.$eval('#menu-utilisateur-declencheur', (b) => b.getAttribute('aria-expanded'))) ===
  'false';

// --- Fermeture au clic extérieur (souris réelle hors de l'en-tête)
await ouvrirMenu(page, '#menu-utilisateur-declencheur', '#menu-utilisateur');
await page.mouse.click(20, 420);
await pause(250);
rapport.clic_exterieur_ferme =
  (await page.$eval('#menu-utilisateur-declencheur', (b) => b.getAttribute('aria-expanded'))) ===
  'false';

// --- État actif sur une autre page
await page.goto(`${HOST}/favoris`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector('header', { timeout: 30_000 });
rapport.actif_favoris = (await liensEntete(page))
  .filter((l) => l.visible && l.courant === 'page')
  .map((l) => `${l.texte} → ${l.href}`);

await page.close();

console.log('=== BUREAU ===');
console.log(JSON.stringify(rapport, null, 2));
console.log('=== MOBILE ===');

// ------------------------------------------------------------
// 2. MOBILE (390×844)
// ------------------------------------------------------------
try {
  const mobile = await navigateur.newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobile.setCookie(COOKIE);
  const repMobile = await mobile.goto(`${HOST}/bibliotheque`, {
    waitUntil: 'networkidle2',
    timeout: 90_000,
  });
  await mobile.waitForSelector('header', { timeout: 30_000 });
  await mobile.evaluate(() => document.querySelector('#menu-utilisateur-declencheur')?.click());
  await pause(300);
  await mobile.evaluate(() => document.querySelector('#menu-utilisateur-declencheur')?.click());
  await pause(200);
  rapport.http_mobile = repMobile.status();
  rapport.mobile_declencheur_visible = await mobile.$eval(
    'button[aria-controls="menu-mobile"]',
    (b) => b.getClientRects().length > 0
  );

  rapport.mobile_ouvert = await ouvrirMenu(
    mobile,
    'button[aria-controls="menu-mobile"]',
    '#menu-mobile'
  );
  rapport.mobile_liens = await mobile.$$eval('#menu-mobile a', (els) =>
    els.map((a) => `${(a.textContent ?? '').trim()} → ${a.getAttribute('href')}`)
  );
  rapport.mobile_actions = await mobile.$$eval('#menu-mobile button', (els) =>
    els.map((b) => (b.textContent ?? '').trim())
  );
  rapport.mobile_actif = await mobile.$$eval('#menu-mobile a[aria-current="page"]', (els) =>
    els.map((a) => `${(a.textContent ?? '').trim()} → ${a.getAttribute('href')}`)
  );
  await mobile.keyboard.press('Escape');
  await pause(200);
  rapport.mobile_echap_ferme = (await mobile.$('#menu-mobile')) === null;
  await ouvrirMenu(mobile, 'button[aria-controls="menu-mobile"]', '#menu-mobile');
  await mobile.screenshot({ path: join(CAPTURES, 'nav-mobile.png') });
} catch (e) {
  rapport.erreur_mobile = String(e).slice(0, 300);
}

await navigateur.close();
console.log(JSON.stringify(rapport, null, 2));
