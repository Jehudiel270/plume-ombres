#!/usr/bin/env node
// ============================================================
// probe-sante.mjs — Preuve navigateur RÉELLE (Edge headless +
// puppeteer-core) de la supervision (P1.6) et de la sauvegarde.
//
// La connexion passe par le VRAI formulaire /connexion (cookies de
// session posés par le client navigateur) : c'est la preuve la plus
// fidèle, aucune session forgée.
//
// MESURES (rien d'estimé) :
//   1. /admin/sante rendue pour un ADMIN : capture + libellés
//      réellement présents dans le DOM ;
//   2. refus PROPRE d'un utilisateur NON-admin : redirection vers
//      /bibliotheque?refus=admin.stats.voir (capture) ;
//   3. refus d'un visiteur anonyme : redirection vers /connexion ;
//   4. /api/sante : corps JSON exact, HTTP 200, aucun secret ;
//   5. CONFIDENTIALITÉ : une PHRASE RÉELLE lue en base n'apparaît
//      NI dans le HTML de /admin/sante NI dans /api/sante ;
//   6. un vrai appel /api/translate (cookies) journalise un
//      événement moteur, visible ensuite sur la page ;
//   7. capture du rapport de sauvegarde/restauration exécuté.
//
// Usage : node scripts/probe-sante.mjs   (serveur dev sur :3994)
// Prérequis : node scripts/preparer-comptes-sante.mjs
// ============================================================

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import pg from 'pg';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = process.env.PLUME_HOST || 'http://localhost:3994';
const MDP = process.env.PLUME_MDP_TEST || 'PlumeSante.2026!';
const OUT = 'preuves';
const RAPPORT = join(OUT, 'probe-sante-rapport.json');

mkdirSync(OUT, { recursive: true });

const env = (c) => {
  const l = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((x) => x.trim().startsWith(c + '='));
  return l ? l.split('=').slice(1).join('=').trim() : null;
};
const comptes = JSON.parse(readFileSync(join(tmpdir(), 'sante-comptes.json'), 'utf8'));

