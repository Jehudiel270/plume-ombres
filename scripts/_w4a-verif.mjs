// JETABLE (vérification F5) — rendu, réglages au clavier, persistance, perf.
// Usage : node scripts/_w4a-verif.mjs <largeur> [--shot fichier.png] [--prefs2]
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3971';
const LARGEUR = Number(process.argv[2] || 1366);
const shotIdx = process.argv.indexOf('--shot');
const SHOT = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();
await page.setViewport(
  LARGEUR <= 400
    ? { width: LARGEUR, height: 844, isMobile: true, hasTouch: true }
    : { width: LARGEUR, height: 900 }
);
await page.evaluateOnNewDocument(() => {
  window.__commits = 0;
  window.__hook = {
    renderers: new Map(), supportsFiber: true, inject() { return 1; },
    onCommitFiberRoot() { window.__commits += 1; },
    onCommitFiberUnmount() {}, checkDCE() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: window.__hook, configurable: true });
});
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});

const ouvrirChapitreLong = async () => {
  await page.goto(`${HOST}/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await page.waitForSelector('#corps-livre', { timeout: 40_000 });
  await page.evaluate(() => {
    if (window.innerWidth < 1024) document.querySelector('[aria-label="Ouvrir le sommaire"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('aside button')];
    (bs.find((x) => /corridor/i.test(x.textContent)) ?? bs[1])?.click();
  });
  await page.evaluate(() => document.querySelector('[aria-label="Fermer le sommaire"]')?.click());
  await page.waitForFunction(() => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000, { timeout: 40_000 });
  await new Promise((r) => setTimeout(r, 1400));
};
await ouvrirChapitreLong();

// --- 1) Mesures typographiques réellement calculées ---------------------
const lireTypo = () =>
  page.evaluate(() => {
    const corps = document.querySelector('#corps-livre');
    const p = corps?.querySelector('p') ?? corps;
    const cs = p ? getComputedStyle(p) : null;
    const boite = corps?.querySelector('p')?.getBoundingClientRect();
    const conteneur = document.querySelector('.colonne-lecture');
    const csC = conteneur ? getComputedStyle(conteneur) : null;
    const ch = (() => {
      const el = document.createElement('span');
      el.textContent = 'n'.repeat(100);
      el.style.cssText = `position:absolute;visibility:hidden;font-family:${cs?.fontFamily};font-size:${cs?.fontSize}`;
      document.body.appendChild(el);
      const m = el.getBoundingClientRect().width / 100;
      el.remove();
      return m;
    })();
    return {
      octets: corps?.textContent?.length ?? 0,
      noeuds_page: document.querySelectorAll('*').length,
      paragraphes: corps?.querySelectorAll('p').length ?? 0,
      scenes: corps?.querySelectorAll('.scene-separateur, [data-scene]').length ?? 0,
      paquets: corps?.children.length ?? 0,
      taille_px: cs ? parseFloat(cs.fontSize) : null,
      interligne_px: cs ? Math.round(parseFloat(cs.lineHeight) * 10) / 10 : null,
      interligne_ratio: cs && cs.lineHeight !== 'normal' ? Math.round((parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)) * 100) / 100 : null,
      alignement: cs?.textAlign ?? null,
      cesure: cs?.hyphens ?? null,
      retrait: cs?.textIndent ?? null,
      marge_haut_para: cs?.marginTop ?? null,
      colonnes: cs?.columnCount ?? null,
      largeur_colonne_px: boite ? Math.round(boite.width) : null,
      caracteres_par_ligne: boite && ch ? Math.round(boite.width / ch) : null,
      max_width_conteneur: csC?.maxWidth ?? null,
      padding_conteneur: csC?.paddingLeft ?? null,
      hauteur_doc: document.documentElement.scrollHeight,
    };
  });

const typoAvant = await lireTypo();

// --- 2) Panneau de réglages : ouverture, contenu, clavier ---------------
const boutonReglages = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    /Aa/.test(x.textContent) || /Réglages de lecture|Confort/i.test(x.getAttribute('aria-label') || x.title || ''));
  if (!b) return null;
  b.setAttribute('data-cible-reglages', '1');
  b.focus();
  return {
    texte: b.textContent.trim(),
    aria: { expanded: b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup'), controls: b.getAttribute('aria-controls'), label: b.getAttribute('aria-label') },
  };
});
const ouvertureClavier = await page.evaluate(() => {
  const b = document.querySelector('[data-cible-reglages]');
  b?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  b?.click();
  return true;
});
await new Promise((r) => setTimeout(r, 400));
const panneau = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const controles = [...d.querySelectorAll('input, button, select, [role=radiogroup], [role=slider]')].map((e) => ({
    tag: e.tagName,
    type: e.getAttribute('type'),
    role: e.getAttribute('role'),
    label: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30),
    valuetext: e.getAttribute('aria-valuetext'),
    valeur: e.value ?? null,
    min: e.getAttribute('min'),
    max: e.getAttribute('max'),
    groupe: e.closest('[role=radiogroup]')?.getAttribute('aria-label') ?? null,
  }));
  return { champs: controles, nb: controles.length };
});
if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '_panneau.png') });

// Tous les curseurs : pilotage clavier (flèches) → effet visuel mesuré.
const effetsClavier = [];
const curseurs = await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] input[type=range]')].map((e) => e.getAttribute('aria-label'))
);
for (let i = 0; i < curseurs.length; i += 1) {
  const avant = await lireTypo();
  await page.evaluate((idx) => {
    const el = [...document.querySelectorAll('[role=dialog] input[type=range]')][idx];
    el.focus();
  }, i);
  for (let k = 0; k < 4; k += 1) await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 120));
  const apres = await lireTypo();
  effetsClavier.push({
    curseur: curseurs[i],
    change: JSON.stringify(avant) !== JSON.stringify(apres),
    valeur: await page.evaluate((idx) => document.querySelectorAll('[role=dialog] input[type=range]')[idx].getAttribute('aria-valuetext') ?? document.querySelectorAll('[role=dialog] input[type=range]')[idx].value, i),
  });
}

// Options exclusives : clic sur chaque bouton radio + vérification de l'effet.
const bascules = [];
const cibles = await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] [role=radiogroup]')].map((g) => g.getAttribute('aria-label') ?? g.querySelector('[role=radio]')?.getAttribute('aria-label') ?? 'groupe')
);
for (let g = 0; g < cibles.length; g += 1) {
  const nb = await page.evaluate((gi) => document.querySelectorAll('[role=dialog] [role=radiogroup]')[gi]?.querySelectorAll('[role=radio]').length ?? 0, g);
  for (let r = 0; r < nb; r += 1) {
    await page.evaluate(([gi, ri]) => {
      const b = document.querySelectorAll('[role=dialog] [role=radiogroup]')[gi]?.querySelectorAll('[role=radio]')[ri];
      b?.click();
    }, [g, r]);
    await new Promise((res) => setTimeout(res, 120));
    const t = await lireTypo();
    bascules.push({ groupe: cibles[g], option: r, colonnes: t.colonnes, taille: t.taille_px, alignement: t.alignement, retrait: t.retrait, caractères: t.caracteres_par_ligne, aligné: t.alignement === 'justify' });
  }
}

// Persistance : rechargement → les préférences choisies sont réappliquées.
const stockage = await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (/prefs/i.test(k)) return { cle: k, valeur: localStorage.getItem(k) };
  }
  return null;
});

// Échap : fermeture + retour du focus au bouton.
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 250));
const apresEchap = await page.evaluate(() => ({
  panneauPresent: !!document.querySelector('[role=dialog]'),
  focusSurBouton: document.activeElement?.hasAttribute('data-cible-reglages') ?? false,
  activeTag: document.activeElement?.tagName ?? null,
}));

// Perf : scénario identique à la mesure de référence (frappe, occurrences,
// défilement, bascule), panneau fermé.
const mesurer = () => page.metrics();
const avant = await mesurer();
const t0 = Date.now();
await page.click('input[type=search]');
await page.type('input[type=search]', 'ombre', { delay: 0 });
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 3; i += 1) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Occurrence suivante');
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 120));
}
const msRecherche = Date.now() - t0;
const t1 = Date.now();
const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
for (let i = 1; i <= 14; i += 1) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((hauteur - 900) * (i / 14)));
  await new Promise((r) => setTimeout(r, 60));
}
const msDefilement = Date.now() - t1;
await new Promise((r) => setTimeout(r, 500));
const t2 = Date.now();
for (const libelle of ['Anglais', 'Français']) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b?.click();
  }, libelle);
  await new Promise((r) => setTimeout(r, 250));
}
const msBascule = Date.now() - t2;
const apres = await mesurer();
const d = (k) => Math.round((apres[k] - avant[k]) * 1000) / 1000;
const commits = await page.evaluate(() => window.__commits);
const longtasks = await page.evaluate(() => {
  const e = performance.getEntriesByType('longtask');
  return { n: e.length, total: Math.round(e.reduce((s, x) => s + x.duration, 0)) };
});

// Rechargement : le confort choisi doit survivre (persistance réellement vérifiée).
await ouvrirChapitreLong();
const typoApresRechargement = await lireTypo();
if (SHOT) {
  await page.evaluate(() => document.querySelector('#corps-livre')?.scrollIntoView());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT });
}

const sortie = {
  vue: `${LARGEUR}px`,
  typo_initial: typoAvant,
  bouton_reglages: boutonReglages,
  ouverture_clavier: ouvertureClavier,
  panneau_nb_controles: panneau?.nb ?? 0,
  panneau_champs: panneau?.champs ?? [],
  curseurs_repondent_au_clavier: effetsClavier,
  groupes_exclusifs: bascules,
  stockage,
  apres_echap: apresEchap,
  typo_apres_rechargement: typoApresRechargement,
  perf: {
    scriptDuration_s: d('ScriptDuration'),
    recalcStyleDuration_s: d('RecalcStyleDuration'),
    layoutDuration_s: d('LayoutDuration'),
    taskDuration_s: d('TaskDuration'),
    commits_react: commits,
    longtasks,
    ms_recherche: msRecherche,
    ms_defilement: msDefilement,
    ms_bascule: msBascule,
  },
};
writeFileSync(join(tmpdir(), `_w4a_verif_${LARGEUR}.json`), JSON.stringify(sortie, null, 2));
console.log(JSON.stringify(sortie, null, 2));
await navigateur.close();
