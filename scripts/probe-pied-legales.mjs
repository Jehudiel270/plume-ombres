// ============================================================
// Sonde réelle du pied de page et des pages légales (vague 5).
//
// Prouve par le navigateur (Edge headless + puppeteer-core), et non par le
// regard, que :
//   1. chaque page publique répond en HTTP < 400, AVEC et SANS session ;
//   2. le pied de page est rendu sur chacune ;
//   3. CHAQUE lien du pied de page renvoie un code HTTP < 400.
//
// Session de démo : %TEMP%\shader-demo.json (scripts/probe-session.ts).
// Captures + rapport : %LOCALAPPDATA%\Temp\pied-legales\ (hors du dépôt).
//
// Usage : node scripts/probe-pied-legales.mjs   (dev server sur :3983 requis)
// ============================================================

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:3983';
const CAPTURES = join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'pied-legales');
mkdirSync(CAPTURES, { recursive: true });

const journal = (texte) =>
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${texte}`);

// --- Session de démonstration (cookie Supabase) -----------------------------
const demoChemin = join(tmpdir(), 'shader-demo.json');
let demo;
try {
  demo = JSON.parse(readFileSync(demoChemin, 'utf8'));
} catch {
  console.error(`Session de démo introuvable ou illisible : ${demoChemin} — lancez scripts/probe-session.ts.`);
  process.exitCode = 1;
  throw new Error('session de démo indisponible');
}
const valeurCookie =
  'base64-' +
  Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
const COOKIE_SESSION = {
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: valeurCookie,
  domain: 'localhost',
  path: '/',
};

const PAGES_PUBLIQUES = [
  '/',
  '/tarifs',
  '/faq',
  '/contact',
  '/conditions',
  '/confidentialite',
  '/mentions-legales',
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function ouvrir(browser, avecSession) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  if (avecSession) await page.setCookie(COOKIE_SESSION);
  return page;
}

/** Visite une page, renvoie statut, présence du pied et liens du pied. */
async function visiter(browser, chemin, avecSession) {
  const page = await ouvrir(browser, avecSession);
  let statut = null;
  try {
    const rep = await page.goto(BASE + chemin, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    statut = rep?.status() ?? null;
    await dormir(400);
  } catch (e) {
    await page.close();
    return { chemin, avecSession, statut, piedPresent: false, liens: [], erreur: String(e).slice(0, 160) };
  }
  const piedPresent = (await page.$('footer[aria-label="Pied de page"]')) !== null;
  const liens = piedPresent
    ? await page.$$eval('footer[aria-label="Pied de page"] a', (as) =>
        as.map((a) => a.getAttribute('href')),
      )
    : [];
  await page.close();
  return { chemin, avecSession, statut, piedPresent, liens: [...new Set(liens)] };
}

/** Suit un lien et relève le code HTTP final (< 400 attendu). */
async function suivreLien(browser, href, avecSession) {
  const page = await ouvrir(browser, avecSession);
  let statut = null;
  let finale = null;
  try {
    const rep = await page.goto(BASE + href, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    statut = rep?.status() ?? null;
    finale = page.url().replace(BASE, '') || '/';
  } catch (e) {
    await page.close();
    return { href, avecSession, statut, finale, ok: false, erreur: String(e).slice(0, 160) };
  }
  await page.close();
  return { href, avecSession, statut, finale, ok: statut !== null && statut < 400 };
}

/** Capture le BAS de la page (le pied de page est le sujet). */
async function capturer(browser, chemin, fichier, avecSession = false) {
  const page = await ouvrir(browser, avecSession);
  await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dormir(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await dormir(600);
  const complet = join(CAPTURES, fichier);
  await page.screenshot({ path: complet }); // viewport (bas de page)
  await page.close();
  return complet;
}

async function principal() {
  journal('lancement de Edge headless…');
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
    ],
  });
  journal('Edge prêt.');

  const resultat = { base: BASE, pages: [], liens: [], captures: [], sansSessionLegales: {} };

  // 1. Visite de chaque page publique, sans puis avec session.
  for (const chemin of PAGES_PUBLIQUES) {
    for (const avecSession of [false, true]) {
      const v = await visiter(browser, chemin, avecSession);
      resultat.pages.push(v);
      journal(`page ${chemin} ${avecSession ? '(session)' : '(anonyme)'} → ${v.statut} · pied=${v.piedPresent}`);
    }
  }

  // 2. Tous les liens du pied, dédoublonnés.
  const liens = [...new Set(resultat.pages.filter((p) => p.chemin === '/').flatMap((p) => p.liens))].sort();

  // 3. Chaque lien suivi SANS session (le cas critique : visiteur non connecté).
  for (const href of liens) {
    const r = await suivreLien(browser, href, false);
    resultat.liens.push(r);
    journal(`lien ${href} → ${r.statut} (final: ${r.finale})`);
  }

  // 4. Les trois pages légales revérifiées sans session.
  for (const chemin of ['/conditions', '/confidentialite', '/mentions-legales']) {
    const v = await visiter(browser, chemin, false);
    resultat.sansSessionLegales[chemin] = { statut: v.statut, piedPresent: v.piedPresent };
  }

  // 5. Captures (bas de page).
  resultat.captures.push(await capturer(browser, '/conditions', 'bas-conditions.png'));
  resultat.captures.push(await capturer(browser, '/confidentialite', 'bas-confidentialite.png'));
  resultat.captures.push(await capturer(browser, '/mentions-legales', 'bas-mentions-legales.png'));
  resultat.captures.push(await capturer(browser, '/', 'bas-accueil.png'));
  journal('captures écrites.');

  await browser.close();

  // 6. Verdicts.
  const pagesKo = resultat.pages.filter((p) => !(p.statut !== null && p.statut < 400 && p.piedPresent));
  const liensKo = resultat.liens.filter((l) => !l.ok);
  const legalesKo = Object.entries(resultat.sansSessionLegales).filter(
    ([, v]) => !(v.statut !== null && v.statut < 400 && v.piedPresent),
  );

  resultat.verdict = {
    pagesTestees: resultat.pages.length,
    pagesEnEchec: pagesKo.map((p) => `${p.chemin}${p.avecSession ? ' (session)' : ' (anonyme)'} → ${p.statut}`),
    liensTestes: resultat.liens.length,
    liensEnEchec: liensKo.map((l) => `${l.href} → ${l.statut}`),
    legalesAnonymesEnEchec: legalesKo.map(([c, v]) => `${c} → ${v.statut}`),
    ok: pagesKo.length === 0 && liensKo.length === 0 && legalesKo.length === 0,
  };

  const sortie = join(CAPTURES, 'rapport.json');
  writeFileSync(sortie, JSON.stringify(resultat, null, 2), 'utf8');

  console.log('\n===== RAPPORT =====');
  console.log(JSON.stringify(resultat, null, 2));
  console.log('Rapport :', sortie);
  console.log('Captures :', CAPTURES);
  process.exitCode = resultat.verdict.ok ? 0 : 1;
}

principal().catch((e) => {
  console.error('ÉCHEC SONDE :', e);
  process.exitCode = 2;
});
