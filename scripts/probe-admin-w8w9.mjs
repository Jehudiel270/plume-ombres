// ============================================================
// scripts/probe-admin-w8w9.mjs — Preuve navigateur RÉELLE du panneau
// d'administration (vague W8/W9).
//
//   node scripts/probe-admin-w8w9.mjs
//
// Ce que fait la sonde :
//   1. crée un COMPTE ADMINISTRATEUR JETABLE (signup anon + rôle admin
//      posé en base) et des DONNÉES TÉMOINS (paiements, crédits,
//      abonnement expiré non résilié) — nettoyées en fin de course ;
//   2. ouvre /admin aux largeurs 360 / 768 / 1440 px : capture, contrôle
//      du débordement horizontal, des cibles ≥ 44 px, du focus visible
//      et de la hiérarchie de titres ;
//   3. exerce les NOUVELLES fonctionnalités : recherche, filtre,
//      pagination, confirmation d'action destructrice, exports CSV
//      (authentifié) et refus de l'export sans session ;
//   4. vérifie prefers-reduced-motion: reduce.
//
// Sortie : un JSON de preuve + des PNG dans le dossier de captures.
// ============================================================

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { Client as ClientPg } from 'pg';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = (process.env.BASE_URL ?? 'http://localhost:3951').replace(/\/$/, '');
const DOSSIER = process.env.PROBE_OUT ?? join(tmpdir(), 'preuves-admin');
mkdirSync(DOSSIER, { recursive: true });

// ---------- environnement ----------
const LIGNES = readFileSync('.env.local', 'utf8').split('\n');
const env = (k) => {
  const l = LIGNES.find((x) => x.trim().startsWith(`${k}=`));
  if (!l) throw new Error(`clé ${k} absente de .env.local`);
  return l.split('=').slice(1).join('=').trim();
};
const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REF_PROJET = new URL(SUPA_URL).host.split('.')[0];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * En dev, l'hydratation React arrive APRÈS le chargement réseau : sans
 * cette attente, les clics/de saisies tombent sur du HTML serveur inerte.
 */
