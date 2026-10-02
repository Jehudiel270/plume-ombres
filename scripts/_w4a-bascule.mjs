// JETABLE — micro-profil : bascule source/traduit AVEC recherche active.
// Usage : PORT_PROBE=3971 node scripts/_w4a-bascule.mjs
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = `http://localhost:${process.env.PORT_PROBE || 3971}`;
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

const navigateur = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
});
const page = await navigateur.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.evaluateOnNewDocument(() => {
  window.__commits = 0;
  window.__lt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration));
  }).observe({ entryTypes: ['longtask'] });
  window.__hook = {
    renderers: new Map(), supportsFiber: true, inject() { return 1; },
    onCommitFiberRoot() { window.__commits += 1; }, onCommitFiberUnmount() {}, checkDCE() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: window.__hook, configurable: true });
});
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
await page.goto(`${HOST}/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForSelector('#corps-livre', { timeout: 30_000 });
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('aside button')];
  (bs.find((x) => /corridor/i.test(x.textContent)) ?? bs[1])?.click();
});
await page.waitForFunction(
  () => (document.querySelector('#corps-livre')?.textContent?.length ?? 0) > 40_000,
  { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1200));

await page.click('input[type=search]');
await page.type('input[type=search]', 'ombre', { delay: 0 });
await new Promise((r) => setTimeout(r, 1000));
const marques = await page.evaluate(() => ({
  marks: document.querySelectorAll('#corps-livre mark').length,
  noeuds: document.querySelectorAll('#corps-livre').length,
  noeuds_corps: document.querySelector('#corps-livre').querySelectorAll('*').length,
}));

async function basculer(libelle) {
  return page.evaluate(async (l) => {
    const avant = performance.now();
    const c0 = window.__commits;
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ms: Math.round(performance.now() - avant), commits: window.__commits - c0 };
  }, libelle);
}

const tours = [];
for (let i = 0; i < 3; i += 1) {
  tours.push(await basculer('Anglais'));
  await new Promise((r) => setTimeout(r, 500));
  tours.push(await basculer('Français'));
  await new Promise((r) => setTimeout(r, 500));
}
const longtasks = await page.evaluate(() => {
  const l = window.__lt.slice();
  window.__lt = [];
  return l;
});
const memoire = await page.metrics();
console.log(JSON.stringify({
  marques,
  bascules_ms: tours.map((t) => t.ms),
  commits: tours.map((t) => t.commits),
  longtasks,
  script_s: Math.round(memoire.ScriptDuration * 1000) / 1000,
  layout_s: Math.round(memoire.LayoutDuration * 1000) / 1000,
  noeuds: memoire.Nodes,
  heap_Mo: Math.round(memoire.JSHeapUsedSize / 1024 / 1024 * 10) / 10,
}, null, 2));
await navigateur.close();
