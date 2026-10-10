// ============================================================
// Sonde réelle des OFFRES PUBLIQUES et des PAGES JURIDIQUES.
//
// Prouve par le navigateur (Edge headless + puppeteer-core), et non par le
// regard, que :
//   1. /tarifs affiche TOUTES les formules achetables de la base, y compris
//      les formule ANNUELLES (lecteur_annuel 14 400 F, passionne_annuel
//      33 600 F), avec prix, durée 12 mois, économie et lien de paiement ;
//   2. aux largeurs 360 / 768 / 1440 px : AFFICHAGE complet, AUCUN
//      débordement horizontal, cibles tactiles ≥ 44 px ;
//   3. les pages juridiques (/conditions, /confidentialite,
//      /mentions-legales, /remboursement, /cookies, /contact) répondent en
//      HTTP < 400, s'affichent sans compte, ne contiennent AUCUN texte de
//      gabarit (lorem ipsum, « à compléter », « prix non encore fixé ») et
//      couvrent les points exigés d'un produit payé par Mobile Money.
//
// Usage : node scripts/probe-offres-publiques.mjs
// Pré-requis : `npx next dev --webpack -p 3984` lancé, Edge installé.
// Sortie : captures PNG + rapport JSON dans %LOCALAPPDATA%\Temp\offres-publiques.
// ============================================================

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { Client as ClientPg } from 'pg';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3984';
const CAPTURES = join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'offres-publiques');
mkdirSync(CAPTURES, { recursive: true });

const LARGEURS = [360, 768, 1440];

// Pages juridiques et mots-clés EXIGÉS pour un produit payé par Mobile Money.
const PAGES_LEGALES = [
  { chemin: '/conditions', nom: 'conditions', exige: ['mobile money', 'rétractation', 'résiliation', 'prix', 'durée', 'remboursement'] },
  { chemin: '/confidentialite', nom: 'confidentialite', exige: ['responsable du traitement', 'données', 'cookies', 'sous-traitants'] },
  { chemin: '/mentions-legales', nom: 'mentions-legales', exige: ['éditeur', 'hébergeurs', 'publication', 'propriété intellectuelle'] },
  { chemin: '/remboursement', nom: 'remboursement', exige: ['remboursement', 'rétractation', 'contenu numérique', 'mobile money'] },
  { chemin: '/cookies', nom: 'cookies', exige: ['cookie', 'session', 'traceur'] },
  { chemin: '/contact', nom: 'contact', exige: ['contact'] },
];

// Marqueurs de GABARIT à proscrire (texte réellement rendu).
const INTERDITS = ['lorem ipsum', '[à compléter', 'prix non encore fixé', 'à compléter —'];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? '').replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/\s+/g, ' ');