const resultats = {};
const verifier = (nom, condition, detail = '') => {
  resultats[nom] = { ok: !!condition, detail };
  console.log(`${condition ? '✓' : '✗'} ${nom}${detail ? ` — ${detail}` : ''}`);
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Phrase réelle à ne jamais voir fuiter (lue directement en base).
async function extraitReel() {
  const c = new pg.Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: env('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    `select substring(source from 1 for 60) as extrait
       from public.segments
      where length(source) > 200 and position(' ' in source) between 5 and 30
      order by length(source) desc limit 1`
  );
  await c.end();
  return String(r.rows[0].extrait).trim();
}

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  defaultViewport: { width: 1366, height: 950, deviceScaleFactor: 1 },
});

async function nouvellePage() {
  const page = await navigateur.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(60000);
  return page;
}

/** Connexion par le VRAI formulaire (cookies posés par le navigateur),
 *  dans un CONTEXTE ISOLÉ (cookies propres à l'utilisateur).
 *  Jusqu'à 3 tentatives : un clic AVANT l'hydratation React déclenche
 *  une soumission native (aucune session) — on retente alors. */
async function connexion(email) {
  const contexte = await navigateur.createBrowserContext();
  const page = await contexte.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(60000);

  for (let essai = 1; essai <= 3; essai++) {
    await page.goto(`${HOST}/connexion`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type=email]');
    // Attend l'hydratation Next (window.next) avant d'interagir.
    await page
      .waitForFunction(() => Boolean(/** @type {any} */ (window).next), { timeout: 30000 })
      .catch(() => undefined);
    await pause(700);
    await page.type('input[type=email]', email);
    await page.type('input[type=password]', MDP);
    await page.click('button[type=submit]');
    await page
      .waitForFunction(() => location.pathname !== '/connexion', { timeout: 15000 })
      .catch(() => undefined);
    if (!page.url().includes('/connexion')) return page;
    console.log(`  · connexion ${email} : essai ${essai} sans session, nouvelle tentative`);
    await pause(1200);
  }
  return page;
}

/** Contexte isolé SANS session (visiteur anonyme). */
async function pageAnonyme() {
  const contexte = await navigateur.createBrowserContext();
  const page = await contexte.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(60000);
  return page;
}

const normaliser = (s) => s.toLowerCase().replace(/[\u2019\u02bc]/g, "'");

/** Attend que la route quitte /admin/sante (redirection de garde). */
async function attendreRedirection(page) {
  await page
    .waitForFunction(() => location.pathname !== '/admin/sante', { timeout: 20000 })
    .catch(() => undefined);
}

try {
  const phrase = await extraitReel();
  resultats.phrase_reelle_longueur = phrase.length;

  // ---------- 1. Admin (formulaire réel) ----------
  const pageAdmin = await connexion(comptes.admin.email);
  await pageAdmin.goto(`${HOST}/admin/sante`, { waitUntil: 'networkidle2' });
  await pageAdmin.waitForSelector('h1', { timeout: 60000 }).catch(() => undefined);
  await pause(700);
  const urlAdmin = pageAdmin.url();
  const texteAdmin = await pageAdmin.evaluate(() => document.body.innerText);
  const htmlAdmin = await pageAdmin.content();
  await pageAdmin.screenshot({ path: join(OUT, 'sante-admin.png'), fullPage: true });

  verifier('1. /admin/sante servi à l’admin', urlAdmin.includes('/admin/sante'), urlAdmin);
  verifier(
    '1. Titre « Santé du studio » présent',
    normaliser(texteAdmin).includes(normaliser('Santé du studio'))
  );
  for (const libelle of [
    'Traductions en cours',
    'Traductions terminées',
    'Traductions en erreur',
    'Temps moyen / chapitre',
    'Temps moyen / livre',
    'Taille moyenne / chapitre',
    'Taux d’échec par fournisseur',
    'Caractères consommés ce mois',
    'Derniers événements d’erreur',
    'État machine',
  ]) {
    verifier(
      `1. Section « ${libelle} » présente`,
      normaliser(texteAdmin).includes(normaliser(libelle))
    );
  }
  resultats.texte_admin_apercu = texteAdmin.slice(0, 400);

  // ---------- 5. Confidentialité (HTML réel) ----------
  verifier(
    '5. La phrase réelle est ABSENTE du HTML admin',
    !htmlAdmin.includes(phrase),
    // La phrase n'est JAMAIS recopiée dans la preuve : sa taille suffit.
    `${phrase.length} caractères testés (contenu non consigné)`
  );

  // ---------- 6. Événement de traduction réel (cookies) ----------
  const pageLecteur = await connexion(comptes.lecteur.email);
  const appel = await pageLecteur.evaluate(async () => {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texte: 'The night is dark and full of terrors.',
        source: 'en',
        cible: 'fr',
      }),
    });
    let corps = null;
    try {
      corps = await r.json();
    } catch {
      /* corps illisible */
    }
    return { status: r.status, corps };
  });
  resultats.traduction = {
    statut_http: appel.status,
    fournisseur: appel.corps?.fournisseur ?? null,
  };
  verifier(
    '6. Appel /api/translate exécuté (journal alimenté)',
    appel.status === 200 || appel.status === 502,
    `HTTP ${appel.status}, moteur=${appel.corps?.fournisseur ?? '—'}`
  );

  // Recharge admin : le tableau des moteurs doit refléter l'événement.
  await pageAdmin.reload({ waitUntil: 'networkidle2' });
  await pause(600);
  const texteApres = await pageAdmin.evaluate(() => document.body.innerText);
  verifier(
    '6. Un moteur apparaît dans « Taux d’échec par fournisseur »',
    /google|libretranslate|gemini|mymemory/.test(normaliser(texteApres))
  );
  await pageAdmin.screenshot({
    path: join(OUT, 'sante-admin-apres-traduction.png'),
    fullPage: true,
  });

  // ---------- 2. Non-admin : refus propre ----------
  await pageLecteur.goto(`${HOST}/admin/sante`, { waitUntil: 'networkidle2' });
  await attendreRedirection(pageLecteur);
  await pageLecteur
    .waitForFunction(() => !/La nuit s’ouvre|La nuit s'ouvre/.test(document.body.innerText), {
      timeout: 15000,
    })
    .catch(() => undefined);
  await pause(600);
  const urlLecteur = pageLecteur.url();
  const texteLecteur = await pageLecteur.evaluate(() => document.body.innerText);
  await pageLecteur.screenshot({ path: join(OUT, 'sante-refus-lecteur.png'), fullPage: true });
  verifier(
    '2. Non-admin redirigé vers /bibliotheque?refus=admin.stats.voir',
    urlLecteur.includes('/bibliotheque') && urlLecteur.includes('refus=admin.stats.voir'),
    urlLecteur
  );
  verifier(
    '2. Le contenu de supervision est INVISIBLE au non-admin',
    !normaliser(texteLecteur).includes(normaliser('Taux d’échec par fournisseur'))
  );

  // ---------- 3. Anonyme ----------
  const pageAnon = await pageAnonyme();
  await pageAnon.goto(`${HOST}/admin/sante`, { waitUntil: 'networkidle2' });
  await attendreRedirection(pageAnon);
  await pause(400);
  const urlAnon = pageAnon.url();
  await pageAnon.screenshot({ path: join(OUT, 'sante-refus-anonyme.png'), fullPage: true });
  verifier('3. Anonyme redirigé vers /connexion', urlAnon.includes('/connexion'), urlAnon);

  // ---------- 4. /api/sante ----------
  const reponse = await fetch(`${HOST}/api/sante`);
  const corps = await reponse.json();
  verifier('4. /api/sante répond 200', reponse.status === 200, `HTTP ${reponse.status}`);
  verifier(
    '4. Corps machine complet',
    corps.version === 1 &&
      typeof corps.base?.joignable === 'boolean' &&
      typeof corps.file?.en_retard === 'boolean' &&
      typeof corps.erreurs?.recentes_24h === 'number' &&
      typeof corps.alerte === 'boolean',
    JSON.stringify(corps)
  );
  verifier('4. La phrase réelle est ABSENTE de /api/sante', !JSON.stringify(corps).includes(phrase));
  verifier(
    '4. Aucun secret dans /api/sante',
    !/service_role|password|secret|api[_-]?key/i.test(JSON.stringify(corps))
  );
  resultats.api_sante = corps;

  // ---------- 7. Sauvegarde/vérification exécutées ----------
  try {
    const rapport = JSON.parse(readFileSync(join(OUT, 'sauvegarde-rapport.json'), 'utf8'));
    const html = `<!doctype html><meta charset="utf-8"><body style="font:13px monospace;background:#111;color:#eee;padding:24px">
      <h2 style="color:#e8b4b8">P1.7 — Sauvegarde / restauration exécutées</h2>
      <pre>${JSON.stringify(rapport, null, 2).replace(/</g, '&lt;')}</pre>
      <h3 style="color:#e8b4b8">Commandes exactes</h3>
      <pre>node scripts/sauvegarde-db.mjs sauvegarde
node scripts/sauvegarde-db.mjs restauration-test ${(rapport.fichier || '<fichier.sql>').replace(/\\/g, '/')}</pre>
    </body>`;
    const fichierHtml = join(OUT, '_sauvegarde-execution.html');
    writeFileSync(fichierHtml, html);
    const pageSauv = await nouvellePage();
    await pageSauv.goto(
      'file://' + process.cwd().replace(/\\/g, '/') + '/' + fichierHtml,
      { waitUntil: 'domcontentloaded' }
    );
    await pageSauv.screenshot({ path: join(OUT, 'sauvegarde-execution.png'), fullPage: true });
    verifier(
      '7. Rapport de sauvegarde présent',
      rapport.total_lignes > 0,
      `${rapport.total_lignes} lignes, ${(rapport.taille_octets / 1048576).toFixed(2)} Mo`
    );
    if (rapport.derniere_restauration) {
      verifier(
        '7. Restauration vérifiée (empreintes identiques)',
        rapport.derniere_restauration.identique === true,
        `${Object.keys(rapport.derniere_restauration.tables || {}).length} tables`
      );
    }
  } catch (e) {
    verifier('7. Rapport de sauvegarde présent', false, e.message);
  }
} finally {
  await navigateur.close();
}

const echecs = Object.values(resultats).filter((r) => r && r.ok === false).length;
writeFileSync(
  RAPPORT,
  JSON.stringify({ quand: new Date().toISOString(), echecs, resultats }, null, 2)
);
console.log(
  `\n${echecs === 0 ? '✓ Toutes les vérifications passent' : `✗ ${echecs} vérification(s) en échec`} — rapport : ${RAPPORT}`
);
if (echecs > 0) process.exit(1);
