// Sonde de preuve des PAGES PUBLIQUES de Plume d'Ombres (accueil, tarifs,
// FAQ, contact).
//
// But : prouver qu'un visiteur NON connecté voit des pages réelles, sur
// deux largeurs (1366 px et 390 px), et qu'aucun lien interne de ces pages
// ne casse (HTTP < 400). Aucun cookie de session n'est posé : ce sont des
// pages publiques.
//
// Usage : node scripts/probe-pages-publiques.mjs
// Pré-requis : `npx next dev --webpack -p 3984` lancé, Edge installé.
// Sortie : captures PNG + rapport JSON dans %LOCALAPPDATA%\Temp.

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3984';
const DOSSIER = tmpdir(); // %LOCALAPPDATA%\Temp sous Windows

const PAGES = [
  { chemin: '/', nom: 'accueil' },
  { chemin: '/tarifs', nom: 'tarifs' },
  { chemin: '/faq', nom: 'faq' },
  { chemin: '/contact', nom: 'contact' },
];

const VUES = [
  { label: '1366', largeur: 1366, hauteur: 900, mobile: false },
  { label: '390', largeur: 390, hauteur: 844, mobile: true },
];

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});

/** Attend la fin des animations d'entrée (500 ms suffit : durée 0,55 s). */
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const captures = [];
const liensTrouves = new Set();

for (const vue of VUES) {
  const page = await navigateur.newPage();
  await page.setViewport({
    width: vue.largeur,
    height: vue.hauteur,
    isMobile: vue.mobile,
    hasTouch: vue.mobile,
    deviceScaleFactor: 1,
  });

  for (const cible of PAGES) {
    const url = `${BASE}${cible.chemin}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
    await attendre(700); // laisse le fondu-monte se terminer

    const cheminCapture = join(DOSSIER, `public-${cible.nom}-${vue.label}.png`);
    await page.screenshot({ path: cheminCapture, fullPage: true });

    const infos = await page.evaluate(() => ({
      titre: document.title,
      titreH1: document.querySelector('h1')?.innerText?.trim() ?? null,
      // Tous les liens internes rendus sur la page.
      liens: [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.startsWith('/') && !h.startsWith('//')),
    }));
    for (const l of infos.liens) liensTrouves.add(l.split('#')[0].split('?')[0]);

    captures.push({
      page: cible.nom,
      vue: vue.label,
      url,
      fichier: cheminCapture,
      titre: infos.titre,
      h1: infos.titreH1,
    });
  }
  await page.close();
}

await navigateur.close();

// --- Contrôle HTTP de chaque lien interne (dédupliqué, sans ancre/query) ---
const liens = [...liensTrouves].sort();
const statuts = [];
for (const lien of liens) {
  try {
    const rep = await fetch(`${BASE}${lien}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    statuts.push({ lien, statut: rep.status, ok: rep.status < 400 });
  } catch (e) {
    statuts.push({ lien, statut: null, ok: false, erreur: String(e) });
  }
}

const rapport = {
  base: BASE,
  horodatage: new Date().toISOString(),
  captures,
  liens: statuts,
  liensCasses: statuts.filter((s) => !s.ok),
};

const cheminRapport = join(DOSSIER, 'probe-pages-publiques.json');
writeFileSync(cheminRapport, JSON.stringify(rapport, null, 2), 'utf8');

console.log('=== CAPTURES ===');
for (const c of captures) {
  console.log(`${c.vue.padStart(4)}px  ${c.page.padEnd(8)}  ${c.fichier}`);
  console.log(`        h1="${c.h1 ?? '(aucun)'}"  titre="${c.titre}"`);
}
console.log('\n=== LIENS INTERNES (< 400 exigé) ===');
for (const s of statuts) {
  console.log(`${s.ok ? 'OK ' : 'KO '} ${String(s.statut).padStart(4)}  ${s.lien}`);
}
console.log(`\nLiens cassés : ${rapport.liensCasses.length}`);
console.log(`Rapport : ${cheminRapport}`);

process.exit(rapport.liensCasses.length === 0 ? 0 : 1);
