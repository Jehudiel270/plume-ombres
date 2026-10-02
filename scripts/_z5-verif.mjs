// JETABLE — vérification du tronc consolidé (vague 4 + vague 5).
// Usage : node scripts/_z5-verif.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = `http://localhost:${process.env.PORT_PROBE || 3991}`;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const PAGES_PUBLIQUES = ['/', '/tarifs', '/faq', '/contact', '/conditions', '/confidentialite', '/mentions-legales'];
const PAGES_PRIVEES = ['/bibliotheque', '/favoris', '/compte', '/admin', '/abonnement'];

const nav = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await nav.newPage();
await page.setViewport({ width: 1366, height: 900 });
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => erreurs.push('PAGEERROR ' + String(e).slice(0, 200)));

// --- 1) Pages publiques, SANS session : code HTTP + pied de page -----
const visiter = async (chemin) => {
  try {
    const rep = await page.goto(HOST + chemin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return rep?.status() ?? null;
  } catch (e) {
    const msg = String(e.message || e);
    return msg.includes('ERR_ABORTED') ? 'abandon (redirection)' : `err: ${msg.slice(0, 60)}`;
  }
};

const publiques = [];
for (const chemin of PAGES_PUBLIQUES) {
  const http = await visiter(chemin);
  await new Promise((r) => setTimeout(r, 350));
  const infos = await page.evaluate(() => ({
    titre: document.title,
    h1: document.querySelector('h1')?.textContent?.trim().slice(0, 70) ?? null,
    liensNav: [...document.querySelectorAll('header a, nav a')].map((a) => a.getAttribute('href')).filter(Boolean).length,
    piedDePage: !!document.querySelector('footer') || !!document.querySelector('[class*="pied"]'),
    boutonApparence: !!document.querySelector('button[title*="Apparence"], [aria-label*="Apparence"]'),
  }));
  publiques.push({ chemin, http, ...infos });
}

// --- 2) Session connectée : navigation + menu utilisateur -----------
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
const privees = [];
for (const chemin of PAGES_PRIVEES) {
  const http = await visiter(chemin);
  await new Promise((r) => setTimeout(r, 400));
  privees.push({
    chemin,
    http,
    urlFinale: page.url().replace(HOST, ''),
    titrePage: await page.title(),
    h1: await page.evaluate(() => document.querySelector('h1')?.textContent?.trim().slice(0, 70) ?? null),
  });
}

// --- 3) Navigation : liens visibles + état actif --------------------
await page.goto(HOST + '/bibliotheque', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 700));
const navigation = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Navigation principale"]');
  const liens = [...(nav?.querySelectorAll('a') ?? [])].map((a) => ({
    libelle: a.textContent.trim(),
    href: a.getAttribute('href'),
    actif: a.getAttribute('aria-current'),
  }));
  const decl = document.querySelector('[aria-haspopup="menu"]');
  return {
    liens,
    declencheurMenu: !!decl,
    aria: decl ? { expanded: decl.getAttribute('aria-expanded'), label: decl.getAttribute('aria-label') } : null,
  };
});
// Ouverture du menu utilisateur
await page.evaluate(() => document.querySelector('[aria-haspopup="menu"]')?.click());
await new Promise((r) => setTimeout(r, 400));
const menuUtilisateur = await page.evaluate(() => {
  const p = document.querySelector('[role="menu"]');
  return {
    ouvert: !!p,
    entrees: [...(p?.querySelectorAll('[role="menuitem"]') ?? [])].map((e) => e.textContent.trim()),
  };
});
const captureMenu = join(tmpdir(), '_z5_menu.png');
await page.screenshot({ path: captureMenu });
// Apparence : l'entrée du menu publie l'événement, le panneau doit s'ouvrir
const apparenceAvant = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((e) => /apparence/i.test(e.textContent));
  b?.click();
});
await new Promise((r) => setTimeout(r, 600));
const apparenceApres = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const r = d?.getBoundingClientRect();
  return {
    ouvert: !!d,
    visible: r ? r.top >= -1 && r.top < window.innerHeight && r.width > 150 : false,
    nbPalettes: d?.querySelectorAll('input[name="palette-plume"]').length ?? 0,
    nbTypographies: d?.querySelectorAll('input[name="typo-plume"]').length ?? 0,
  };
});
const captureApparence = join(tmpdir(), '_z5_apparence.png');
await page.screenshot({ path: captureApparence });

// Changement de palette réel : on clique la 2e palette et on relit <html data-palette>
const basculePalette = await page.evaluate(async () => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { erreur: 'panneau ferme' };
  const avant = document.documentElement.dataset.palette;
  const boutons = [...(d?.querySelectorAll('button') ?? [])].filter((b) => b.getAttribute('aria-pressed') !== null || b.getAttribute('role') === 'radio');
  for (const b of boutons) {
    b.click();
    await new Promise((r) => setTimeout(r, 250));
    if (document.documentElement.dataset.palette !== avant) {
      return { avant, apres: document.documentElement.dataset.palette, libelle: b.textContent.trim().slice(0, 30) };
    }
  }
  return { avant, apres: document.documentElement.dataset.palette, libelle: null };
});

// --- 4) Mobile : barre + menu --------------------------------------
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(HOST + '/bibliotheque', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 800));
const mobile = await page.evaluate(() => {
  const burger = document.querySelector('[aria-controls="menu-mobile"]');
  return { burger: !!burger, lienDesktopVisible: !!document.querySelector('nav[aria-label="Navigation principale"]')?.getBoundingClientRect().width };
});
await page.evaluate(() => document.querySelector('[aria-controls="menu-mobile"]')?.click());
await new Promise((r) => setTimeout(r, 400));
const mobileOuvert = await page.evaluate(() => {
  const n = document.querySelector('#menu-mobile');
  return { ouvert: !!n, liens: [...(n?.querySelectorAll('a') ?? [])].map((a) => a.textContent.trim()).slice(0, 10) };
});
const captureMobile = join(tmpdir(), '_z5_mobile.png');
await page.screenshot({ path: captureMobile });

const sortie = {
  publiques,
  privees,
  navigation,
  menuUtilisateur,
  apparence: { avant: apparenceAvant, apres: apparenceApres, basculePalette },
  mobile: { ...mobile, ...mobileOuvert },
  captures: { captureMenu, captureApparence, captureMobile },
  erreurs_console: [...new Set(erreurs)].slice(0, 12),
};
writeFileSync(join(tmpdir(), '_z5_verif.json'), JSON.stringify(sortie, null, 2));
console.log(JSON.stringify(sortie, null, 2));
await nav.close();
