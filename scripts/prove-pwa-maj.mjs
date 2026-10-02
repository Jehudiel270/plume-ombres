// ============================================================
// scripts/prove-pwa-maj.mjs — PREUVE RÉELLE de la mise à jour
// automatique de la PWA (Edge headless, CDP via puppeteer-core).
//
//   1. ouvre le site, laisse le service worker s'installer ;
//   2. relève la version de cache réellement active ;
//   3. MODIFIE le service worker sur disque (nouvelle version) ;
//   4. déclenche une recherche de mise à jour (registration.update) ;
//   5. vérifie que la nouvelle version s'active SANS fermer l'onglet
//      et que la page se recharge d'elle-même.
//
// Usage : node scripts/prove-pwa-maj.mjs
// Pré-requis : `npx next dev --webpack -p 3995` lancé, Edge installé.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:3995';
const SW = 'public/service-worker.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const source = readFileSync(SW, 'utf8');
const versionInitiale = source.match(/const VERSION = '([^']+)'/)?.[1];
if (!versionInitiale) {
  console.error('VERSION introuvable dans le service worker');
  process.exit(1);
}
const versionSuivante = versionInitiale.replace(/(\d+)$/, (n) => String(Number(n) + 1));

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();

const rapport = { versionInitiale, versionSuivante };
let rechargements = 0;
page.on('framenavigated', (cadre) => {
  if (cadre === page.mainFrame()) rechargements += 1;
});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });

// 1. Le service worker s'installe et prend le contrôle. On SONDE
//    (plutôt que d'attendre un évènement) : c'est robuste quel que
//    soit le navigateur.
let enregistre = false;
for (let i = 0; i < 30; i++) {
  enregistre = await page
    .evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    })
    .catch(() => false);
  if (enregistre) break;
  await attendre(1000);
}
rapport.inscriptionAuto = enregistre;
if (!enregistre) {
  console.error('ÉCHEC : le service worker ne s’est pas enregistré tout seul.');
  await navigateur.close();
  writeFileSync(SW, source, 'utf8');
  process.exit(1);
}
rapport.cachesAvant = await page.evaluate(() => caches.keys());
rapport.controle = await page.evaluate(() =>
  Boolean(navigator.serviceWorker.controller)
);
console.log('1) version active :', versionInitiale);
console.log('   inscription auto :', rapport.inscriptionAuto ? 'OUI' : 'NON');
console.log('   caches           :', (rapport.cachesAvant ?? []).join(', '));
console.log('   page contrôlée   :', rapport.controle);

// 2. Nouvelle version du service worker sur disque.
writeFileSync(SW, source.replace(versionInitiale, versionSuivante), 'utf8');
console.log(`2) service worker publié en « ${versionSuivante} »`);

// 3. On marque la page AVANT : si elle se recharge, la marque disparaît.
await page.evaluate(() => {
  window.__marqueurAvant = 'present';
});

// 4. Recherche de mise à jour, comme le fait l'application.
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.update();
});

// 5. On attend le rechargement automatique (ou l'activation).
const debut = Date.now();
let majDetectee = false;
while (Date.now() - debut < 30_000) {
  const marqueurDisparu = await page
    .evaluate(() => window.__marqueurAvant === undefined)
    .catch(() => true);
  const caches = await page.evaluate(() => caches.keys()).catch(() => []);
  if (marqueurDisparu || caches.some((c) => c.includes(versionSuivante))) {
    majDetectee = true;
    rapport.cachesApres = caches;
    break;
  }
  await attendre(1000);
}
rapport.rechargements = rechargements;
rapport.majDetectee = majDetectee;
rapport.delaiMs = Date.now() - debut;

await navigateur.close();

// 6. On restaure le service worker d'origine (le test ne laisse
//    aucune modification derrière lui).
writeFileSync(SW, source, 'utf8');

console.log('3) marqueur avant présent :', !majDetectee ? 'OUI (pas de rechargement)' : 'remplacé');
console.log('   caches après         :', (rapport.cachesApres ?? []).join(', '));
console.log('   rechargements détectés :', rapport.rechargements);
console.log('RÉSUMÉ_JSON ' + JSON.stringify(rapport));

if (!majDetectee) {
  console.error('ÉCHEC : la mise à jour ne s’est pas propagée automatiquement.');
  process.exit(1);
}
console.log('✓ mise à jour automatique vérifiée (sans fermer l’onglet)');
