// ============================================================
// probe-profil-compte.mjs — Preuve navigateur RÉELLE du profil (/compte).
//
//   node scripts/probe-profil-compte.mjs [http://localhost:3986]
//
// Vérifie, dans Edge headless, session Supabase réelle posée par cookie :
//   1. /compte s'ouvre (200) et rend le profil (identité, apparence, favoris,
//      déconnexion, suppression) ;
//   2. le pseudo se modifie vraiment → RELECTURE directe en base (pg) ;
//   3. le bouton d'apparence émet `plume:ouvrir-apparence` (contrat) ;
//   4. la déconnexion referme la session et renvoie vers /connexion ;
//   5. la suppression de compte aboutit sur un compte JETABLE et la ligne
//      auth.users disparaît (relue en base).
// Captures 1366 px et 390 px + parcours clavier (Tab).
// ============================================================

import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { Client as ClientPg } from 'pg';
import { createClient } from '@supabase/supabase-js';

const BASE = process.argv[2] || 'http://localhost:3986';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const REF = 'imbziizequckeaxuotdz';
const COOKIE = `sb-${REF}-auth-token`;
const SORTIE = join(
  process.env.LOCALAPPDATA || tmpdir(),
  'Temp',
  'plume-profil'
);
mkdirSync(SORTIE, { recursive: true });

const lignesEnv = readFileSync('.env.local', 'utf8').split('\n');
const valeurEnv = (clef) => {
  const l = lignesEnv.find((x) => x.trim().startsWith(`${clef}=`));
  if (!l) throw new Error(`Clé ${clef} absente de .env.local`);
  return l.split('=').slice(1).join('=').trim();
};
const ANON = valeurEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const URL_SUPABASE = 'https://imbziizequckeaxuotdz.supabase.co';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// En dev, l'hydratation React arrive plusieurs secondes APRÈS le chargement
// réseau (bundle webpack volumineux) : sans cette attente, les clics tombent
// sur du HTML serveur inerte.
async function attendreHydratation(page, selecteur) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith('__react'));
    },
    { timeout: 45_000, polling: 250 },
    selecteur
  );
}

