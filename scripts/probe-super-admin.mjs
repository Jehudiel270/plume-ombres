// ============================================================
// scripts/probe-super-admin.mjs — Preuve navigateur RÉELLE de la
// vague « super_admin » (rôle + nomination d'administrateurs).
//
//   node scripts/probe-super-admin.mjs
//
// Ce que fait la sonde, entièrement sur la production locale :
//   1. crée 4 comptes JETABLES (super_admin, admin simple, témoin
//      utilisateur, cible manipulée) — nettoyés en fin de course ;
//   2. ouvre /admin avec le SUPER-admin à 360 / 768 / 1440 px :
//      contrôle le nombre d'onglets (6, dont « Rôles »), le débordement
//      horizontal, les cibles ≥ 44 px, le focus visible et les titres ;
//   3. exerce la fonctionnalité : nommer la cible ADMIN, vérifier la
//      base + le journal admin_actions, la RÉTROGRADER, puis la nommer
//      SUPER-ADMIN (avec la modale de confirmation) et la rétablir ;
//   4. prouve les REFUS : sa propre ligne est verrouillée dans
//      l'interface ; un ADMIN SIMPLE ne voit PAS l'onglet « Rôles » et
//      reçoit 403 s'il appelle /api/admin/roles directement ; un
//      UTILISATEUR reçoit 403 ; un ANONYME reçoit 401.
//
// Toutes les vérifications en base se font par ATTENTE ACTIVE (le rôle
// finit d'être écrit côté serveur) : jamais par un délai fixe, qui
// produisait des faux négatifs.
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
const DOSSIER = process.env.PROBE_OUT ?? join(tmpdir(), 'preuves-super-admin');
mkdirSync(DOSSIER, { recursive: true });

const LIGNES = readFileSync('.env.local', 'utf8').split(/\r?\n/);
const env = (k) => {
  const l = LIGNES.find((x) => x.trim().startsWith(`${k}=`));
  if (!l) throw new Error(`clé ${k} absente de .env.local`);
  return l.split('=').slice(1).join('=').trim();
};
const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REF_PROJET = new URL(SUPA_URL).host.split('.')[0];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { valeur, uid: corps.user.id, nomCookie: `sb-${REF_PROJET}-auth-token` };
}

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
    await pause(5_000);
  }
}

