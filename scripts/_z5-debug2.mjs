import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3991';
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const nav = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-first-run', '--no-sandbox'] });
const page = await nav.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.setCookie({ name: 'sb-imbziizequckeaxuotdz-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), domain: 'localhost', path: '/' });
await page.goto(HOST + '/bibliotheque', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));

// 1) ouvrir le menu utilisateur, lister ses entrées
await page.evaluate(() => document.querySelector('[aria-haspopup="menu"]')?.click());
await new Promise((r) => setTimeout(r, 500));
const entrees = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((e) => e.textContent.trim()));

// 2) cliquer « Apparence »
await page.evaluate(() => {
  const b = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((e) => /apparence/i.test(e.textContent));
  b?.click();
});
await new Promise((r) => setTimeout(r, 700));
const apresMenu = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const r = d?.getBoundingClientRect();
  return { ouvert: !!d, rect: r ? { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) } : null,
    palettes: [...(d?.querySelectorAll('[aria-pressed], [role="radio"]') ?? [])].map((e) => e.textContent.trim().slice(0, 20)) };
});
const shot = join(tmpdir(), '_z5_apparence_menu.png');
await page.screenshot({ path: shot });

// 3) bascule de palette dans le panneau
const bascule = await page.evaluate(async () => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { erreur: 'ferme' };
  const avant = document.documentElement.dataset.palette;
  for (const b of [...d.querySelectorAll('button')]) {
    b.click();
    await new Promise((r) => setTimeout(r, 300));
    if (document.documentElement.dataset.palette !== avant) return { avant, apres: document.documentElement.dataset.palette, par: b.textContent.trim().slice(0, 20) };
  }
  return { avant, apres: document.documentElement.dataset.palette };
});
console.log(JSON.stringify({ entrees, apresMenu, bascule, shot }, null, 1));
await nav.close();