const echecs = [];
function verdict(nom, ok, detail = '') {
  if (!ok) echecs.push(nom);
  console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`);
}

// --- Catalogue en base (source de vérité, pour comparer au DOM) --------------
function lireEnvLocal(cle) {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
  return ligne.split('=').slice(1).join('=').trim();
}
const pg = new ClientPg({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await pg.connect();
const { rows: plans } = await pg.query(
  `select code, prix_xof, duree_jours, categorie, actif, masque, alias_de
   from public.plans_abonnement order by ordre, code`
);
await pg.end();
const parCode = Object.fromEntries(plans.map((p) => [p.code, p]));
console.log(
  `Base : ${plans.length} plans. Annuels attendus : ` +
    `lecteur_annuel=${parCode.lecteur_annuel?.prix_xof} F, ` +
    `passionne_annuel=${parCode.passionne_annuel?.prix_xof} F\n`
);

// --- Mesures navigateur (motif repris de probe-admin-w8w9.mjs) ---------------
const MESURE_TARGETS = `(() => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"]';
  // Le sujet est la grille d'offres (la page /tarifs est responsable de
  // ses cartes et boutons) ; le chrome global est mesuré à part.
  const racine = document.querySelector('#tarifs-offres') || document.body;
  const out = [];
  for (const el of racine.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    const enLigne = el.tagName === 'A' && cs.display === 'inline';
    out.push({
      tag: el.tagName.toLowerCase(),
      texte: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0, 48),
      largeur: Math.round(r.width), hauteur: Math.round(r.height),
      exige44: !enLigne,
    });
  }
  return out;
})()`;

// Chrome global (nav/footer) — mesuré à part, à titre informatif.
const MESURE_TARGETS_PAGE = `(() => {
  const SEL = 'a[href], button, input, select, textarea, [role="button"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    if (el.closest('#tarifs-offres')) continue;
    const enLigne = el.tagName === 'A' && cs.display === 'inline';
    if (enLigne) continue;
    if (r.height < 44 || r.width < 44) {
      out.push((el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
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

const MESURE_OFFRES = `(() => {
  const liens = [...document.querySelectorAll('a[href^="/paiement/"]')]
    .map((a) => a.getAttribute('href'));
  const cartes = [...document.querySelectorAll('article[aria-label^="Offre "]')]
    .map((a) => a.getAttribute('aria-label'));
  const annuels = [...document.querySelectorAll('a[href^="/paiement/"][class*="bouton-fantome"]')]
    .map((a) => a.getAttribute('href'));
  return {
    liensPaiement: [...new Set(liens)].sort(),
    liensAnnuels: [...new Set(annuels)].sort(),
    cartes,
    texte: document.body.innerText,
  };
})()`;

// --- Exécution --------------------------------------------------------------
const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars'],
});

const rapport = { base: BASE, horodatage: new Date().toISOString(), offres: {}, largeurs: {}, legales: {}, captures: [] };

// ---------- A. /tarifs : offres annuelles visibles --------------------------
console.log('=== A. /tarifs : formules visibles (1440 px) ===');
{
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const rep = await page.goto(`${BASE}/tarifs`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await dormir(900);
  const statut = rep?.status() ?? null;
  const mes = await page.evaluate(MESURE_OFFRES);
  const texte = norm(mes.texte);

  verdict('A.0 /tarifs répond 200', statut === 200, String(statut));
  rapport.offres = { statut, liensPaiement: mes.liensPaiement, liensAnnuels: mes.liensAnnuels, cartes: mes.cartes };

  // Les deux formules annuelles : lien + prix + durée + économie.
  const cas = [
    { code: 'lecteur_annuel', prix: parCode.lecteur_annuel.prix_xof },
    { code: 'passionne_annuel', prix: parCode.passionne_annuel.prix_xof },
  ];
  for (const c of cas) {
    verdict(`A.1 lien de paiement /paiement/${c.code} présent`, mes.liensPaiement.includes(`/paiement/${c.code}`));
    const prixTexte = `${c.prix.toLocaleString('fr-FR')} F CFA`;
    verdict(`A.2 prix annuel affiché (${prixTexte})`, texte.includes(norm(prixTexte)));
  }
  verdict('A.3 durée « 12 mois » affichée pour les annuelles', texte.toLowerCase().includes('12 mois'));
  verdict('A.4 économie affichée (« 20 % »)', texte.includes('20 %'));
  verdict('A.5 les mensuelles achetabables sont liées', ['lecteur_mensuel', 'passionne_mensuel'].every((c) => mes.liensPaiement.includes(`/paiement/${c}`)));
  verdict('A.6 aucune formule NON achetable liée (illimité/étudiant/groupe/école/premium)',
    !mes.liensPaiement.some((h) => /illimite|etudiant|groupe|ecole|premium/.test(h)),
    mes.liensPaiement.join(' '));
  verdict('A.7 la grille affiche 3 cartes (Gratuit + Lecteur + Passionné)', mes.cartes.length === 3, String(mes.cartes.length));

  const cap = join(CAPTURES, 'offres-tarifs-1440.png');
  await page.screenshot({ path: cap, fullPage: true });
  rapport.captures.push(cap);
  await page.close();
}

// ---------- B. /tarifs : 360 / 768 / 1440 px --------------------------------
console.log('\n=== B. /tarifs : 360 / 768 / 1440 px (débordement, cibles 44 px) ===');
for (const largeur of LARGEURS) {
  const page = await navigateur.newPage();
  await page.setViewport({ width: largeur, height: largeur <= 480 ? 844 : 900, isMobile: largeur <= 480, hasTouch: largeur <= 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/tarifs`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await dormir(900);
  const deb = await page.evaluate(MESURE_DEBORDEMENT);
  const cibles = await page.evaluate(MESURE_TARGETS);
  const paysageChrome = await page.evaluate(MESURE_TARGETS_PAGE);
  const petites = cibles.filter((c) => c.exige44 && (c.hauteur < 44 || c.largeur < 44));
  const mes = await page.evaluate(MESURE_OFFRES);
  const texte = norm(mes.texte);

  verdict(`B.${largeur} aucun débordement horizontal`, !deb.deborde, `scrollWidth=${deb.scrollWidth} client=${deb.clientWidth}${deb.coupables.length ? ' coupables=' + JSON.stringify(deb.coupables) : ''}`);
  verdict(`B.${largeur} cibles tactiles des offres ≥ 44 px`, petites.length === 0, petites.map((p) => `${p.texte}(${p.largeur}×${p.hauteur})`).join(', '));
  verdict(`B.${largeur} les deux annuelles restent affichées`, texte.includes('14 400 F CFA') && texte.includes('33 600 F CFA'));
  if (paysageChrome.length) {
    console.log(`   (info — chrome global < 44 px, pré-existant : ${paysageChrome.join(' | ')})`);
  }

  const cap = join(CAPTURES, `offres-tarifs-${largeur}.png`);
  await page.screenshot({ path: cap, fullPage: true });
  rapport.largeurs[largeur] = { debordement: deb, ciblesEnDefaut: petites.map((p) => `${p.texte} ${p.largeur}x${p.hauteur}`), chromeGlobalEnDefaut: paysageChrome };
  rapport.captures.push(cap);
  await page.close();
}

// ---------- C. Pages juridiques ---------------------------------------------
console.log('\n=== C. Pages juridiques : statut, contenu, absence de gabarit ===');
for (const p of PAGES_LEGALES) {
  // 3.1 statut HTTP < 400 (fetch simple, sans session).
  let statut = null;
  try {
    const r = await fetch(`${BASE}${p.chemin}`, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    statut = r.status;
  } catch (e) {
    statut = null;
  }
  verdict(`C ${p.chemin} répond < 400`, statut !== null && statut < 400, String(statut));

  // 3.2 rendu réel : capture + texte.
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  try {
    await page.goto(`${BASE}${p.chemin}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  } catch {
    /* statut déjà relevé */
  }
  await dormir(600);
  const brut = await page.evaluate(() => document.body.innerText);
  const texte = norm(brut).toLowerCase();
  const cap = join(CAPTURES, `legal-${p.nom}.png`);
  await page.screenshot({ path: cap, fullPage: true });
  rapport.captures.push(cap);
  await page.close();

  const interdits = INTERDITS.filter((m) => texte.includes(m.toLowerCase()));
  verdict(`C ${p.chemin} sans texte de gabarit`, interdits.length === 0, interdits.join(', '));

  const manquants = p.exige.filter((m) => !texte.includes(m.toLowerCase()));
  verdict(`C ${p.chemin} couvre les points exigés`, manquants.length === 0, manquants.length ? 'manque: ' + manquants.join(', ') : '');

  rapport.legales[p.chemin] = { statut, longueur: texte.length, interdits, manquants };
}

await navigateur.close();

rapport.echecs = echecs;
const sortie = join(CAPTURES, 'rapport.json');
writeFileSync(sortie, JSON.stringify(rapport, null, 2), 'utf8');

console.log('\n===== VERDICT =====');
console.log(`${echecs.length === 0 ? '✓ Tous les verdicts passent' : `✗ ${echecs.length} verdict(s) en échec`}`);
console.log('Captures :', CAPTURES);
console.log('Rapport  :', sortie);
process.exit(echecs.length === 0 ? 0 : 1);