/** Active l'onglet d'index `index` ; renvoie son libellé ou null. */
async function activerOnglet(page, index) {
  for (let essai = 0; essai < 10; essai += 1) {
    const etat = await page.evaluate((i) => {
      const onglets = [...document.querySelectorAll('[role="tab"]')];
      if (onglets.length <= i) return { present: false, actif: false };
      const cible = onglets[i];
      const actif = cible.getAttribute('aria-selected') === 'true';
      if (!actif) cible.click();
      return { present: true, actif, libelle: (cible.innerText || '').replace(/\s+/g, ' ').trim() };
    }, index);
    if (etat.actif) return etat.libelle ?? '';
    await pause(500);
  }
  return null;
}

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
      coupables.push({ tag: el.tagName.toLowerCase(), classe: (el.className || '').toString().slice(0, 60), gauche: Math.round(r.left), droite: Math.round(r.right) });
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, deborde: document.documentElement.scrollWidth > vw + 1, coupables: coupables.slice(0, 8) };
})()`;

const MESURE_TARGETS = `(() => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const enLigne = el.tagName === 'A' && cs.display === 'inline';
    out.push({ tag: el.tagName.toLowerCase(), texte: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0, 42), largeur: Math.round(r.width), hauteur: Math.round(r.height), exige44: !enLigne, dansMain: el.closest('main') !== null });
  }
  return out;
})()`;

const MESURE_TITRES = `(() => {
  const titres = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => ({ niveau: Number(h.tagName[1]), texte: (h.innerText || '').trim().slice(0, 60) }));
  let saut = false;
  for (let i = 1; i < titres.length; i += 1) if (titres[i].niveau - titres[i - 1].niveau > 1) saut = true;
  return { h1: titres.filter((t) => t.niveau === 1).length, sautDeNiveau: saut };
})()`;

// ============================================================
const pg = ouvrirPg();
await pg.connect();

/** Attend que le rôle en BASE atteigne la valeur voulue (écriture serveur). */
async function attendreRole(uid, attendu, timeoutMs = 25_000) {
  const fin = Date.now() + timeoutMs;
  let dernier = null;
  while (Date.now() < fin) {
    dernier = (await pg.query(`select role from public.profiles where id=$1`, [uid])).rows[0]?.role ?? null;
    if (dernier === attendu) return { ok: true, role: dernier };
    await pause(500);
  }
  return { ok: false, role: dernier };
}

const marque = Date.now().toString(36);
const MDP = `Probe-${randomUUID().slice(0, 8)}-Aa1!`;
const EMAILS = {
  super: `probe-super-${marque}@plume-ombres.invalid`,
  admin: `probe-admin2-${marque}@plume-ombres.invalid`,
  temoin: `probe-temoin-${marque}@plume-ombres.invalid`,
  cible: `probe-cible-${marque}@plume-ombres.invalid`,
};

const comptes = {};
let navigateur;
const resultats = { largeurs: {}, fonctionnalites: {}, refus: {} };

try {
  // ---------- 1. Comptes jetables ----------
  for (const [cle, email] of Object.entries(EMAILS)) {
    comptes[cle] = await creerSession(email, MDP);
  }
  const roles = { super: 'super_admin', admin: 'admin', temoin: 'utilisateur', cible: 'utilisateur' };
  for (const [cle, role] of Object.entries(roles)) {
    await pg.query(
      `insert into public.profiles (id, pseudo, role) values ($1,$2,$3)
       on conflict (id) do update set role=excluded.role, pseudo=excluded.pseudo`,
      [comptes[cle].uid, `Sonde ${cle}`, role]
    );
  }
  etape('4 comptes jetables créés (super_admin, admin, témoin, cible)', true, {
    super: comptes.super.uid,
    admin: comptes.admin.uid,
    temoin: comptes.temoin.uid,
    cible: comptes.cible.uid,
  });

  // ---------- 2. Navigateur ----------
  navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  });
  // Un CONTEXTE navigateur PAR COMPTE : chaque session a son propre pot à
  // cookies. Réutiliser le même onglet en remplaçant le cookie de session
  // laisse coexister plusieurs sessions Supabase, ce qui fait dérailler le
  // routeur client de Next (« enqueueModel ») — artefact de sonde, pas défaut
  // du produit : une sonde d'un seul compte ne reproduit jamais l'erreur.
  const contexteSuper = await navigateur.createBrowserContext();
  const contexteAdmin = await navigateur.createBrowserContext();
  const page = await contexteSuper.newPage();
  const pageAdmin = await contexteAdmin.newPage();
  const erreursConsole = [];
  for (const p of [page, pageAdmin]) {
    p.on('console', (m) => {
      if (m.type() === 'error') erreursConsole.push(m.text().slice(0, 200));
    });
    p.on('pageerror', (e) => erreursConsole.push(`pageerror: ${e.message}`.slice(0, 200)));
  }

  const poserCookie = async (p, compte) => {
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await p.setCookie({
      name: compte.nomCookie,
      value: compte.valeur,
      domain: new URL(BASE).hostname,
      path: '/',
    });
  };

  await poserCookie(page, comptes.super);
  await poserCookie(pageAdmin, comptes.admin);

  // ---------- 3. Trois largeurs, onglet « Rôles » ----------
  for (const largeur of [360, 768, 1440]) {
    await page.setViewport({ width: largeur, height: largeur === 360 ? 780 : 1000, deviceScaleFactor: 1 });
    const rep = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
    await pause(1200);
    await attendreHydratation(page, '[role="tab"]');
    await page.evaluate(() => document.fonts.ready);

    const libelles = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((t) =>
        (t.innerText || '').replace(/\s+/g, ' ').trim()
      )
    );

    const indexRoles = 4;
    const libelleRoles = await activerOnglet(page, indexRoles);
    await pause(500);
    const capture = join(DOSSIER, `super-admin-${largeur}-roles.png`);
    await page.screenshot({ path: capture, fullPage: true });

    const debordement = await page.evaluate(MESURE_DEBORDEMENT);
    const cibles = await page.evaluate(MESURE_TARGETS);
    const titres = await page.evaluate(MESURE_TITRES);
    const panneau = await page.evaluate((i) => {
      const onglets = [...document.querySelectorAll('[role="tab"]')];
      const idCible = onglets[i]?.getAttribute('aria-controls');
      const p = idCible ? document.getElementById(idCible) : null;
      return {
        panneauPresent: !!p,
        panneauxAutres: [...document.querySelectorAll('[role="tabpanel"]')].filter((x) => x.id !== idCible).length,
        contientTitreRoles: !!(p && p.querySelector('#titre-roles')),
        contientTableauRoles: !!(p && p.querySelector('select[aria-label^="Nouveau rôle pour"]')),
      };
    }, indexRoles);

    const echecsCibles = cibles.filter((c) => c.exige44 && c.dansMain && (c.largeur < 44 || c.hauteur < 44));
    const problemes = [];
    if (libelles.length !== 6) problemes.push(`onglets=${libelles.length} (attendu 6)`);
    if (!libelleRoles || !libelleRoles.includes('Rôles')) problemes.push('onglet Rôles jamais sélectionné');
    if (debordement.deborde) problemes.push(`débordement ${debordement.scrollWidth}>${debordement.clientWidth}`);
    if (echecsCibles.length) problemes.push(`${echecsCibles.length} cible(s) < 44 px`);
    if (titres.h1 !== 1) problemes.push(`h1=${titres.h1}`);
    if (titres.sautDeNiveau) problemes.push('saut de niveau de titre');
    if (!panneau.panneauPresent) problemes.push('tabpanel absent');
    if (panneau.panneauxAutres !== 0) problemes.push(`${panneau.panneauxAutres} autre(s) panneau(x) monté(s)`);
    if (!panneau.contientTitreRoles) problemes.push('panneau Rôles sans titre #titre-roles');
    if (!panneau.contientTableauRoles) problemes.push('aucun sélecteur de rôle trouvé dans le panneau');

    resultats.largeurs[largeur] = { statutHttp: rep.status(), libelles, problemes, panneau, capture };
    etape(
      `/admin (super_admin) à ${largeur} px — 6 onglets dont Rôles, débordement, cibles, titres`,
      rep.status() === 200 && problemes.length === 0,
      { libelles, problemes, capture }
    );
  }

  // ---------- 4. Refus (avant toute mutation : comptes témoins intacts) ----------
  {
    const appel = async (valeurCookie, corps) => {
      const entetes = { 'content-type': 'application/json' };
      if (valeurCookie) entetes.cookie = `${comptes.super.nomCookie}=${valeurCookie}`;
      const r = await fetch(`${BASE}/api/admin/roles`, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify(corps),
      });
      return r.status;
    };

    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

    // admin simple : sa PROPRE page (contexte isolé) ne doit PAS montrer l'onglet Rôles
    await pageAdmin.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await pageAdmin.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
    await attendreHydratation(pageAdmin, '[role="tab"]');
    const libellesAdmin = await pageAdmin.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((t) =>
        (t.innerText || '').replace(/\s+/g, ' ').trim()
      )
    );
    const statutAdmin = await appel(comptes.admin.valeur, { utilisateurId: comptes.cible.uid, role: 'admin' });
    etape(
      'refus : un ADMIN SIMPLE voit 5 onglets (pas de « Rôles ») et reçoit 403 sur l’API',
      libellesAdmin.length === 5 && !libellesAdmin.some((l) => l.includes('Rôles')) && statutAdmin === 403,
      { onglets: libellesAdmin.length, statutApi: statutAdmin }
    );
    resultats.refus.admin = { onglets: libellesAdmin.length, statutApi: statutAdmin };

    // utilisateur TÉMOIN (jamais promu) : 403
    const statutUtilisateur = await appel(comptes.temoin.valeur, { utilisateurId: comptes.cible.uid, role: 'admin' });
    etape('refus : un UTILISATEUR reçoit 403 sur l’API', statutUtilisateur === 403, { statutUtilisateur });
    resultats.refus.utilisateur = { statutApi: statutUtilisateur };

    // anonyme : 401
    const statutAnonyme = await appel(null, { utilisateurId: comptes.cible.uid, role: 'admin' });
    etape('refus : un ANONYME reçoit 401 sur l’API', statutAnonyme === 401, { statutAnonyme });
    resultats.refus.anonyme = { statutApi: statutAnonyme };

    // la cible n'a pas bougé
    const roleCible = (await pg.query(`select role from public.profiles where id=$1`, [comptes.cible.uid]))
      .rows[0]?.role;
    etape('aucun rôle modifié par les 3 appels refusés', roleCible === 'utilisateur', { roleCible });

    // le super-admin lui-même ne peut pas changer SON rôle (API)
    const statutSoiMeme = await appel(comptes.super.valeur, { utilisateurId: comptes.super.uid, role: 'admin' });
    etape('refus : le super-admin ne peut pas modifier SON PROPRE rôle (400)', statutSoiMeme === 400, { statutSoiMeme });
  }

  // ---------- 5. Fonctionnalité : nommer / rétrograder ----------
  {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
    await attendreHydratation(page, '[role="tab"]');
    await activerOnglet(page, 4);
    await pause(800);

    /** Attend que la ligne « Sonde cible » soit interactive (après un refresh RSC). */
    const preparer = async () => {
      await activerOnglet(page, 4);
      await page
        .waitForFunction(
          () => {
            const l = [...document.querySelectorAll('main li')].find((x) =>
              (x.innerText || '').includes('Sonde cible')
            );
            return !!(l && l.querySelector('select[aria-label^="Nouveau rôle pour"]'));
          },
          { timeout: 30_000, polling: 250 }
        )
        .catch(() => undefined);
      await pause(400);
    };

    /** 1er temps : choisit le rôle via l'API native du navigateur (fiable). */
    const choisirRole = async (roleVoulu) => {
      try {
        await page.select('select[aria-label="Nouveau rôle pour Sonde cible"]', roleVoulu);
        return { ok: true };
      } catch (e) {
        return { ok: false, motif: `sélecteur indisponible : ${String(e.message).slice(0, 80)}` };
      }
    };

    /** Attend que le bouton de la ligne cible redevienne actif (re-rendu React). */
    const attendreBoutonActif = async (libelle, timeoutMs = 15_000) => {
      const fin = Date.now() + timeoutMs;
      let vu = false;
      while (Date.now() < fin) {
        const etat = await page.evaluate((motif) => {
          const ligne = [...document.querySelectorAll('main li')].find((l) =>
            (l.innerText || '').includes('Sonde cible')
          );
          if (!ligne) return { present: false };
          const b = [...ligne.querySelectorAll('button')].find((x) => (x.innerText || '').includes(motif));
          return { present: !!b, actif: !!b && !b.disabled };
        }, libelle);
        vu = vu || etat.present;
        if (etat.actif) return { ok: true };
        await pause(500);
      }
      return { ok: false, motif: vu ? 'bouton jamais réactivé' : 'bouton introuvable' };
    };

    /** 2e temps (après re-rendu React) : clique le bouton, seulement s'il est actif. */
    const cliquerBouton = (libelle) =>
      page.evaluate((motif) => {
        const ligne = [...document.querySelectorAll('main li')].find((l) =>
          (l.innerText || '').includes('Sonde cible')
        );
        if (!ligne) return { ok: false, motif: 'ligne introuvable' };
        const boutons = [...ligne.querySelectorAll('button')];
        const b = boutons.find((x) => (x.innerText || '').includes(motif));
        if (!b) return { ok: false, motif: `bouton « ${motif} » introuvable` };
        if (b.disabled) return { ok: false, motif: 'bouton désactivé' };
        b.click();
        return { ok: true };
      }, libelle);

    /**
     * Enchaîne préparation → choix → clic → ATTENTE DE STABILISATION.
     * L'attente finale est indispensable : sans elle, on enchaîne les
     * rafraîchissements RSC et le routeur client de Next 16 finit par lever
     * une erreur interne (« enqueueModel ») qui n'a rien à voir avec la
     * fonctionnalité — un humain, lui, attend que la page se repose.
     */
    const agir = async (roleVoulu, libelleBouton) => {
      await preparer();
      const choix = await choisirRole(roleVoulu);
      if (!choix.ok) return choix;
      const actif = await attendreBoutonActif(libelleBouton);
      if (!actif.ok) return actif;
      const clic = await cliquerBouton(libelleBouton);
      if (!clic.ok) return clic;
      await page
        .waitForFunction(
          () => {
            const l = [...document.querySelectorAll('main li')].find((x) =>
              (x.innerText || '').includes('Sonde cible')
            );
            return !!(l && l.querySelector('[role="status"]'));
          },
          { timeout: 25_000, polling: 250 }
        )
        .catch(() => undefined);
      await pause(800);
      return clic;
    };

    // (a) utilisateur → admin
    let action = await agir('admin', 'Appliquer');
    let attente = await attendreRole(comptes.cible.uid, 'admin');
    const j1 = (
      await pg.query(
        `select action, role_cible from public.admin_actions where cible_id=$1 order by cree_le desc limit 1`,
        [comptes.cible.uid]
      )
    ).rows[0];
    etape(
      'nomination : utilisateur → admin (interface + base + journal)',
      action.ok && attente.ok && j1?.action === 'nommer_role' && j1?.role_cible === 'admin',
      { action, roleBd: attente.role, journal: j1 }
    );

    // (b) admin → utilisateur (rétrogradation)
    action = await agir('utilisateur', 'Appliquer');
    attente = await attendreRole(comptes.cible.uid, 'utilisateur');
    const j2 = (
      await pg.query(
        `select action, role_cible from public.admin_actions where cible_id=$1 order by cree_le desc limit 1`,
        [comptes.cible.uid]
      )
    ).rows[0];
    etape(
      'rétrogradation : admin → utilisateur (interface + base + journal)',
      action.ok && attente.ok && j2?.action === 'retrograder_role',
      { action, roleBd: attente.role, journal: j2 }
    );

    // (c) promotion super_admin : passage par la MODALE de confirmation
    action = await agir('super_admin', 'Nommer');
    await pause(700);
    const modale = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? { present: true, titre: (d.querySelector('h3')?.innerText || '').trim() } : { present: false };
    });
    const clicConfirmer = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return false;
      const b = [...d.querySelectorAll('button')].find((x) =>
        (x.innerText || '').includes('Nommer super-administrateur')
      );
      if (!b) return false;
      b.click();
      return true;
    });
    attente = await attendreRole(comptes.cible.uid, 'super_admin');
    await pause(1500); // laisse le rafraîchissement RSC se terminer
    const j3 = (
      await pg.query(
        `select action, role_cible from public.admin_actions where cible_id=$1 order by cree_le desc limit 1`,
        [comptes.cible.uid]
      )
    ).rows[0];
    etape(
      'promotion super_admin : modale de confirmation, puis effet en base et au journal',
      action.ok && modale.present && clicConfirmer && attente.ok && j3?.role_cible === 'super_admin',
      { action, modale, clicConfirmer, roleBd: attente.role, journal: j3 }
    );

    // (d) retour à utilisateur (remise en état)
    action = await agir('utilisateur', 'Appliquer');
    attente = await attendreRole(comptes.cible.uid, 'utilisateur');
    etape('remise en état : super_admin → utilisateur', action.ok && attente.ok, {
      action,
      roleBd: attente.role,
    });

    // (e) sa propre ligne est verrouillée dans l'interface
    await preparer();
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('main li')].some((l) => (l.innerText || '').includes('Sonde super')),
        { timeout: 30_000, polling: 250 }
      )
      .catch(() => undefined);
    const verrou = await page.evaluate(() => {
      const ligne = [...document.querySelectorAll('main li')].find((l) =>
        (l.innerText || '').includes('Sonde super')
      );
      if (!ligne) return { present: false };
      return {
        present: true,
        selecteur: !!ligne.querySelector('select[aria-label^="Nouveau rôle pour"]'),
        texte: (ligne.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      };
    });
    etape(
      'garde anti-verrouillage : sa propre ligne n’a AUCUN sélecteur de rôle',
      verrou.present && verrou.selecteur === false,
      verrou
    );

    resultats.fonctionnalites = { erreursConsole: erreursConsole.slice(0, 5) };
    etape('aucune erreur console pendant le parcours', erreursConsole.length === 0, {
      erreurs: erreursConsole.slice(0, 5),
    });
  }

  const total = journal.length;
  const echecs = journal.filter((j) => !j.ok).length;
  resultats.bilan = { total, echecs };
  writeFileSync(join(DOSSIER, 'preuves-super-admin.json'), JSON.stringify(resultats, null, 2));
  console.log(`\n${echecs === 0 ? '✓' : '✗'} ${total - echecs}/${total} étapes OK — preuves : ${DOSSIER}`);
  process.exitCode = echecs === 0 ? 0 : 1;
} catch (e) {
  console.error('ÉCHEC DE LA SONDE :', e);
  process.exitCode = 2;
} finally {
  try {
    const ids = Object.values(comptes).map((c) => c.uid);
    if (ids.length) {
      await pg.query(`delete from public.admin_actions where cible_id = any($1) or admin_id = any($1)`, [ids]);
      await pg.query(`delete from public.profiles where id = any($1)`, [ids]);
      await pg.query(`delete from auth.users where id = any($1)`, [ids]);
      console.log(`· comptes jetables supprimés : ${ids.length}`);
    }
  } catch (e) {
    console.warn('· nettoyage incomplet :', e.message);
  }
  await pg.end().catch(() => {});
  if (navigateur) await navigateur.close().catch(() => {});
}
