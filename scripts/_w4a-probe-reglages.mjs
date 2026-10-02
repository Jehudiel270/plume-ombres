// JETABLE (vérification F5) — réglages, clavier, persistance, 2 colonnes.
// Usage : PORT_PROBE=3971 node scripts/_w4a-probe-reglages.mjs <largeur> <prefixe>
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.PORT_PROBE || 3971;
const HOST = `http://localhost:${PORT}`;
const LARGEUR = Number(process.argv[2] || 1366);
const PREFIXE = process.argv[3] || `reglages_${LARGEUR}`;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const dossier = tmpdir();

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
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
await page.goto(`${HOST}/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector('#corps-livre', { timeout: 30_000 });
await page.evaluate(() => {
  if (window.innerWidth < 1024) document.querySelector('[aria-label="Ouvrir le sommaire"]')?.click();
});
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('aside button')];
  (bs.find((x) => /corridor/i.test(x.textContent)) ?? bs[1])?.click();
});
await page.evaluate(() => document.querySelector('[aria-label="Fermer le sommaire"]')?.click());
await page.waitForFunction(
  () => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000,
  { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1200));

const rapport = { vue: `${LARGEUR}px`, etapes: [] };
const lireStyle = () =>
  page.evaluate(() => {
    const corps = document.querySelector('#corps-livre');
    const cadre = document.querySelector('.cadre-lecture');
    const p = corps.querySelector('p');
    const cs = getComputedStyle(p);
    const p2 = corps.querySelectorAll('p')[3];
    const cs2 = p2 ? getComputedStyle(p2) : null;
    const titre = document.querySelector('.titre-chapitre');
    const etiquette = document.querySelector('.entete-chapitre .sur-titre');
    const chP = (() => {
      const s = (p.textContent ?? '').slice(0, 800) || 'x';
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return ctx.measureText(s).width / s.length;
    })();
    const largeurP = p.getBoundingClientRect().width;
    return {
      titre: titre?.textContent ?? null,
      etiquette: etiquette?.textContent ?? null,
      police_titre: titre ? getComputedStyle(titre).fontFamily.split(',')[0] : null,
      taille_titre_px: titre ? Math.round(parseFloat(getComputedStyle(titre).fontSize)) : null,
      taille_px: parseFloat(cs.fontSize),
      interligne_px: Math.round(parseFloat(cs.lineHeight)),
      alignement: cs.textAlign,
      cesure: cs.hyphens,
      retrait: cs.textIndent,
      marge_paragraphe: cs.marginBottom,
      marge_p_suivant: cs2 ? cs2.marginBottom : null,
      largeur_px: Math.round(largeurP),
      caracteres_par_ligne: Math.round(largeurP / chP),
      colonnes: getComputedStyle(corps).columnCount,
      gouttiere: getComputedStyle(corps).columnGap,
      cadre_hauteur: cadre ? Math.round(cadre.getBoundingClientRect().height) : null,
      cadre_colonnes: cadre?.dataset.colonnes ?? null,
      cadre_defilable: cadre ? cadre.scrollWidth > cadre.clientWidth + 2 : null,
      lettrine: cs.getPropertyValue('--pref-lettrine').trim(),
      bandeau: (() => {
        const s = corps.closest('article');
        const debut = corps.getBoundingClientRect().top;
        const barre = s?.querySelector('.entete-chapitre');
        return barre ? Math.round(debut - barre.getBoundingClientRect().bottom) : null;
      })(),
    };
  });

const capture = async (nom) => {
  const chemin = join(dossier, `_w4a_${PREFIXE}_${nom}.png`);
  await page.screenshot({ path: chemin });
  return chemin;
};

// --- 1) état par défaut, en haut du chapitre -------------------------
await page.evaluate(() => {
  document.querySelector('.entete-chapitre')?.scrollIntoView({ block: 'start' });
});
await new Promise((r) => setTimeout(r, 400));
rapport.etapes.push({ nom: 'defaut', styles: await lireStyle(), capture: await capture('defaut') });

// --- 2) panneau ouvert + audit d'accessibilité -----------------------
const clavier = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="Réglages de lecture"]');
  if (!b) return { bouton: 'absent' };
  b.focus();
  return {
    bouton: 'présent',
    aria_expanded_avant: b.getAttribute('aria-expanded'),
    aria_haspopup: b.getAttribute('aria-haspopup'),
  };
});
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 350));
const panneau = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  const groupes = [...document.querySelectorAll('[role=radiogroup]')].map((g) => ({
    legende: g.getAttribute('aria-label'),
    cases: [...g.querySelectorAll('[role=radio]')].map((r) => ({
      libelle: r.textContent.trim(),
      coche: r.getAttribute('aria-checked'),
      tabindex: r.getAttribute('tabindex'),
    })),
  }));
  const glissieres = [...document.querySelectorAll('[role=dialog] input[type=range]')].map((i) => ({
    id: i.id,
    label: document.querySelector(`label[for="${i.id}"]`)?.textContent ?? i.getAttribute('aria-label'),
    valuetext: i.getAttribute('aria-valuetext'),
    min: i.min,
    max: i.max,
  }));
  const cases = [...document.querySelectorAll('[role=dialog] input[type=checkbox]')].map((i) => ({
    label: document.querySelector(`label[for="${i.id}"]`)?.textContent?.trim(),
    coche: i.checked,
  }));
  return {
    ouvert: !!d,
    libelle: d?.getAttribute('aria-label') ?? null,
    focus_dans_panneau: d?.contains(document.activeElement) ?? false,
    element_focalise: document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 20)),
    groupes,
    glissieres,
    cases,
  };
});
rapport.etapes.push({ nom: 'panneau', clavier, panneau, capture: await capture('panneau') });

// --- 3) navigation clavier dans un radiogroup (flèches) -------------
const fleches = await page.evaluate(() => {
  const radio = document.querySelector('[role=radiogroup] [role=radio][tabindex="0"]');
  radio?.focus();
  return radio?.textContent.trim() ?? null;
});
await page.keyboard.press('ArrowRight');
await new Promise((r) => setTimeout(r, 250));
const apresFleche = await page.evaluate(() => {
  const actif = document.activeElement;
  const g = actif?.closest('[role=radiogroup]');
  return {
    groupe: g?.getAttribute('aria-label'),
    coche: actif?.getAttribute('aria-checked'),
  };
});
// Échap : fermeture + retour du focus
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 250));
const apresEchap = await page.evaluate(() => ({
  panneau_ouvert: !!document.querySelector('[role=dialog]'),
  focus: document.activeElement?.getAttribute('aria-label'),
}));
rapport.etapes.push({ nom: 'clavier', fleches, apresFleche, apresEchap });

// --- 4) réglages : justifié + retrait + césure + 2 colonnes ---------
await page.evaluate(() => {
  document.querySelector('[aria-label="Réglages de lecture"]')?.click();
});
await new Promise((r) => setTimeout(r, 350));
const basculer = async (libelle) => {
  await page.evaluate((l) => {
    const lab = [...document.querySelectorAll('[role=dialog] label')].find((x) =>
      x.textContent.trim().toLowerCase().startsWith(l.toLowerCase())
    );
    lab?.querySelector('input')?.click();
  }, libelle);
  await new Promise((r) => setTimeout(r, 300));
};
await basculer('Texte justifié');
await basculer('Première ligne en retrait');
await page.evaluate(() => {
  const g = [...document.querySelectorAll('[role=radiogroup]')].find(
    (x) => x.getAttribute('aria-label') === 'Nombre de colonnes'
  );
  [...g.querySelectorAll('[role=radio]')].find((r) => r.textContent.includes('2'))?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  document.querySelector('.entete-chapitre')?.scrollIntoView({ block: 'start' });
});
await page.evaluate(() => window.scrollBy(0, 260));
await new Promise((r) => setTimeout(r, 400));
rapport.etapes.push({
  nom: 'justifie_retrait_2colonnes',
  styles: await lireStyle(),
  capture: await capture('colonnes'),
});

// --- 5) persistance : rechargement complet --------------------------
const avantReload = await page.evaluate(() =>
  window.localStorage.getItem('plume.dombres.prefs.v1')
);
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('#corps-livre', { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1500));
const apresReload = await page.evaluate(() => ({
  prefs: window.localStorage.getItem('plume.dombres.prefs.v1'),
  alignement: getComputedStyle(document.querySelector('#corps-livre p')).textAlign,
  colonnes: getComputedStyle(document.querySelector('#corps-livre')).columnCount,
  retrait: getComputedStyle(document.querySelector('#corps-livre p')).textIndent,
}));
rapport.etapes.push({ nom: 'persistance', avantReload, apresReload, capture: await capture('apres_reload') });

const chemin = join(dossier, `_w4a_${PREFIXE}.json`);
writeFileSync(chemin, JSON.stringify(rapport, null, 2));
console.log(JSON.stringify(rapport, null, 2));
await navigateur.close();