async function attendreHydratation(page, selecteur) {
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && Object.keys(el).some((k) => k.startsWith('__react'));
      },
      { timeout: 90_000, polling: 250 },
      selecteur
    );
  } catch {
    // En dev, la compilation à froid peut dépasser l'attente : on laisse
    // une marge supplémentaire plutôt que d'abandonner toute la sonde.
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
const norm = (s) => (s ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Active l'onglet d'index `index` (0-based) de la barre ARIA et renvoie
 * son libellé une fois `aria-selected="true"` confirmé, sinon null.
 *
 * Un seul panneau est monté à la fois : les étapes interactives doivent
 * donc activer l'onglet « Comptes » AVANT de viser ses champs.
 * Le clic est REJOUÉ tant que l'hydratation tardive de `next dev` n'a pas
 * accroché le gestionnaire : sans cela, le premier clic sur du HTML
 * serveur inerte ne ferait rien.
 */
async function activerOnglet(page, index) {
  for (let essai = 0; essai < 10; essai += 1) {
    const etat = await page.evaluate((i) => {
      const onglets = [...document.querySelectorAll('[role="tab"]')];
      if (onglets.length <= i) return { present: false, actif: false, nb: onglets.length };
      const cible = onglets[i];
      const actif = cible.getAttribute('aria-selected') === 'true';
      if (!actif) cible.click();
      return {
        present: true,
        actif,
        libelle: (cible.innerText || '').replace(/\s+/g, ' ').trim(),
        nb: onglets.length,
      };
    }, index);
    if (etat.actif) return etat.libelle ?? '';
    await pause(500);
  }
  return null;
}

const journal = [];
function etape(nom, ok, details = {}) {
  journal.push({ nom, ok, details });
  console.log(`${ok ? 'OK ' : 'KO '} ${nom}`);
  if (Object.keys(details).length) console.log('   ' + JSON.stringify(details));
}

function ouvrirPg() {
  return new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${REF_PROJET}`,
    password: env('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

/** Session Supabase via signup anon, au format cookie @supabase/ssr. */
async function creerSession(email, motDePasse) {
  const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  const corps = await r.json();
  if (!corps.access_token) throw new Error('signup sans session : ' + JSON.stringify(corps));
  const session = {
    access_token: corps.access_token,
    token_type: 'bearer',
    expires_in: corps.expires_in ?? 3600,
    expires_at: corps.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: corps.refresh_token,
    user: corps.user,
  };
  const valeur =
    'base64-' +
    Buffer.from(JSON.stringify(session), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return { valeur, uid: corps.user.id };
}

// ------------------------------------------------------------
// Mesures navigateur
// ------------------------------------------------------------
const MESURE_TARGETS = `(() => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const enLigne = el.tagName === 'A' && cs.display === 'inline';
    out.push({
      tag: el.tagName.toLowerCase(),
      texte: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0, 42),
      largeur: Math.round(r.width), hauteur: Math.round(r.height),
      exige44: !enLigne,
      dansMain: el.closest('main') !== null,
    });
  }
  return out;
})()`;

const MESURE_DEBORDEMENT = `(() => {
  const vw = document.documentElement.clientWidth;
  const dansScrollH = (el) => {
    let p = el.parentElement;
    while (p) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const coupables = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (dansScrollH(el)) continue;
      coupables.push({
        tag: el.tagName.toLowerCase(),
        classe: (el.className || '').toString().slice(0, 60),
        gauche: Math.round(r.left), droite: Math.round(r.right),
      });
    }
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: vw,
    deborde: document.documentElement.scrollWidth > vw + 1,
    coupables: coupables.slice(0, 8),
  };
})()`;

const MESURE_TITRES = `(() => {
  const titres = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => ({
    niveau: Number(h.tagName[1]), texte: (h.innerText || '').trim().slice(0, 60),
  }));
  let saut = false;
  for (let i = 1; i < titres.length; i += 1) {
    if (titres[i].niveau - titres[i - 1].niveau > 1) saut = true;
  }
  return { h1: titres.filter((t) => t.niveau === 1).length, titres, sautDeNiveau: saut };
})()`;

const MESURE_FOCUS = `(async () => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    // Un contrôle DÉSACTIVÉ n'est pas focusable : hors périmètre du contrôle.
    if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') continue;
    el.focus();
    const f = getComputedStyle(el);
    const indicateur = (f.outlineStyle !== 'none' && parseFloat(f.outlineWidth) > 0) || (f.boxShadow && f.boxShadow !== 'none');
    out.push({
      tag: el.tagName.toLowerCase(),
      texte: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0, 42),
      indicateur, focusable: document.activeElement === el,
    });
    el.blur();
  }
  return out;
})()`;

// ============================================================
// Exécution
// ============================================================
const pg = ouvrirPg();
await pg.connect();

const marque = Date.now().toString(36);
const EMAIL_ADMIN = `probe-admin-${marque}@plume-ombres.invalid`;
const MDP = `Probe-${randomUUID().slice(0, 8)}-Aa1!`;
const EMAIL_TEMOIN = `probe-temoin-${marque}@plume-ombres.invalid`;

let navigateur;
const resultats = { largeurs: {}, fonctionnalites: {}, api: {} };

try {
  // ---------- 1. Comptes jetables ----------
  // Supabase crée le compte auth via signup ; le PROFIL applicatif est
  // créé ici (le trigger d'inscription ne pose que l'essai d'abonnement).
  const admin = await creerSession(EMAIL_ADMIN, MDP);
  const temoin = await creerSession(EMAIL_TEMOIN, MDP);
  await pg.query(
    `insert into public.profiles (id, pseudo, role) values ($1, 'Admin Sonde', 'admin')
     on conflict (id) do update set role = 'admin', pseudo = 'Admin Sonde'`,
    [admin.uid]
  );
  await pg.query(
    `insert into public.profiles (id, pseudo, role) values ($1, 'Témoin Anomalie', 'utilisateur')
     on conflict (id) do update set role = 'utilisateur', pseudo = 'Témoin Anomalie'`,
    [temoin.uid]
  );
  etape('comptes jetables créés (admin + témoin)', true, {
    admin: admin.uid,
    temoin: temoin.uid,
    roleAdmin: (await pg.query(`select role from public.profiles where id=$1`, [admin.uid])).rows[0].role,
  });

  // ---------- 2. Données témoins (nettoyées plus bas) ----------
  await pg.query(
    `insert into public.abonnements (proprietaire_id, plan, statut, periode_debut, periode_fin)
     values ($1, 'essai', 'actif', now() - interval '9 days', now() - interval '2 days')
     on conflict (proprietaire_id) do update set statut='actif', periode_fin = now() - interval '2 days'`,
    [temoin.uid]
  );
  const paiements = [
    ['FIX-1', 'fedapay', 'orange', 3000, 'reussi'],
    ['FIX-2', 'fedapay', 'mtn', 1500, 'echoue'],
    ['FIX-3', null, null, 500, 'en_attente'],
  ];
  for (const [ref, four, op, montant, statut] of paiements) {
    await pg.query(
      `insert into public.paiements (reference, proprietaire_id, plan, montant, devise, statut, fournisseur, operateur)
       values ($1,$2,'credits_250',$3,'XOF',$4,$5,$6)
       on conflict (reference) do update set statut = excluded.statut`,
      [ref, temoin.uid, montant, statut, four, op]
    );
  }
  await pg.query(
    `insert into public.credits_traduction (proprietaire_id, solde) values ($1, 350000)
     on conflict (proprietaire_id) do update set solde = 350000`,
    [temoin.uid]
  );
  await pg.query(
    `insert into public.credits_mouvements (proprietaire_id, pack_code, caracteres, montant, devise, reference_paiement)
     values ($1,'credits_250',250000,500,'XOF','FIX-MOUV-1')
     on conflict (reference_paiement) do nothing`,
    [temoin.uid]
  );
  await pg.query(
    `insert into public.credits_mouvements (proprietaire_id, pack_code, caracteres, montant, devise, reference_paiement)
     values ($1,'credits_600',600000,1000,'XOF','FIX-MOUV-2')
     on conflict (reference_paiement) do nothing`,
    [temoin.uid]
  );
  await pg.query(
    `insert into public.usage_mensuel (proprietaire_id, periode, caracteres, credits)
     values ($1, date_trunc('month', now())::date, 120000, 500000)
     on conflict (proprietaire_id, periode) do update set credits = 500000, caracteres = 120000`,
    [temoin.uid]
  );
  etape('données témoins posées (paiements, crédits, abonnement expiré)', true, {
    paiements: paiements.length,
    anomaliesAttendues: 1,
  });

  // ---------- 3. Navigateur ----------
  navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  });

  const page = await navigateur.newPage();
  const erreursConsole = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreursConsole.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => erreursConsole.push(`pageerror: ${e.message}`.slice(0, 200)));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.setCookie({
    name: `sb-${REF_PROJET}-auth-token`,
    value: admin.valeur,
    domain: new URL(BASE).hostname,
    path: '/',
  });

  // ---------- 4. Trois largeurs × tous les onglets ----------
  // Un seul panneau est monté à la fois : pour prouver que CHAQUE
  // panneau est correct à CHAQUE largeur, on active chaque onglet, on
  // capture (admin-<largeur>-<onglet>.png) et on mesure débordement,
  // cibles ≥ 44 px (dans <main>), focus visible et titres.
  const ONGLETS = [
    { slug: 'vue-ensemble', motif: 'Vue d’ensemble' },
    { slug: 'comptes', motif: 'Comptes' },
    { slug: 'abonnements', motif: 'Abonnements' },
    { slug: 'paiements', motif: 'Paiements' },
    { slug: 'systeme', motif: 'Système' },
  ];

  for (const largeur of [360, 768, 1440]) {
    const hauteur = largeur === 360 ? 780 : largeur === 768 ? 1000 : 900;
    await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 1 });
    const rep = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
    await pause(1200);
    await attendreHydratation(page, '[role="tab"]');
    await page.evaluate(() => document.fonts.ready);

    const parOnglet = {};
    const problemes = [];
    const libelles = [];

    for (let k = 0; k < ONGLETS.length; k += 1) {
      const o = ONGLETS[k];
      const libelle = await activerOnglet(page, k);
      if (libelle === null) {
        problemes.push(`${o.slug}: onglet non activé (aria-selected jamais vrai)`);
        parOnglet[o.slug] = { actif: false, capture: null };
        continue;
      }
      libelles.push(libelle);
      await page.evaluate(() => document.fonts.ready);
      await pause(250);

      const capture = join(DOSSIER, `admin-${largeur}-${o.slug}.png`);
      await page.screenshot({ path: capture, fullPage: true });

      const debordement = await page.evaluate(MESURE_DEBORDEMENT);
      const cibles = await page.evaluate(MESURE_TARGETS);
      const titres = await page.evaluate(MESURE_TITRES);
      await page.keyboard.press('Tab');
      await page.evaluate(() => document.activeElement?.blur?.());
      const focus = await page.evaluate(MESURE_FOCUS);

      const echecsCible = cibles.filter(
        (c) => c.exige44 && (c.largeur < 44 || c.hauteur < 44)
      );
      const echecsCibleMain = echecsCible.filter((c) => c.dansMain);
      const echecsCibleChrome = echecsCible.filter((c) => !c.dansMain);
      const echecsFocus = focus.filter((f) => !f.indicateur);
      const nonFocusables = focus.filter((f) => !f.focusable);
      const panneau = await page.evaluate(
        (i) => {
          const onglets = [...document.querySelectorAll('[role="tab"]')];
          const idCible = onglets[i]?.getAttribute('aria-controls');
          const p = idCible ? document.getElementById(idCible) : null;
          const autres = [...document.querySelectorAll('[role="tabpanel"]')].filter(
            (x) => x.id !== idCible
          );
          return {
            panneauId: idCible,
            panneauPresent: !!p,
            panneauxAutres: autres.length,
            hauteurPanneau: p ? Math.round(p.getBoundingClientRect().height) : 0,
          };
        },
        k
      );

      parOnglet[o.slug] = {
        libelle,
        actif: true,
        capture,
        panneau,
        debordement: {
          scrollWidth: debordement.scrollWidth,
          clientWidth: debordement.clientWidth,
          deborde: debordement.deborde,
          coupables: debordement.coupables,
        },
        cibles: {
          total: cibles.length,
          echecsPerimetreAdmin: echecsCibleMain.length,
          echecsChromeGlobal: echecsCibleChrome.length,
          exemplesPerimetreAdmin: echecsCibleMain.slice(0, 6),
          exemplesChromeGlobal: echecsCibleChrome.slice(0, 6),
        },
        focus: {
          total: focus.length,
          echecs: echecsFocus.length,
          exemples: echecsFocus.slice(0, 6),
        },
        nonFocusables: nonFocusables.length,
        titres: {
          h1: titres.h1,
          sautDeNiveau: titres.sautDeNiveau,
          liste: titres.titres.slice(0, 10),
        },
      };

      if (debordement.deborde)
        problemes.push(
          `${o.slug}: débordement ${debordement.scrollWidth}>${debordement.clientWidth}`
        );
      if (echecsCibleMain.length)
        problemes.push(
          `${o.slug}: ${echecsCibleMain.length} cible(s) < 44 px (${echecsCibleMain
            .map((c) => c.texte)
            .slice(0, 4)
            .join(' | ')})`
        );
      if (echecsFocus.length)
        problemes.push(
          `${o.slug}: ${echecsFocus.length} focus invisible (${echecsFocus
            .map((f) => f.texte)
            .slice(0, 4)
            .join(' | ')})`
        );
      if (nonFocusables.length) problemes.push(`${o.slug}: ${nonFocusables.length} non focusable`);
      if (titres.h1 !== 1) problemes.push(`${o.slug}: h1=${titres.h1}`);
      if (titres.sautDeNiveau) problemes.push(`${o.slug}: saut de niveau de titre`);
      if (!panneau.panneauPresent) problemes.push(`${o.slug}: tabpanel absent du DOM`);
      if (panneau.panneauxAutres !== 0)
        problemes.push(`${o.slug}: ${panneau.panneauxAutres} autre(s) panneau(x) monté(s)`);
    }

    const ok = rep.status() === 200 && problemes.length === 0;
    resultats.largeurs[largeur] = {
      statutHttp: rep.status(),
      onglets: ONGLETS.length,
      libelles,
      problemes,
      parOnglet,
    };
    etape(
      `/admin à ${largeur} px — ${ONGLETS.length} onglets : débordement, cibles ≥ 44 px (main), focus, titres`,
      ok,
      {
        statut: rep.status(),
        ongletsMesures: libelles.length,
        problemes,
        coupablesPremierOnglet: parOnglet[ONGLETS[0].slug]?.debordement?.coupables ?? [],
        captures: ONGLETS.map((o) => join(DOSSIER, `admin-${largeur}-${o.slug}.png`)),
      }
    );
  }

  // ---------- 5. Recherche / filtre / tri / pagination ----------
  {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
    await attendreHydratation(page, '[role="tab"]');
    // Les champs visés vivent dans le panneau « Comptes » : on l'active
    // d'abord (un seul panneau est monté à la fois).
    const libelleComptes = await activerOnglet(page, 1);
    await attendreHydratation(page, 'input[type="search"]');
    await pause(500);

    const compter = () => page.$$eval('#liste-comptes > li', (ls) => ls.length);
    const total = await compter();

    // Recherche par pseudo du témoin (rejouée une fois si l'hydratation
    // tardive de `next dev` a mangé le premier événement).
    const taperRecherche = async () => {
      await page.evaluate(() => {
        const input = document.querySelector('input[type="search"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Témoin Anomalie');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await pause(600);
      return compter();
    };
    let apresRecherche = await taperRecherche();
    if (apresRecherche === total) {
      await pause(4_000);
      apresRecherche = await taperRecherche();
    }
    const texteRecherche = await page.$eval('#liste-comptes', (el) => el.innerText.slice(0, 120));

    // Réinitialiser.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /réinitialiser/i.test(x.innerText));
      b?.click();
    });
    await pause(300);
    const apresReset = await compter();

    // Filtre anomalies.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /anomalies seules/i.test(x.innerText));
      b?.click();
    });
    await pause(300);
    const apresAnomalies = await compter();
    const anomaliesAffichees = await page.$eval('#liste-comptes', (el) => el.innerText.slice(0, 200));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /anomalies seules/i.test(x.innerText));
      b?.click();
    });
    await pause(300);

    // Pagination : passer à 5 par page.
    await page.select('select[aria-label="Nombre de comptes par page"]', '5');
    await pause(400);
    const page1 = await compter();
    const paginationPresente = await page.$('nav[aria-label="Pagination des comptes"]') !== null;
    await page.evaluate(() => {
      const b = document.querySelector('nav[aria-label="Pagination des comptes"] button[aria-label="Page 2"]');
      b?.click();
    });
    await pause(400);
    const page2 = await compter();
    const infoPagination = await page.$eval('nav[aria-label="Pagination des comptes"]', (el) => el.previousElementSibling?.innerText ?? '').catch(() => '');

    const ok =
      total > 5 &&
      apresRecherche === 1 &&
      apresReset === total &&
      apresAnomalies >= 1 &&
      paginationPresente &&
      page1 === 5 &&
      page2 === 5;

    resultats.fonctionnalites.recherche_pagination = {
      total, apresRecherche, apresReset, apresAnomalies,
      anomaliesAffichees, paginationPresente, page1, page2, infoPagination,
      texteRecherche,
    };
    etape('recherche + réinitialisation + filtre anomalies + pagination', ok, {
      ongletComptes: libelleComptes,
      total, apresRecherche, apresReset, apresAnomalies, page1, page2,
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.screenshot({ path: join(DOSSIER, 'admin-recherche-pagination.png'), fullPage: true });
  }

  // ---------- 6. Confirmation avant action destructrice ----------
  {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 120_000 });
    await attendreHydratation(page, '[role="tab"]');
    // Le bouton « retirer » vit dans le panneau « Comptes ».
    const libelleComptesConf = await activerOnglet(page, 1);
    await attendreHydratation(page, '#liste-comptes');
    await pause(500);
    const ouvert = await page.evaluate(() => {
      const boutons = [...document.querySelectorAll('#liste-comptes button')].filter(
        (b) => /retirer/i.test(b.innerText) && !b.disabled
      );
      if (!boutons.length) return { clique: false };
      boutons[0].click();
      return { clique: true };
    });
    await pause(400);
    const modale = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!d) return null;
      return {
        titre: d.querySelector('h3')?.innerText ?? '',
        texte: d.innerText.slice(0, 180),
        focusSur: document.activeElement?.innerText?.slice(0, 40) ?? '',
      };
    });
    const capture = join(DOSSIER, 'admin-confirmation.png');
    await page.screenshot({ path: capture, fullPage: false });

    // Échap referme.
    await page.keyboard.press('Escape');
    await pause(300);
    const fermee = await page.evaluate(() => document.querySelector('[role="dialog"][aria-modal="true"]') === null);

    resultats.fonctionnalites.confirmation = { ouvert, modale, fermeeParEchap: fermee, capture };
    etape('confirmation explicite avant « retirer » (modale + Échap)', Boolean(modale) && fermee, {
      ongletComptes: libelleComptesConf,
      ouvert,
      titre: modale?.titre,
      focusSur: modale?.focusSur,
      fermeeParEchap: fermee,
    });
  }

  // ---------- 7. Exports CSV (authentifié) ----------
  {
    const tester = async (type) => {
      return page.evaluate(async (t) => {
        const r = await fetch(`/api/admin/export?type=${t}`, { credentials: 'include' });
        const buf = new Uint8Array(await r.arrayBuffer());
        const aBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
        const texte = new TextDecoder('utf-8').decode(buf);
        const lignes = texte.split('\r\n');
        return {
          statut: r.status,
          contentType: r.headers.get('content-type'),
          disposition: r.headers.get('content-disposition'),
          nbLignes: lignes.length,
          entete: lignes[0],
          premierExemple: lignes[1] ?? '',
          aBom,
        };
      }, type);
    };
    const comptes = await tester('comptes');
    const stats = await tester('stats');
    const abonnements = await tester('abonnements');
    const paiements = await tester('paiements');
    const anomalies = await tester('anomalies');

    const ok =
      [comptes, stats, abonnements, paiements, anomalies].every(
        (r) => r.statut === 200 && /text\/csv/.test(r.contentType ?? '') && r.aBom && r.nbLignes >= 2
      ) &&
      /attachment; filename="plume-admin-comptes-/.test(comptes.disposition ?? '');

    resultats.api.exports = { comptes, stats, abonnements, paiements, anomalies };
    etape('exports CSV (comptes, stats, abonnements, paiements, anomalies)', ok, {
      comptes: { statut: comptes.statut, lignes: comptes.nbLignes, entete: comptes.entete },
      paiements: { lignes: paiements.nbLignes, entete: paiements.entete, ex: paiements.premierExemple },
      abonnements: { entete: abonnements.entete, ex: abonnements.premierExemple },
    });
  }

  // ---------- 8. Export refusé sans session ----------
  {
    // Contexte NAVIGATEUR ISOLÉ : aucun cookie de session partagé.
    const contexte = await navigateur.createBrowserContext();
    const anon = await contexte.newPage();
    await anon.setViewport({ width: 1440, height: 900 });
    await anon.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const res = await anon.evaluate(async () => {
      const r = await fetch('/api/admin/export?type=comptes');
      return { statut: r.status, corps: (await r.text()).slice(0, 120) };
    });
    await contexte.close();
    resultats.api.refusSansSession = res;
    etape('export CSV refusé sans session (401)', res.statut === 401, res);
  }

  // ---------- 9. prefers-reduced-motion ----------
  {
    const p2 = await navigateur.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await p2.setCookie({
      name: `sb-${REF_PROJET}-auth-token`,
      value: admin.valeur,
      domain: new URL(BASE).hostname,
      path: '/',
    });
    await p2.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await pause(800);
    const infos = await p2.evaluate(() => {
      const el = document.querySelector('.animate-fondu-monte') || document.body;
      const cs = getComputedStyle(el);
      const durees = cs.animationDuration.split(',').map((d) => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000));
      return {
        mediaReduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
        animationDuration: cs.animationDuration,
        dureeMaxMs: Math.max(...durees),
        infinie: cs.animationIterationCount.split(',').some((s) => s.trim() === 'infinite'),
      };
    });
    const capture = join(DOSSIER, 'admin-reduced-motion.png');
    await p2.screenshot({ path: capture, fullPage: false });
    await p2.close();
    resultats.largeurs.reducedMotion = { ...infos, capture };
    etape('prefers-reduced-motion: reduce → animation ≤ 1 ms', infos.mediaReduce && infos.dureeMaxMs <= 1.01 && !infos.infinie, infos);
  }

  resultats.erreursConsole = erreursConsole.slice(0, 10);
  etape('aucune erreur console sur /admin', erreursConsole.length === 0, { nb: erreursConsole.length, ex: erreursConsole.slice(0, 3) });
} catch (e) {
  etape('exécution interrompue', false, { erreur: String(e) });
} finally {
  if (navigateur) await navigateur.close().catch(() => undefined);

  // ---------- Nettoyage des données témoins et des comptes jetables ----------
  try {
    await pg.query(`delete from public.paiements where reference like 'FIX-%'`);
    await pg.query(`delete from public.credits_mouvements where reference_paiement like 'FIX-%'`);
    await pg.query(`delete from public.usage_mensuel where periode = date_trunc('month', now())::date and proprietaire_id in (select id from auth.users where email like 'probe-%')`);
    await pg.query(`delete from public.abonnements where proprietaire_id in (select id from auth.users where email like 'probe-%')`);
    await pg.query(`delete from public.credits_traduction where proprietaire_id in (select id from auth.users where email like 'probe-%')`);
    await pg.query(`delete from public.admin_actions where cible_id in (select id from auth.users where email like 'probe-%')`);
    await pg.query(`delete from public.profiles where id in (select id from auth.users where email like 'probe-%')`);
    const supprimes = await pg.query(`delete from auth.users where email like 'probe-%' returning id`);
    console.log(`\nNettoyage : ${supprimes.rowCount} compte(s) jetable(s) supprimé(s).`);
  } catch (e) {
    console.error('Nettoyage partiel :', e.message);
  }
  await pg.end().catch(() => undefined);

  const totalE = journal.length;
  const reussies = journal.filter((x) => x.ok).length;
  const rapport = { base: BASE, dossier: DOSSIER, horodatage: new Date().toISOString(), total: totalE, reussies, echecs: totalE - reussies, journal, resultats };
  const chemin = join(DOSSIER, 'probe-admin-w8w9.json');
  writeFileSync(chemin, JSON.stringify(rapport, null, 2), 'utf8');
  console.log(`\n=== RÉCAPITULATIF : ${reussies}/${totalE} ===`);
  console.log(`Rapport JSON : ${chemin}`);
  process.exit(reussies === totalE ? 0 : 1);
}
