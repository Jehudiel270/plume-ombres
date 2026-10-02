// JETABLE — diagnostic du rendu mobile (390 px).
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const demo = JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));
const nav = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-first-run', '--no-sandbox'],
});
const page = await nav.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE_ERR', m.text().slice(0, 400));
});
page.on('pageerror', (e) => console.log('PAGE_ERR', String(e).slice(0, 500)));
await page.setCookie({
  name: 'sb-imbziizequckeaxuotdz-auth-token',
  value: 'base64-' + Buffer.from(JSON.stringify(demo.session.session), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  domain: 'localhost', path: '/',
});
await page.goto(`http://localhost:3971/livres/${demo.livreId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await new Promise((r) => setTimeout(r, 6000));
console.log(JSON.stringify(await page.evaluate(() => ({
  corps: !!document.querySelector('#corps-livre'),
  texte: (document.querySelector('#corps-livre')?.textContent ?? '').length,
  lecteur: !!document.querySelector('#lecteur-chapitre'),
  titre: document.querySelector('.titre-chapitre')?.textContent ?? null,
  extrait: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
})), null, 1));
await nav.close();