function valeurCookie(session) {
  return (
    'base64-' +
    Buffer.from(JSON.stringify(session), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  );
}

function ouvrirPg() {
  return new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${REF}`,
    password: valeurEnv('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
}

const resultats = {};
let navigateur;

async function main() {
  const demo = JSON.parse(
    readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8')
  );
  const sessionDemo = demo.session.session ?? demo.session;
  const uidDemo = demo.session.user?.id ?? sessionDemo.user?.id;

  const pg = ouvrirPg();
  await pg.connect();

  navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check'],
    defaultViewport: { width: 1366, height: 900, deviceScaleFactor: 1 },
  });

  // ---------------------------------------------------------------
  // 1. /compte avec session : rendu + captures
  // ---------------------------------------------------------------
  const page = await navigateur.newPage();
  const erreursConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreursConsole.push(m.text());
  });
  page.on('pageerror', (e) => erreursConsole.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.setCookie({
    name: COOKIE,
    value: valeurCookie(sessionDemo),
    domain: 'localhost',
    path: '/',
  });

  const reponse = await page.goto(`${BASE}/compte`, {
    waitUntil: 'networkidle2',
    timeout: 60_000,
  });
  resultats.httpCompte = reponse.status();
  await pause(1200);
  await attendreHydratation(page, '#profil-pseudo');

  const rendu = await page.evaluate(() => {
    const texte = document.body.innerText;
    return {
      titre: document.title,
      url: location.pathname,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      sections: Array.from(document.querySelectorAll('section[aria-label]')).map(
        (s) => s.getAttribute('aria-label')
      ),
      contientSuppression: texte.includes('Suppression définitive du compte'),
      contientApparence: texte.includes("Ouvrir les réglages d’apparence"),
      contientDeconnexion: texte.includes('Se déconnecter'),
    };
  });
  resultats.rendu = rendu;

  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  const cap1366 = join(SORTIE, 'profil-1366.png');
  await page.screenshot({ path: cap1366, fullPage: true });
  resultats.capture1366 = cap1366;

  // ---------------------------------------------------------------
  // 2. Écriture du pseudo + relecture EN BASE
  // ---------------------------------------------------------------
  const pseudoAvant = await page.$eval('#profil-pseudo', (el) => el.value);
  const { rows: avant } = await pg.query(
    'select pseudo from public.profiles where id = $1',
    [uidDemo]
  );
  resultats.pseudoAvant = { ui: pseudoAvant, base: avant[0]?.pseudo ?? null };

  const nouveau = 'Plume Nocturne';
  await page.click('#profil-pseudo');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.type(nouveau, { delay: 25 });
  await pause(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent.trim().startsWith('Enregistrer')
    );
    b.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('Pseudo enregistré'),
    { timeout: 15_000 }
  );
  const statutUi = await page.evaluate(() => {
    const p = document.querySelector('[role="status"]');
    return p ? p.innerText.trim() : null;
  });
  const { rows: apres } = await pg.query(
    'select pseudo from public.profiles where id = $1',
    [uidDemo]
  );
  resultats.pseudoApres = { ui: statutUi, base: apres[0]?.pseudo ?? null };

  // On restaure la valeur d'origine (état partagé avec les autres sondes).
  await page.click('#profil-pseudo');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.type(pseudoAvant, { delay: 25 });
  await pause(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent.trim().startsWith('Enregistrer')
    );
    b.click();
  });
  await pause(2500);
  const { rows: restaure } = await pg.query(
    'select pseudo from public.profiles where id = $1',
    [uidDemo]
  );
  resultats.pseudoRestaure = restaure[0]?.pseudo ?? null;

  // ---------------------------------------------------------------
  // 3. Contrat d'apparence : événement `plume:ouvrir-apparence`
  // ---------------------------------------------------------------
  await page.evaluate(() => {
    window.__plumeApparence = 0;
    window.addEventListener('plume:ouvrir-apparence', () => {
      window.__plumeApparence = (window.__plumeApparence || 0) + 1;
    });
  });
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent.includes('Ouvrir les réglages')
    );
    b.click();
  });
  await pause(500);
  resultats.apparenceEvenement = await page.evaluate(
    () => window.__plumeApparence
  );

  // ---------------------------------------------------------------
  // 4. Parcours clavier + Échap sur la confirmation de suppression
  // ---------------------------------------------------------------
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  });
  const parcours = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return null;
      return {
        tag: a.tagName.toLowerCase(),
        id: a.id || null,
        texte: (a.textContent || '').trim().slice(0, 34),
        aria: a.getAttribute('aria-label'),
      };
    });
    if (d) parcours.push(d);
  }
  resultats.clavier = parcours.map((p) => `${p.tag}${p.id ? '#' + p.id : ''}«${p.texte}»`);

  // Échap referme la confirmation sans rien supprimer.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => x.textContent.trim() === 'Supprimer mon compte'
    );
    b.click();
  });
  await pause(300);
  const focusConfirmation = await page.evaluate(
    () => document.activeElement?.id ?? null
  );
  await page.keyboard.press('Escape');
  await pause(300);
  const referme = await page.evaluate(
    () => !document.getElementById('suppression-confirmation')
  );
  resultats.confirmation = { focusInitial: focusConfirmation, escReferme: referme };

  // ---------------------------------------------------------------
  // 5. Mobile 390 px
  // ---------------------------------------------------------------
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/compte`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await attendreHydratation(page, '#profil-pseudo');
  await pause(700);
  const cap390 = join(SORTIE, 'profil-390.png');
  await page.screenshot({ path: cap390, fullPage: true });
  resultats.capture390 = cap390;
  resultats.debordement390 = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );

  // ---------------------------------------------------------------
  // 6. Compte JETABLE : déconnexion, puis suppression définitive.
  //    (La session de démo n'est jamais déconnectée : un signOut
  //     global révoquerait son jeton pour les autres sondes.)
  // ---------------------------------------------------------------
  const suffixe = Date.now();
  const emailJetable = `profil-test-${suffixe}@plume-ombres.local`;
  const mdpJetable = 'PlumeProfil.2026!';
  const client = createClient(URL_SUPABASE, ANON);

  const inscription = await client.auth.signUp({
    email: emailJetable,
    password: mdpJetable,
    options: { data: { pseudo: 'Compte jetable' } },
  });
  let sessionJetable = inscription.data?.session ?? null;
  if (!sessionJetable) {
    // Confirmation d'e-mail activée : on valide le compte via la base,
    // puis on ouvre une session par mot de passe.
    await pg.query(
      'update auth.users set email_confirmed_at = now() where email = $1',
      [emailJetable]
    );
    const co = await client.auth.signInWithPassword({
      email: emailJetable,
      password: mdpJetable,
    });
    sessionJetable = co.data?.session ?? null;
  }
  if (!sessionJetable) throw new Error('Session jetable introuvable.');

  const { rows: cree } = await pg.query(
    'select count(*)::int as n from auth.users where email = $1',
    [emailJetable]
  );
  resultats.jetableCree = cree[0].n;

  async function ouvrirCompteJetable(session) {
    const p = await navigateur.newPage();
    await p.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await p.setCookie({
      name: COOKIE,
      value: valeurCookie(session),
      domain: 'localhost',
      path: '/',
    });
    const rep = await p.goto(`${BASE}/compte`, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });
    await attendreHydratation(p, '#profil-pseudo');
    return { page: p, statut: rep.status() };
  }

  const jetableDeco = await ouvrirCompteJetable(sessionJetable);
  resultats.httpCompteJetable = jetableDeco.statut;
  await jetableDeco.page.screenshot({
    path: join(SORTIE, 'suppression-avant.png'),
  });
  await jetableDeco.page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => x.textContent.trim() === 'Se déconnecter'
    );
    b.click();
  });
  await jetableDeco.page.waitForFunction(
    () => location.pathname === '/connexion',
    { timeout: 20_000 }
  );
  resultats.deconnexion = await jetableDeco.page.evaluate(() => ({
    url: location.pathname,
    titre: document.title,
  }));
  const capDeco = join(SORTIE, 'deconnexion-connexion.png');
  await jetableDeco.page.screenshot({ path: capDeco });
  resultats.captureDeconnexion = capDeco;

  // ---------------------------------------------------------------
  // 7. Suppression de compte via l'interface, puis relecture en base
  // ---------------------------------------------------------------
  // Le signOut global a révoqué les jetons : on rouvre une session avec
  // le mot de passe (inchangé).
  const reconnexion = await client.auth.signInWithPassword({
    email: emailJetable,
    password: mdpJetable,
  });
  const sessionSuppression = reconnexion.data?.session ?? null;
  if (!sessionSuppression)
    throw new Error('Reconnexion du compte jetable impossible.');

  const jetableSupp = await ouvrirCompteJetable(sessionSuppression);
  resultats.httpCompteSuppression = jetableSupp.statut;
  const pageJetable = jetableSupp.page;

  await pageJetable.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => x.textContent.trim() === 'Supprimer mon compte'
    );
    b.click();
  });
  await pause(400);
  await pageJetable.type('#suppression-confirmation', 'SUPPRIMER', { delay: 30 });
  await pause(300);
  await pageJetable.screenshot({
    path: join(SORTIE, 'suppression-confirmation.png'),
  });
  await pageJetable.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      x.textContent.includes('Confirmer la suppression définitive')
    );
    b.click();
  });
  await pageJetable.waitForFunction(() => location.pathname === '/', {
    timeout: 25_000,
  });
  await pause(1500);
  resultats.suppressionUrlFinale = await pageJetable.evaluate(
    () => location.pathname
  );
  const { rows: detruit } = await pg.query(
    'select count(*)::int as n from auth.users where email = $1',
    [emailJetable]
  );
  resultats.jetableApresSuppression = detruit[0].n;
  await pageJetable.screenshot({ path: join(SORTIE, 'suppression-apres.png') });

  resultats.erreursConsole = erreursConsole;
  await pg.end();
  await navigateur.close();

  console.log(JSON.stringify(resultats, null, 2));
}

main().catch(async (e) => {
  console.error('ÉCHEC SONDE :', e);
  if (navigateur) await navigateur.close().catch(() => undefined);
  process.exit(1);
});
