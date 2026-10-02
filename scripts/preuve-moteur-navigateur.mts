// ============================================================
// scripts/preuve-moteur-navigateur.mts — PREUVE NAVIGATEUR (Edge
// headless, CDP via puppeteer-core).
//
// Deux temps, pour prouver le comportement RÉEL :
//   --phase=avant : la santé est refusée SANS session (401,
//     contexte isolé), puis on se connecte en admin (ou on réutilise
//     la session), on lit la santé RÉELLE et on capture /admin.
//   --phase=apres : après avoir coupé le moteur privé ET redémarré le
//     serveur (cache vidé), la santé montre le privé indisponible et
//     le moteur actif basculé.
//
// Usage : npx tsx scripts/preuve-moteur-navigateur.mts --phase=avant
// ============================================================

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3995';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PHASE = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] ?? 'avant';

const DOSSIER = join(tmpdir(), 'preuve-moteur');
mkdirSync(DOSSIER, { recursive: true });
const PROFIL = join(DOSSIER, 'profil');

const EMAIL = 'moteur-admin@plume-ombres.local';
const MDP = 'PlumeMoteur.2026!';

const REMPLIR = `(() => {
  const poser = (el, v) => {
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  poser(document.querySelector('input[type=email]'), ${JSON.stringify(EMAIL)});
  poser(document.querySelector('input[type=password]'), ${JSON.stringify(MDP)});
})()`;

async function principal() {
  const navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    userDataDir: PROFIL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=fr-FR'],
  });

  const lireJson = async (page: import('puppeteer-core').Page, chemin: string) => {
    await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded' });
    const txt = (await page.evaluate('document.body.innerText')) as string;
    try {
      return JSON.parse(txt) as Record<string, unknown>;
    } catch {
      return { brut: txt.slice(0, 200) };
    }
  };

  // ---------- 1. Accès ANONYME (contexte isolé, sans cookies) ----------
  const contexteIsolé = await navigateur.createBrowserContext();
  const pageAnonyme = await contexteIsolé.newPage();
  const reponseAnonyme = await pageAnonyme.goto(BASE + '/api/translate/sante', {
    waitUntil: 'domcontentloaded',
  });
  console.log(
    `1) santé SANS session : HTTP ${reponseAnonyme?.status()} —`,
    ((await pageAnonyme.evaluate('document.body.innerText')) as string).slice(0, 80)
  );
  await contexteIsolé.close();

  // ---------- 2. Session admin (connexion si nécessaire) ----------
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1280, height: 1100 });
  await page.goto(BASE + '/connexion?suivant=/admin', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 2500));

  if (page.url().includes('/connexion')) {
    await page.waitForSelector('input[type=email]', { timeout: 30000 });
    for (let essai = 1; essai <= 3; essai++) {
      await page.evaluate(REMPLIR);
      await new Promise((r) => setTimeout(r, 1000));
      await page.click('button[type=submit]');
      await page
        .waitForFunction(() => !location.pathname.startsWith('/connexion'), { timeout: 20000 })
        .catch(() => null);
      if (!page.url().includes('/connexion')) break;
      console.log(`   (tentative ${essai} : toujours sur /connexion)`);
    }
    await new Promise((r) => setTimeout(r, 2500));
    console.log('2) connexion admin :', page.url());
  } else {
    console.log('2) session admin déjà active :', page.url());
  }

  // ---------- 3. Santé réelle (fond frais) ----------
  const sante = (await lireJson(page, '/api/translate/sante?forcer=1')) as {
    moteurActif?: { nom: string; prive: boolean };
    ordre?: string[];
    priveStrict?: boolean;
    moteurs?: Array<{ id: string; etat: string; latenceMs: number | null; prive: boolean }>;
  };
  console.log('3) santé réelle :');
  console.log('   ordre        :', (sante.ordre ?? []).join(' → '));
  console.log('   privé strict :', sante.priveStrict);
  console.log(
    '   moteur actif :',
    sante.moteurActif ? `${sante.moteurActif.nom} (privé=${sante.moteurActif.prive})` : 'aucun'
  );
  for (const m of sante.moteurs ?? []) {
    console.log(`     - ${m.id.padEnd(15)} ${m.etat.padEnd(13)} latence=${m.latenceMs ?? '—'} ms`);
  }

  // ---------- 4. Écran admin ----------
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 2500));
  const apercu = (await page.evaluate(
    `(() => {
      const sections = Array.from(document.querySelectorAll('section'));
      const bloc = sections.find((s) => (s.textContent || '').includes('Moteur actif'));
      return ((bloc ? bloc.textContent : document.body.innerText) || '')
        .replace(/\\s+/g, ' ')
        .slice(0, 500);
    })()`
  )) as string;
  const chemin = join(DOSSIER, `admin-${PHASE}.png`);
  await page.screenshot({ path: chemin, fullPage: false });
  console.log('4) aperçu admin :', apercu);
  console.log('CAPTURE', chemin);

  await navigateur.close();
}

principal().catch((e) => {
  console.error('ECHEC', e instanceof Error ? e.message : e);
  process.exit(1);
});
