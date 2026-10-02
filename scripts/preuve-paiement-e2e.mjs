// ============================================================
// scripts/preuve-paiement-e2e.mjs — PREUVE NAVIGATEUR RÉELLE.
//
// Usage : node scripts/preuve-paiement-e2e.mjs
//   (serveur attendu : npx next dev --webpack -p 3992)
//
// Puppeteer-core + Microsoft Edge headless. Parcours complet :
//   1. captures de /tarifs et /abonnement ;
//   2. création d'un compte → l'essai 7 jours est attribué ;
//   3. import de 3 livres → le 4e est REFUSÉ (garde-fou de coût) ;
//   4. un second compte qui réclame le MÊME numéro Mobile Money est
//      REFUSÉ et son essai est révoqué.
//
// Sortie : mesures chiffrées en JSON + captures PNG dans le dossier
// des preuves (par défaut %TEMP%/plume-preuves).
// ============================================================

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.PREUVE_BASE || 'http://localhost:3992';
const EDGE =
  process.env.EDGE_PATH ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DOSSIER =
  process.env.PREUVE_SHOTS || path.join(os.tmpdir(), 'plume-preuves');

const resultats = { base: BASE, captures: [], mesures: {}, etapes: [] };

/** Laisse le temps à React de s'hydrater (dev + build à froid). */
const PATIENCE_HYDRATATION = 4000;

async function patienterHydratation(page, ms = PATIENCE_HYDRATATION) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Attend que React AIT HYDRATÉ l'élément visé : en dev, React pose des
 * propriétés internes (__reactProps$/__reactFiber$) sur le nœud DOM.
 * Sans ce garde-fou, un `uploadFile`/clic peut partir avant que les
 * gestionnaires d'événements soient attachés et rester sans effet.
 */
async function attendreReact(page, selecteur, delai = 40000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return Object.keys(el).some(
        (k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')
      );
    },
    { timeout: delai },
    selecteur
  );
  await patienterHydratation(page, 500);
}

