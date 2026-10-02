// Capture réelle du décor de fond d'ambiance (CSS, palette-aware) dans Edge headless.
// Usage : npx tsx scripts/capture-fond.ts [sortie.png] [livreId]
//   (URL de base : variable NEXT_DEV_URL, défaut http://localhost:3000)
// Preuve : 1) la page chargée peint le décor [data-decor-fond] ; 2) il est
// derrière le contenu (z-index négatif) ; 3) le lecteur translucide laisse
// passer la brume.
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE =
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.NEXT_DEV_URL || 'http://localhost:3000';
const CIBLE = process.argv[2];
const LIVRE_ID = process.argv[3]; // id du livre de démo (arg 3)

async function principal() {
  const demo = JSON.parse(
    readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'),
  );
  // Cookie @supabase/ssr (strategy COOKIE) : préfixe « base64- » + base64url.
  const valeurCookie =
    'base64-' +
    Buffer.from(JSON.stringify(demo.session.session), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const profil = join(tmpdir(), 'edge-shader-profil');
  mkdirSync(profil, { recursive: true });

  const navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    userDataDir: profil,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DualModeSettings',
    ],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  });

  const onglet = await navigateur.newPage();
  const messages: string[] = [];
  onglet.on('console', (m) => messages.push(`[${m.type()}] ${m.text()}`));
  onglet.on('pageerror', (e: unknown) =>
      messages.push(
        `[pageerror] ${e instanceof Error ? e.message : String(e)}`,
      ),
    );

  try {
    // 1. Poser le jeton de session (strategy COOKIE de @supabase/ssr).
    await onglet.goto(`${BASE}/connexion`, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });
    await onglet.setCookie({
      name: 'sb-imbziizequckeaxuotdz-auth-token',
      value: valeurCookie,
      domain: 'localhost',
      path: '/',
    });

    // 2. Page du livre de démo — le lecteur translucide + le décor de fond.
    await onglet.goto(`${BASE}/livres/${LIVRE_ID}`, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });
    // Laisse le décor se peindre (la brume dérive lentement).
    await new Promise((r) => setTimeout(r, 4000));
    // Ouvre le 1er chapitre pour afficher le lecteur translucide.
    const ouvert = await onglet.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('aside nav button, nav button'),
      ).filter((b) => b.textContent && b.textContent.length > 1);
      const cible = btns[0] as HTMLElement | undefined;
      if (!cible) return 'aucun bouton chapitre trouvé';
      cible.click();
      return `clic sur « ${cible.textContent} »`;
    });
    console.log('LECTEUR :', ouvert);
    await new Promise((r) => setTimeout(r, 3000));

    const etat = await onglet.evaluate(() => {
      const decor = document.querySelector('[data-decor-fond]') as HTMLElement | null;
      const lecteur = document.querySelector('.lecture-transparente');
      const cs = decor ? getComputedStyle(decor) : null;
      return {
        decorPresent: !!decor,
        decorAffiche: decor ? cs!.display !== 'none' : null,
        decorZIndex: decor ? cs!.zIndex : null,
        decorOpacite: decor ? cs!.opacity : null,
        lecteurPresent: !!lecteur,
        dataFond: document.documentElement.dataset.fond ?? null,
        palette: document.documentElement.dataset.palette ?? null,
        titreDocument: document.title,
      };
    });
    console.log('ÉTAT PAGE :', JSON.stringify(etat));

    // 3. Captures : avant-après pour prouver que le décor EST vivant.
    const rep = join(tmpdir(), 'shader-shots');
    mkdirSync(rep, { recursive: true });
    const t0 = join(rep, 'fond-t0.png');
    await onglet.screenshot({ path: t0, fullPage: false });
    await new Promise((r) => setTimeout(r, 5000));
    await onglet.screenshot({ path: CIBLE, fullPage: false });
    console.log('CAPTURE T0 :', t0);
    console.log('CAPTURE T+5s :', CIBLE);
  } finally {
    await navigateur.close();
  }
  const bruit = messages.filter(
    (m) =>
      !m.includes('Download the React DevTools') &&
      !m.startsWith('[LOG] Warning'),
  );
  console.log('CONSOLE :', bruit.length ? bruit.join(' | ') : 'silencieux');
}

principal().catch((e) => {
  console.error('ÉCHEC CAPTURE :', e);
  process.exit(1);
});