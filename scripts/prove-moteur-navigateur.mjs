// ============================================================
// scripts/prove-moteur-navigateur.mjs — PREUVE NAVIGATEUR (Edge)
// du moteur de traduction, avec PANNE PROVOQUÉE en direct.
//
//   1. Connexion à l'app (session réelle, cookies).
//   2. Lecture de /api/translate/sante (moteur actif, latences).
//   3. Capture de /admin (état « avant »).
//   4. Traduction RÉELLE via /api/translate (route de production).
//   5. COUPURE du moteur privé (taskkill libretranslate).
//   6. Relecture FORCÉE de la santé + nouvelle traduction : mesure
//      du basculement et du temps perdu.
//   7. Capture de /admin (état « après »).
//
// Usage : node scripts/prove-moteur-navigateur.mjs
// Pré-requis : `npx next dev --webpack -p 3995` lancé ; Edge installé.
// ============================================================

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3995';
const DOSSIER = tmpdir();
const EMAIL = 'moteur-admin@plume-ombres.local';
const MDP = 'PlumeMoteur.2026!';
const PHRASE = 'She pressed her back against the cold stone wall of the alley.';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const resume = {};

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();
await page.setViewport({ width: 1366, height: 900 });

// ---------- 1. Connexion réelle ----------
await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle2', timeout: 90_000 });
// Next doit compiler la page puis React doit s'hydrater avant que le
// clic sur le bouton soit pris en compte : on attend le formulaire.
await page.waitForFunction(
  () => !!document.querySelector('form button[type=submit]'),
  { timeout: 60_000 }
);
await attendre(4000);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', MDP);
await attendre(300);
await page.click('form button[type=submit]');
await attendre(6000);
const cookies = await page.cookies();
const session = cookies.some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
resume.urlApresConnexion = page.url();
resume.session = session ? 'cookie de session posé' : 'AUCUNE session';
if (!session) throw new Error('Connexion échouée : aucun cookie de session.');

/** Lit un JSON depuis la page (session/cookies appliqués). */
async function lireJson(chemin) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  const texte = await page.evaluate(() => document.body.innerText);
  try {
    return JSON.parse(texte);
  } catch {
    return { brut: texte.slice(0, 300) };
  }
}

/** Traduit via la route de PRODUCTION, depuis le navigateur. */
async function traduireViaRoute() {
  await page.goto(`${BASE}/bibliotheque`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  return page.evaluate(async (texte) => {
    const t0 = Date.now();
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte, source: 'en', cible: 'fr' }),
    });
    const corps = await r.json().catch(() => ({}));
    return { statut: r.status, ms: Date.now() - t0, corps };
  }, PHRASE);
}

function moteurActif(sante) {
  return sante.moteurActif ? sante.moteurActif.nom : 'aucun';
}

// ---------- 2/3/4. ÉTAT AVANT ----------
// Préchauffage : le moteur privé charge son modèle au premier appel
// (démarrage à froid) ; on l'écarte des mesures.
await traduireViaRoute();
// On laisse le moteur privé (mono-requête) terminer : sinon la sonde
// parallèle attendrait derrière la traduction en cours et dépasserait
// son délai — un artefact de charge, pas une indisponibilité.
await attendre(4000);

const santeAvant = await lireJson('/api/translate/sante?forcer=1');
resume.santeAvant = {
  priveStrict: santeAvant.priveStrict,
  ordre: santeAvant.ordre,
  moteurActif: moteurActif(santeAvant),
  moteurs: (santeAvant.moteurs ?? []).map((m) => ({
    id: m.id,
    etat: m.etat,
    latenceMs: m.latenceMs,
  })),
};

const tradAvant = await traduireViaRoute();
resume.traductionAvant = {
  statut: tradAvant.statut,
  ms: tradAvant.ms,
  fournisseur: tradAvant.corps.fournisseur ?? null,
  prive: tradAvant.corps.prive ?? null,
  apercu: (tradAvant.corps.traduit ?? tradAvant.corps.erreur ?? '').slice(0, 80),
};

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendre(1500);
const captureAvant = join(DOSSIER, 'moteur-admin-avant.png');
await page.screenshot({ path: captureAvant });
const texteAdminAvant = await page.evaluate(() => document.body.innerText);
resume.adminAvant = (texteAdminAvant.match(/Moteur actif\s*:\s*(.+)/) || [])[1] ?? null;

