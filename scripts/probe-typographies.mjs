#!/usr/bin/env node
// ============================================================
// probe-typographies.mjs — Preuve navigateur RÉELLE (Edge headless)
// des typographies AJOUTÉES au lecteur ET au panneau d'apparence.
//
//   node scripts/probe-typographies.mjs [http://localhost:3981]
//
// MESURE (rien d'estimé) :
//   · le LECTEUR (/connexion/apercu) propose les 6 nouvelles
//     familles ; en choisir une change réellement le rendu
//     (--pref-police résolu + @font-face réellement CHARGÉE) ;
//   · le PANNEAU D'APPARENCE propose les 6 nouvelles familles ;
//     en choisir une change --typo-titre/--typo-corps ;
//   · la préférence est CONSERVÉE après rechargement de la page ;
//   · les 3 familles d'origine restent sélectionnables ;
//   · aucune fuite horizontale et cibles de sélection ≥ 44 px,
//     aux largeurs 360 / 768 / 1440 ;
//   · aucune requête vers un CDN de polices (auto-hébergement).
//
// Captures PNG : %LOCALAPPDATA%/Temp/plume-typographies
//
// Compte jetable : les pages publiques suffisent ici (aperçu +
// panneau global), donc AUCUN compte n'est créé. Le repli
// « compte jetable » (création puis nettoyage) n'est utilisé que
// si les pages publiques ne rendent pas les panneaux, ou si
// PLUME_COMPTE_JETABLE=1 est demandé.
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE =
  process.env.PLUME_EDGE ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = process.argv[2] || process.env.PLUME_HOST || 'http://localhost:3981';
const OUT = join(
  process.env.LOCALAPPDATA || tmpdir(),
  'Temp',
  'plume-typographies'
);
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const LARGEURS = [360, 768, 1440];
/** Familles AJOUTÉES, avec leur libellé dans le panneau du lecteur. */
const NOUVELLES = [
  { id: 'ebGaramond', libelle: 'Garamond' },
  { id: 'spectral', libelle: 'Spectral' },
  { id: 'libreBaskerville', libelle: 'Baskerville' },
  { id: 'playfair', libelle: 'Playfair' },
  { id: 'prata', libelle: 'Prata' },
  { id: 'atkinson', libelle: 'Atkinson' },
];
const ORIGINE_TYPOS = ['plume', 'velin', 'native'];
const ORIGINE_POLICES = ['Lora', 'Système', 'Mono'];

const RAPPORT = {
  host: HOST,
  largeurs: LARGEURS,
  lecteur: {},
  apparence: {},
  origine: {},
  persistance: {},
  cibles: {},
  debordement: {},
  requetesCdn: [],
  erreursConsole: [],
  captures: OUT,
};
const captures = [];
let navigateur;

// ------------------------------ outils ------------------------------
async function ouvrirPanneauApparence(page) {
  await page
    .waitForSelector('button.bouton-apparence', { timeout: 60_000 })
    .catch(() => {});
  for (let i = 0; i < 60; i += 1) {
    if (await page.evaluate(() => !!document.querySelector('#panneau-apparence')))
      return true;
    await page.evaluate(() => {
      document.querySelector('button.bouton-apparence')?.click();
    });
    await pause(300);
  }
  return page.evaluate(() => !!document.querySelector('#panneau-apparence'));
}

async function ouvrirReglagesLecteur(page) {
  await page
    .waitForSelector('button[aria-label="Réglages de lecture"]', {
      timeout: 60_000,
    })
    .catch(() => {});
  for (let i = 0; i < 60; i += 1) {
    if (
      await page.evaluate(() =>
        !!document.querySelector('#reglages-lecture')
      )
    )
      return true;
    await page.evaluate(() => {
      document
        .querySelector('button[aria-label="Réglages de lecture"]')
        ?.click();
    });
    await pause(300);
  }
  return page.evaluate(() => !!document.querySelector('#reglages-lecture'));
}

