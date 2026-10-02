// JETABLE — mutations DOM + durées navigateur pendant une bascule.
// Usage : PORT_PROBE=3971 node scripts/_w4a-mutations.mjs
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

async function mesurer(libelle) {
  const avant = await page.metrics();
  const res = await page.evaluate(async (l) => {
    const mutations = { childList: 0, characterData: 0, attributs: 0, noeuds_ajoutes: 0, noeuds_retires: 0 };
    const obs = new MutationObserver((liste) => {
      for (const m of liste) {
        if (m.type === 'childList') {
          mutations.childList += 1;
          mutations.noeuds_ajoutes += m.addedNodes.length;
          mutations.noeuds_retires += m.removedNodes.length;
        } else if (m.type === 'characterData') mutations.characterData += 1;
        else mutations.attributs += 1;
      }
    });
    obs.observe(document.querySelector('#corps-livre'), {
      childList: true, characterData: true, attributes: true, subtree: true,
    });
    const t0 = performance.now();
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ms = Math.round(performance.now() - t0);
    obs.disconnect();
    return { ms, mutations };
  }, libelle);
  await new Promise((r) => setTimeout(r, 600));
  const apres = await page.metrics();
  return {
    libelle,
    ms: res.ms,
    mutations: res.mutations,
    recalcStyle_ms: Math.round((apres.RecalcStyleDuration - avant.RecalcStyleDuration) * 1000),
    layout_ms: Math.round((apres.LayoutDuration - avant.LayoutDuration) * 1000),
    script_ms: Math.round((apres.ScriptDuration - avant.ScriptDuration) * 1000),
  };
}

const resultats = [];
resultats.push(await mesurer('Anglais'));
resultats.push(await mesurer('Français'));
resultats.push(await mesurer('Anglais'));
console.log(JSON.stringify(resultats, null, 2));
await navigateur.close();