// ---------- 5. COUPURE du moteur privé ----------
try {
  execSync('taskkill /IM libretranslate.exe /F', { stdio: 'ignore' });
  resume.coupure = 'libretranslate.exe arrêté';
} catch (e) {
  resume.coupure = 'échec taskkill : ' + e.message;
}
await attendre(2500);

// ---------- 6. ÉTAT APRÈS (sondes forcées, mesures) ----------
const t0 = Date.now();
const santeApres = await lireJson('/api/translate/sante?forcer=1');
const santeForceeMs = Date.now() - t0;
resume.santeApres = {
  ms: santeForceeMs,
  moteurActif: moteurActif(santeApres),
  moteurs: (santeApres.moteurs ?? []).map((m) => ({
    id: m.id,
    etat: m.etat,
    cause: m.cause,
    latenceMs: m.latenceMs,
  })),
};

const tradApres = await traduireViaRoute();
resume.traductionApres = {
  statut: tradApres.statut,
  ms: tradApres.ms,
  fournisseur: tradApres.corps.fournisseur ?? null,
  prive: tradApres.corps.prive ?? null,
  apercu: (tradApres.corps.traduit ?? tradApres.corps.erreur ?? '').slice(0, 80),
};

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 90_000 });
await attendre(2500);
const captureApres = join(DOSSIER, 'moteur-admin-apres.png');
await page.screenshot({ path: captureApres });
const texteAdminApres = await page.evaluate(() => document.body.innerText);
resume.adminApres = (texteAdminApres.match(/Moteur actif\s*:\s*(.+)/) || [])[1] ?? null;
resume.captures = { avant: captureAvant, apres: captureApres };
// Contrôle : l'admin ne doit nommer AUCUN moteur hors espace admin.
const textePublic = await (async () => {
  await page.goto(`${BASE}/abonnement`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await attendre(800);
  return page.evaluate(() => document.body.innerText);
})();
resume.fuiteNomMoteurHorsAdmin = /libretranslate|gemini|mymemory|google libre|fournisseur/i.test(
  textePublic
)
  ? 'FUITE DÉTECTÉE'
  : 'aucun nom de moteur exposé';

await navigateur.close();

// ---------- Contrôles ----------
const echecs = [];
if (tradAvant.statut !== 200) echecs.push(`traduction avant : HTTP ${tradAvant.statut}`);
if (tradAvant.corps.fournisseur !== 'libretranslate') {
  echecs.push(`avant coupure, le moteur privé devait servir (obtenu : ${tradAvant.corps.fournisseur})`);
}
if ((santeApres.moteurs ?? []).find((m) => m.id === 'libretranslate')?.etat !== 'indisponible') {
  echecs.push('LibreTranslate devrait être indisponible après la coupure');
}
if (tradApres.statut !== 200) echecs.push(`traduction après : HTTP ${tradApres.statut}`);
if (tradApres.corps.fournisseur === 'libretranslate') {
  echecs.push('la traduction après coupure ne doit pas être servie par le moteur privé');
}
if (resume.fuiteNomMoteurHorsAdmin === 'FUITE DÉTECTÉE') {
  echecs.push('un nom de moteur apparaît hors espace admin');
}

resume.echecs = echecs;
const rapport = join(DOSSIER, 'preuve-moteur.json');
writeFileSync(rapport, JSON.stringify(resume, null, 2), 'utf8');
console.log('RAPPORT ' + rapport);
console.log('RÉSUMÉ_JSON ' + JSON.stringify(resume));
if (echecs.length > 0) {
  console.error('ÉCHECS : ' + echecs.join(' | '));
  process.exit(1);
}
console.log('OK — bascule navigateur vérifiée');
