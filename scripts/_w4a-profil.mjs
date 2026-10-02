// JETABLE — profil CPU (CDP Profiler) pendant les bascules source/traduit.
// Usage : PORT_PROBE=3971 node scripts/_w4a-profil.mjs
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

const client = await page.createCDPSession();
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 200 });
await client.send('Profiler.start');

for (let i = 0; i < 4; i += 1) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    b?.click();
  }, i % 2 === 0 ? 'Anglais' : 'Français');
  await new Promise((r) => setTimeout(r, 600));
}

const { profile } = await client.send('Profiler.stop');
const parId = new Map(profile.nodes.map((n) => [n.id, n]));
const temps = new Map();
for (let i = 0; i < profile.samples.length; i += 1) {
  const n = parId.get(profile.samples[i]);
  if (!n) continue;
  const f = n.callFrame;
  const cle = `${f.functionName || '(anonyme)'} @ ${(f.url || '').replace(HOST, '').split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
  temps.set(cle, (temps.get(cle) ?? 0) + (profile.timeDeltas[i] ?? 0));
}
const top = [...temps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
console.log(JSON.stringify({
  total_ms: Math.round(profile.endTime - profile.startTime),
  echantillons: profile.samples.length,
  top_fonctions: top.map(([nom, us]) => `${Math.round(us / 1000)} ms  ${nom}`),
}, null, 2));
await navigateur.close();