function noter(etape, ok, detail) {
  resultats.etapes.push({ etape, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${etape}${detail ? ` — ${detail}` : ''}`);
}

function texteFichierEssai() {
  const paragraphes = [];
  for (let i = 1; i <= 8; i += 1) {
    paragraphes.push(
      `Chapitre ${i}\n\nLa nuit tombait sur la ville et les ombres dansaient le long des ` +
        `ruelles. Elle referma le livre, le cœur battant, et murmura son nom une ` +
        `dernière fois. Chapitre ${i} se terminait sur ce serment.`
    );
  }
  return paragraphes.join('\n\n');
}

async function attendre(page, predicate, delai = 20000) {
  await page.waitForFunction(predicate, { timeout: delai });
}

async function creerCompte(page, email, pseudo) {
  await page.goto(`${BASE}/connexion?mode=inscription`, {
    waitUntil: 'networkidle2',
  });
  await patienterHydratation(page, 1500);
  await attendreReact(page, 'form');
  await page.type('input[placeholder="Ex. Lectrice de minuit"]', pseudo);
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', 'MotDePasse123!');
  await page.evaluate(() => document.querySelector('form').requestSubmit());
  await page.waitForFunction(
    () => location.pathname.startsWith('/bibliotheque'),
    { timeout: 30000 }
  );
}

async function importerUnLivre(page, cheminFichier) {
  await page.goto(`${BASE}/bibliotheque`, { waitUntil: 'networkidle2' });
  await patienterHydratation(page, 1500);
  await attendreReact(page, 'input[type="file"]');
  const input = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await input.uploadFile(cheminFichier);
  // ZoneImport pousse vers /livres/<id> en cas de succès.
  await page.waitForFunction(
    () =>
      location.pathname.startsWith('/livres/') ||
      /ESSAI_LIVRES_EPUISES|PLafond|Plafond|LIVRES_MOIS_EPUISES/.test(
        document.body.innerText
      ),
    { timeout: 60000 }
  );
  return page.evaluate(() => ({
    url: location.pathname,
    erreur:
      (document.querySelector('.text-grenat-300.bg-grenat-700\\/20')?.innerText ?? null) ||
      null,
  }));
}

async function principal() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const fichierTexte = path.join(DOSSIER, 'manuscrit-essai.txt');
  fs.writeFileSync(fichierTexte, texteFichierEssai(), 'utf8');

  if (!fs.existsSync(EDGE)) {
    throw new Error(`Edge introuvable : ${EDGE}`);
  }

  const navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 1360, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await navigateur.newPage();
  const horodatage = Date.now();
  const suivreApi = (pg) => {
    pg.on('response', async (r) => {
      if (r.url().startsWith(BASE) && r.url().includes('/api/') && r.status() >= 400) {
        let corps = '';
        try {
          corps = (await r.text()).slice(0, 200);
        } catch {
          /* corps indisponible */
        }
        console.log(`[API ${r.status()}] ${r.url().replace(BASE, '')} → ${corps}`);
      }
    });
  };
  suivreApi(page);

  try {
    // ---------- 1. /tarifs (public) ----------
    await page.goto(`${BASE}/tarifs`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.velours', { timeout: 20000 });
    const tarifs = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll('.velours')].filter((c) =>
        c.querySelector('.sur-titre')
      );
      return {
        nbOffres: cartes.length,
        offres: cartes.map((c) => ({
          nom: c.querySelector('.sur-titre')?.textContent?.trim() ?? '',
          prix: c.querySelector('.font-display')?.textContent?.trim() ?? '',
        })),
        contientPrixNonFixe: /prix non encore fixé/i.test(document.body.innerText),
        contientBadge: /7 jours offerts/i.test(document.body.innerText),
        contientNomMoteur: /gemini|libretranslate|mymemory|google/i.test(
          document.body.innerText
        ),
      };
    });
    const shotTarifs = path.join(DOSSIER, 'tarifs.png');
    await page.screenshot({ path: shotTarifs, fullPage: true });
    resultats.captures.push(shotTarifs);
    resultats.mesures.tarifs = tarifs;
    noter(
      '/tarifs — catalogue réel affiché',
      tarifs.nbOffres >= 8 && !tarifs.contientPrixNonFixe,
      `offres=${tarifs.nbOffres}, « Prix non encore fixé »=${tarifs.contientPrixNonFixe}, badge 7 jours=${tarifs.contientBadge}, nom de moteur affiché=${tarifs.contientNomMoteur}`
    );

    // ---------- 2. Compte A : essai attribué ----------
    const emailA = `preuve-essai-a-${horodatage}@plume-test.local`;
    await creerCompte(page, emailA, 'Preuve Essai A');
    const etatA0 = await page.evaluate(() =>
      fetch('/api/essai').then((r) => r.json())
    );
    const jours = etatA0?.essai?.joursRestants ?? null;
    noter(
      'Compte A — essai 7 jours attribué sans carte',
      etatA0?.essai?.actif === true && jours === 7 && etatA0?.plan === 'essai',
      `plan=${etatA0?.plan}, joursRestants=${jours}, livresRestants=${etatA0?.essai?.livresRestants}`
    );

    await page.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.velours', { timeout: 20000 });
    const shotAbonnement = path.join(DOSSIER, 'abonnement-essai.png');
    await page.screenshot({ path: shotAbonnement, fullPage: true });
    resultats.captures.push(shotAbonnement);
    const contenuAbonnement = await page.evaluate(() => document.body.innerText);
    resultats.mesures.abonnementA = {
      afficheBadge7Jours: /7 jours offerts/i.test(contenuAbonnement),
      afficheEssai: /Essai —/i.test(contenuAbonnement),
      afficheNomMoteur: /gemini|libretranslate|mymemory|google/i.test(
        contenuAbonnement
      ),
    };
    noter(
      '/abonnement — badge « 7 jours offerts » et offre d’essai',
      resultats.mesures.abonnementA.afficheBadge7Jours &&
        resultats.mesures.abonnementA.afficheEssai,
      JSON.stringify(resultats.mesures.abonnementA)
    );

    // ---------- 3. Trois livres, puis refus du quatrième ----------
    const imports = [];
    for (let i = 1; i <= 4; i += 1) {
      const r = await importerUnLivre(page, fichierTexte);
      imports.push({ i, ...r });
      if (i <= 3) {
        await page.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2' });
      }
    }
    resultats.mesures.imports = imports;

    const etatAFin = await page.evaluate(() =>
      fetch('/api/essai').then((r) => r.json())
    );
    const refus = imports[3];
    resultats.mesures.apresImports = {
      livresUtilises: etatAFin?.essai?.livresUtilises ?? null,
      livresRestants: etatAFin?.essai?.livresRestants ?? null,
    };
    noter(
      'Essai — 3 livres autorisés',
      imports.slice(0, 3).every((r) => r.url.startsWith('/livres/')),
      JSON.stringify(imports.slice(0, 3).map((r) => r.url))
    );
    noter(
      'Essai — le 4e livre est REFUSÉ (garde-fou 3 livres)',
      /ESSAI_LIVRES_EPUISES/.test(refus?.erreur ?? ''),
      `erreur affichée : ${refus?.erreur}`
    );
    noter(
      'Essai — compteur serveur à 3 livres utilisés',
      etatAFin?.essai?.livresUtilises === 3 &&
        etatAFin?.essai?.livresRestants === 0,
      JSON.stringify(resultats.mesures.apresImports)
    );

    // Captures avant/après refus.
    const shotRefus = path.join(DOSSIER, 'import-4-refuse.png');
    await page.screenshot({ path: shotRefus, fullPage: true });
    resultats.captures.push(shotRefus);

    // ---------- 4. Numéro Mobile Money : A le réclame ----------
    // Numéro UNIQUE par exécution (l'anti-abus persiste en base).
    const telephone = `+229 9${String(horodatage).slice(-7)}`;
    await page.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2' });
    await patienterHydratation(page, 1500);
    await attendreReact(page, '#essai-telephone');
    await page.waitForSelector('#essai-telephone', { timeout: 20000 });
    await page.type('#essai-telephone', telephone);
    await page.evaluate(() => {
      const input = document.querySelector('#essai-telephone');
      input.parentElement.querySelector('button').click();
    });
    await page.waitForFunction(
      () => /Numéro enregistré/.test(document.body.innerText),
      { timeout: 20000 }
    );
    const scellementA = await page.evaluate(() =>
      fetch('/api/essai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => r.json())
    );
    noter(
      'Compte A — numéro Mobile Money enregistré',
      scellementA?.telephoneScelle === true,
      `telephone=${scellementA?.telephone}`
    );

    // ---------- 5. Compte B : même numéro → REFUS ----------
    const emailB = `preuve-essai-b-${horodatage}@plume-test.local`;
    // Nouvel onglet/contexte pour ne pas partager la session A.
    const contexteB = await navigateur.createBrowserContext();
    const pageB = await contexteB.newPage();
    await creerCompte(pageB, emailB, 'Preuve Essai B');
    const etatB0 = await pageB.evaluate(() =>
      fetch('/api/essai').then((r) => r.json())
    );
    await pageB.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2' });
    await patienterHydratation(pageB, 1500);
    await attendreReact(pageB, '#essai-telephone');
    await pageB.waitForSelector('#essai-telephone', { timeout: 20000 });
    await pageB.type('#essai-telephone', telephone);
    await pageB.evaluate(() => {
      const input = document.querySelector('#essai-telephone');
      input.parentElement.querySelector('button').click();
    });
    await pageB.waitForFunction(
      () => /déjà servi à un essai gratuit/.test(document.body.innerText),
      { timeout: 20000 }
    );
    const messageRefusB = await pageB.evaluate(
      () => document.querySelector('.text-grenat-300')?.textContent?.trim() ?? ''
    );
    const shotRefusB = path.join(DOSSIER, 'essai-b-refuse.png');
    await pageB.screenshot({ path: shotRefusB, fullPage: true });
    resultats.captures.push(shotRefusB);
    const etatBFin = await pageB.evaluate(() =>
      fetch('/api/abonnement').then((r) => r.json())
    );
    resultats.mesures.compteB = {
      essaiInitialActif: etatB0?.essai?.actif ?? null,
      planApresRefus: etatBFin?.plan ?? null,
      statutApresRefus: etatBFin?.statut ?? null,
      messageRefus: messageRefusB,
    };
    noter(
      'Compte B — essai initial attribué (comptes distincts)',
      etatB0?.essai?.actif === true,
      `plan=${etatB0?.plan}`
    );
    noter(
      'Compte B — même numéro → essai REFUSÉ et révoqué',
      etatBFin?.plan === 'gratuit' &&
        /déjà servi à un essai gratuit/.test(messageRefusB),
      JSON.stringify(resultats.mesures.compteB)
    );
    await contexteB.close();

    // ---------- 5b. Tunnel FedaPay en simulation (compte A) ----------
    await page.goto(`${BASE}/paiement/lecteur_mensuel`, {
      waitUntil: 'networkidle2',
    });
    await patienterHydratation(page, 1500);
    await attendreReact(page, '#tel-lecteur_mensuel');
    await page.waitForSelector('#tel-lecteur_mensuel', { timeout: 20000 });
    await page.type('#tel-lecteur_mensuel', '22997000001');
    await page.evaluate(() => {
      const champ = document.querySelector('#tel-lecteur_mensuel');
      champ.closest('.space-y-3').querySelector('button').click();
    });
    await patienterHydratation(page, 1500);
    try {
      await page.waitForFunction(
        () => location.pathname.startsWith('/paiement/simulation'),
        { timeout: 25000 }
      );
    } catch {
      /* diagnostic ci-dessous */
    }
    const diagPaiement = await page.evaluate(() => ({
      url: location.pathname,
      texte: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 300),
    }));
    if (!diagPaiement.url.startsWith('/paiement/simulation')) {
      noter(
        'Tunnel simulation — redirection vers le guichet',
        false,
        `URL=${diagPaiement.url} · ${diagPaiement.texte}`
      );
    } else {
      noter('Tunnel simulation — redirection vers le guichet', true, diagPaiement.url);
    }
    if (diagPaiement.url.startsWith('/paiement/simulation')) {
    const shotGuichet = path.join(DOSSIER, 'paiement-simulation.png');
    await page.screenshot({ path: shotGuichet, fullPage: true });
    resultats.captures.push(shotGuichet);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          /Simuler un paiement réussi/.test(b.textContent ?? '')
        ),
      { timeout: 30000 }
    );
    await page.evaluate(() => {
      const bouton = [...document.querySelectorAll('button')].find((b) =>
        /Simuler un paiement réussi/.test(b.textContent ?? '')
      );
      bouton.click();
    });
    await patienterHydratation(page, 2000);
    try {
      await page.waitForFunction(
        () => location.pathname.startsWith('/paiement/succes'),
        { timeout: 25000 }
      );
    } catch {
      /* le diagnostic ci-dessous explique l'échec */
    }
    const diagSucces = await page.evaluate(() => ({
      url: location.pathname,
      texte: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 800),
    }));
    if (!diagSucces.url.startsWith('/paiement/succes')) {
      noter(
        'Tunnel simulation — confirmation → succès',
        false,
        `URL=${diagSucces.url} · ${diagSucces.texte}`
      );
    } else {
      noter('Tunnel simulation — confirmation → succès', true, diagSucces.url);
    }
    await patienterHydratation(page, 1500);
    const aboApresPaiement = await page.evaluate(() =>
      fetch('/api/abonnement').then((r) => r.json())
    );
    const shotSucces = path.join(DOSSIER, 'paiement-succes.png');
    await page.screenshot({ path: shotSucces, fullPage: true });
    resultats.captures.push(shotSucces);
    resultats.mesures.paiementSimulation = {
      plan: aboApresPaiement?.plan ?? null,
      statut: aboApresPaiement?.statut ?? null,
      periodeFin: aboApresPaiement?.periodeFin ?? null,
    };
    noter(
      'Tunnel simulation — paiement confirmé → abonnement ACTIF',
      aboApresPaiement?.plan === 'lecteur_mensuel' &&
        aboApresPaiement?.statut === 'actif',
      JSON.stringify(resultats.mesures.paiementSimulation)
    );

    // ---------- 5c. Numéro libéré après le premier paiement ----------
    const registreA = await page.evaluate(() =>
      fetch('/api/essai').then((r) => r.json())
    );
    const contexteC = await navigateur.createBrowserContext();
    const pageC = await contexteC.newPage();
    await creerCompte(
      pageC,
      `preuve-essai-c-${horodatage}@plume-test.local`,
      'Preuve Essai C'
    );
    await pageC.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2' });
    await patienterHydratation(pageC, 1500);
    await attendreReact(pageC, '#essai-telephone');
    await pageC.waitForSelector('#essai-telephone', { timeout: 20000 });
    await pageC.type('#essai-telephone', telephone);
    await pageC.evaluate(() => {
      const input = document.querySelector('#essai-telephone');
      input.parentElement.querySelector('button').click();
    });
    await pageC.waitForFunction(
      () => /Numéro enregistré/.test(document.body.innerText),
      { timeout: 20000 }
    );
    resultats.mesures.liberation = {
      compteAPaye: registreA?.dejaPaye ?? null,
      compteCAccepte: true,
    };
    noter(
      'Numéro libéré après le premier paiement (compte C accepté)',
      registreA?.dejaPaye === true,
      JSON.stringify(resultats.mesures.liberation)
    );
    await contexteC.close();
    }

    // ---------- 6. Récapitulatif ----------
    resultats.mesures.preuve = {
      offreTarifs: resultats.mesures.tarifs.offres,
      essaiJoursA: jours,
      essaiLivresUtilises: etatAFin?.essai?.livresUtilises,
      importsAutorises: imports.slice(0, 3).map((r) => r.url),
      quatriemeImportRefuse: refus?.erreur,
      telephoneScelle: telephone,
      compteBPlanApresRefus: etatBFin?.plan,
      paiementSimulation: resultats.mesures.paiementSimulation,
      liberationNumero: resultats.mesures.liberation,
    };
  } finally {
    await navigateur.close();
  }

  const fichierResultat = path.join(DOSSIER, 'resultats.json');
  fs.writeFileSync(fichierResultat, JSON.stringify(resultats, null, 2), 'utf8');
  console.log('\n— Mesures —');
  console.log(JSON.stringify(resultats.mesures.preuve, null, 2));
  console.log(`\nCaptures : ${resultats.captures.join(' | ')}`);
  console.log(`Résultats : ${fichierResultat}`);

  const echecs = resultats.etapes.filter((e) => !e.ok);
  if (echecs.length > 0) {
    console.error(`\n✗ ${echecs.length} étape(s) en échec`);
    process.exit(1);
  }
  console.log('\n✓ Parcours complet prouvé');
}

principal().catch((e) => {
  console.error('Échec de la preuve :', e);
  process.exit(1);
});
