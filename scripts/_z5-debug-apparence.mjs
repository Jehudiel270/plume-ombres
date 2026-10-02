// JETABLE — diagnostic du panneau Apparence (consolidation vague 5).
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3991';
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await nav.newPage();
await page.setViewport({ width: 1366, height: 900 });
const erreurs = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => erreurs.push('PAGEERROR ' + String(e).slice(0, 300)));
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
await page.goto(HOST + '/bibliotheque', { waitUntil: 'domcontentloaded', timeout: 90_000 });
await new Promise((r) => setTimeout(r, 2500));

const etat0 = await page.evaluate(() => ({
  dialogue: !!document.querySelector('[role="dialog"]'),
  boutonsApparence: [...document.querySelectorAll('button')].filter((b) => /apparence/i.test(b.textContent + (b.title || '') + (b.getAttribute('aria-label') || ''))).map((b) => ({ texte: b.textContent.trim().slice(0, 24), title: b.title, classe: b.className.slice(0, 60) })),
  declencheurMenu: !!document.querySelector('[aria-haspopup="menu"]'),
}));

// 1) L'événement seul : le panneau doit s'ouvrir
const apresEvenement = await page.evaluate(async () => {
  window.dispatchEvent(new CustomEvent('plume:ouvrir-apparence'));
  await new Promise((r) => setTimeout(r, 600));
  const d = document.querySelector('[role="dialog"]');
  const r = d?.getBoundingClientRect();
  return {
    ouvert: !!d,
    visible: r ? { top: Math.round(r.top), gauche: Math.round(r.left), l: Math.round(r.width), h: Math.round(r.height) } : null,
    libelle: d?.getAttribute('aria-label') ?? null,
    nbControles: d ? d.querySelectorAll('button, input, [role="radio"]').length : 0,
  };
});

// 2) Le bouton flottant éventuel
const apresBouton = await page.evaluate(async () => {
  const b = [...document.querySelectorAll('button')].find((x) => /apparence/i.test((x.title || '') + x.textContent + (x.getAttribute('aria-label') || '')));
  if (!b) return { bouton: 'absent' };
  const etaitOuvert = !!document.querySelector('[role="dialog"]');
  b.click();
  await new Promise((r) => setTimeout(r, 600));
  return { bouton: 'clique', etaitOuvert, ouvertApres: !!document.querySelector('[role="dialog"]') };
});

// 3) Bascule de palette via le panneau
const bascule = await page.evaluate(async () => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { erreur: 'panneau ferme' };
  const avant = document.documentElement.dataset.palette;
  const candidats = [...d.querySelectorAll('button')];
  for (const b of candidats) {
    b.click();
    await new Promise((r) => setTimeout(r, 300));
    if (document.documentElement.dataset.palette !== avant) {
      return { avant, apres: document.documentElement.dataset.palette, par: b.textContent.trim().slice(0, 24) };
    }
  }
  return { avant, apres: document.documentElement.dataset.palette, par: null };
});

const capture = join(tmpdir(), '_z5_debug_apparence.png');
await page.screenshot({ path: capture });
console.log(JSON.stringify({ etat0, apresEvenement, apresBouton, bascule, erreurs: [...new Set(erreurs)].slice(0, 8), capture }, null, 2));
await nav.close();