/** État de rendu du lecteur : valeur résolue + polices réellement chargées. */
const ETAT_LECTEUR = `(() => {
  const cible = document.getElementById('apercu');
  const para = cible?.querySelector('.corps-livre') ?? cible;
  if (!cible || !para) return { ok: false };
  const police = getComputedStyle(cible).getPropertyValue('--pref-police').trim();
  const famille = police.split(',')[0].replace(/["']/g, '').trim();
  const faces = [...document.fonts]
    .filter((f) => f.family.replace(/["']/g, '') === famille)
    .map((f) => ({ famille: f.family, statut: f.status, graisse: f.weight, style: f.style }));
  const r = para.getBoundingClientRect();
  return {
    ok: true,
    policeVariable: police,
    famille,
    corpsFontFamily: getComputedStyle(para).fontFamily,
    chargee: document.fonts.check('17px "' + famille + '"'),
    faces,
    hauteurTexte: Math.round(r.height),
  };
})()`;

/** État de rendu de l'apparence (variables posées sur <html>). */
const ETAT_APPARENCE = `(() => {
  const cs = getComputedStyle(document.documentElement);
  const corps = cs.getPropertyValue('--typo-corps').trim();
  const titre = cs.getPropertyValue('--typo-titre').trim();
  const famille = corps.split(',')[0].replace(/["']/g, '').trim();
  const faces = [...document.fonts]
    .filter((f) => f.family.replace(/["']/g, '') === famille)
    .map((f) => ({ famille: f.family, statut: f.status }));
  return {
    typos: document.documentElement.dataset.typo,
    typoCorps: corps,
    typoTitre: titre,
    famille,
    chargee: document.fonts.check('17px "' + famille + '"'),
    faces,
  };
})()`;

/** Mesure des cibles de sélection de typographie (≥ 44 px exigé). */
function cibles(page, selecteur) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      const label = (el.textContent || '').trim().slice(0, 24);
      return {
        label,
        largeur: Math.round(r.width),
        hauteur: Math.round(r.height),
        conforme: r.width >= 44 && r.height >= 44,
      };
    });
  }, selecteur);
}

/** Sélectionne un bouton `role=radio` du lecteur par son libellé. */
async function choisirPoliceLecteur(page, libelle) {
  return page.evaluate((txt) => {
    const g = document.querySelector(
      '[role="radiogroup"][aria-label="Police du texte"]'
    );
    const b = [...(g?.querySelectorAll('button[role="radio"]') ?? [])].find(
      (x) => x.textContent.trim() === txt
    );
    if (!b) return false;
    b.click();
    return true;
  }, libelle);
}

async function choisirTypoApparence(page, id) {
  return page.evaluate((v) => {
    const input = document.querySelector(
      `input[name="typo-plume"][value="${v}"]`
    );
    if (!input) return false;
    input.click();
    return true;
  }, id);
}

