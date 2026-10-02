// JETABLE — captures propres : haut de chapitre (lettrine) et panneau de réglages.
// Usage : node scripts/_w4a-captures.mjs <largeur>
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3971';
const L = Number(process.argv[2] || 1366);
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await nav.newPage();
await page.setViewport(L <= 400 ? { width: L, height: 844, isMobile: true, hasTouch: true } : { width: L, height: 900 });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('plume.dombres.prefs.v1'); } catch (e) {} });
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
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
await new Promise((r) => setTimeout(r, 1200));
// ferme la liste de résultats de recherche s'il y en a une
await page.evaluate(() => document.querySelector('[aria-label="Fermer la recherche"]')?.click());
await page.evaluate(() => document.querySelector('.entete-chapitre')?.scrollIntoView({ block: 'start' }));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: join(tmpdir(), `_w4a_montre_${L}.png`) });

await page.evaluate(() => {
  const b = document.querySelector('[aria-label="Réglages de lecture"]');
  b?.scrollIntoView({ block: 'center' });
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: join(tmpdir(), `_w4a_panneau_${L}.png`) });
const infos = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  const r = d?.getBoundingClientRect();
  return {
    panneau: r ? { x: Math.round(r.x), y: Math.round(r.y), l: Math.round(r.width), h: Math.round(r.height) } : null,
    hors_ecran: r ? r.right > window.innerWidth + 1 || r.left < -1 || r.bottom > window.innerHeight + 1 || r.top < -1 : null,
    utilisable: r ? r.width > 200 && r.height > 200 && r.top >= -1 && r.top < window.innerHeight : null,
    sections: [...(d?.querySelectorAll('p,span') ?? [])].map((e) => e.textContent.trim()).filter((t) => t.length > 2 && t.length < 40).slice(0, 24),
  };
});
console.log(JSON.stringify({ vue: L, ...infos }, null, 1));
await nav.close();