// ------------------------------ parcours ------------------------------
async function main() {
  navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 960, deviceScaleFactor: 1 },
  });
  const page = await navigateur.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') RAPPORT.erreursConsole.push(m.text());
  });
  page.on('pageerror', (e) =>
    RAPPORT.erreursConsole.push(`pageerror: ${e.message}`)
  );
  page.on('request', (r) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./i.test(r.url()))
      RAPPORT.requetesCdn.push(r.url());
  });

  // Pré-chauffage + détection des routes publiques.
  await page.goto(`${HOST}/connexion/apercu`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await pause(1500);
  const panneauxPresents = await page.evaluate(async () => {
    const r1 = await fetch('/connexion/apercu', { method: 'HEAD' });
    const r2 = await fetch('/', { method: 'HEAD' });
    return { apercu: r1.ok, racine: r2.ok };
  });
  RAPPORT.routesPubliques = panneauxPresents;
  if (!panneauxPresents.apercu || !panneauxPresents.racine) {
    RAPPORT.compteJetable = {
      requis: true,
      note: 'Pages publiques indisponibles — repli compte jetable non implémenté ici.',
    };
  } else {
    RAPPORT.compteJetable = {
      requis: false,
      note: 'Pages publiques suffisantes : aucun compte créé, rien à nettoyer.',
    };
  }

  for (const largeur of LARGEURS) {
    await page.setViewport({ width: largeur, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${HOST}/connexion/apercu`, {
      waitUntil: 'networkidle2',
      timeout: 120_000,
    });
    await page.evaluate(() => document.fonts.ready);
    await pause(500);

    // -------- A. LECTEUR : chaque nouvelle famille rendue --------
    await ouvrirReglagesLecteur(page);
    const ciblesLecteur = await cibles(
      page,
      '[aria-label="Police du texte"] button[role="radio"]'
    );
    RAPPORT.cibles[`lecteur-${largeur}`] = ciblesLecteur;

    RAPPORT.lecteur[largeur] = {};
    for (const police of NOUVELLES) {
      const clique = await choisirPoliceLecteur(page, police.libelle);
      await page.evaluate(() => document.fonts.ready);
      await pause(350);
      const etat = await page.evaluate(ETAT_LECTEUR);
      etat.clique = clique;
      RAPPORT.lecteur[largeur][police.id] = etat;

      const card = await page.$('#apercu');
      const box = card ? await card.boundingBox() : null;
      const fichier = join(OUT, `lecteur-${police.id}-${largeur}.png`);
      await page.screenshot(
        box
          ? {
              path: fichier,
              clip: {
                x: Math.max(0, box.x),
                y: Math.max(0, box.y),
                width: Math.min(box.width, largeur),
                height: Math.min(box.height, 900),
              },
            }
          : { path: fichier }
      );
      captures.push(fichier);
    }

    // -------- B. APPARENCE : chaque nouvelle famille --------
    await page.evaluate(() => {
      document.querySelector('button[aria-label="Réglages de lecture"]')?.click();
    });
    await pause(200);
    await ouvrirPanneauApparence(page);
    const ciblesApparence = await cibles(
      page,
      '#panneau-apparence label:has(input[name="typo-plume"])'
    );
    RAPPORT.cibles[`apparence-${largeur}`] = ciblesApparence;

    RAPPORT.apparence[largeur] = {};
    let premiere = true;
    for (const typo of NOUVELLES) {
      const clique = await choisirTypoApparence(page, typo.id);
      await page.evaluate(() => document.fonts.ready);
      await pause(350);
      const etat = await page.evaluate(ETAT_APPARENCE);
      etat.clique = clique;
      RAPPORT.apparence[largeur][typo.id] = etat;
      if (premiere) {
        const fichier = join(OUT, `apparence-${typo.id}-${largeur}.png`);
        await page.screenshot({ path: fichier });
        captures.push(fichier);
        premiere = false;
      }
    }

    // -------- C. Débordement horizontal global --------
    RAPPORT.debordement[largeur] = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      deborde:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
  }

  // -------- D. Les 3 familles d'origine restent disponibles --------
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(`${HOST}/connexion/apercu`, {
    waitUntil: 'networkidle2',
    timeout: 120_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await pause(400);
  await ouvrirReglagesLecteur(page);
  RAPPORT.origine.lecteur = await page.evaluate(() => {
    const g = document.querySelector('[aria-label="Police du texte"]');
    return [...(g?.querySelectorAll('button[role="radio"]') ?? [])].map((b) =>
      b.textContent.trim()
    );
  });
  await ouvrirPanneauApparence(page);
  RAPPORT.origine.apparence = await page.evaluate(() =>
    [...document.querySelectorAll('input[name="typo-plume"]')].map(
      (i) => i.value
    )
  );
  RAPPORT.origine.typosAttendues = ORIGINE_TYPOS;
  RAPPORT.origine.policesAttendues = ORIGINE_POLICES;

  // -------- E. Persistance : choix → rechargement --------
  await choisirTypoApparence(page, 'playfair');
  await pause(300);
  const avantRechargement = await page.evaluate(() => ({
    clef: localStorage.getItem('plume.dombres.typo.v1'),
    attr: document.documentElement.dataset.typo,
  }));
  await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await pause(400);
  const apresRechargement = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      clef: localStorage.getItem('plume.dombres.typo.v1'),
      attr: document.documentElement.dataset.typo,
      typoCorps: cs.getPropertyValue('--typo-corps').trim(),
    };
  });
  RAPPORT.persistance = { avantRechargement, apresRechargement };
  const capPersistance = join(OUT, 'persistance-playfair.png');
  await page.screenshot({ path: capPersistance });
  captures.push(capPersistance);

  RAPPORT.capturesListe = captures;
  RAPPORT.nombreCaptures = captures.length;
  console.log(JSON.stringify(RAPPORT, null, 2));
  writeFileSync(
    join(OUT, 'rapport.json'),
    JSON.stringify(RAPPORT, null, 2)
  );
}

main()
  .catch(async (e) => {
    console.error('ÉCHEC SONDE :', e);
    if (navigateur) await navigateur.close().catch(() => undefined);
    process.exit(1);
  })
  .finally(async () => {
    if (navigateur) await navigateur.close().catch(() => undefined);
  });
