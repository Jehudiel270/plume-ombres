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
await page.evaluate(() => window.dispatchEvent(new CustomEvent('plume:ouvrir-apparence')));
await new Promise((r) => setTimeout(r, 600));
const r = await page.evaluate(async () => {
  const racine = document.documentElement;
  const avant = { palette: racine.dataset.palette, typo: racine.dataset.typo };
  const radios = [...document.querySelectorAll('[role="dialog"] input[type="radio"]')].map((i) => ({ name: i.name, value: i.value, coche: i.checked }));
  // 1) palette : clic sur le radio « orage »
  const rOrage = [...document.querySelectorAll('[role="dialog"] input[type="radio"]')].find((i) => i.value === 'orage' || (i.name || '').includes('palette') && i.value === 'orage');
  rOrage?.click();
  await new Promise((res) => setTimeout(res, 600));
  const apresPalette = racine.dataset.palette;
  // 2) typographie : clic sur le radio « velin »
  const rTypo = [...document.querySelectorAll('[role="dialog"] input[type="radio"]')].find((i) => i.value === 'velin');
  rTypo?.click();
  await new Promise((res) => setTimeout(res, 600));
  const apresTypo = racine.dataset.typo;
  return { avant, radios, apresPalette, apresTypo, stockage: { palette: localStorage.getItem('plume.dombres.palette.v1'), typo: localStorage.getItem('plume.dombres.typo.v1') } };
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1600));
const apresReload = await page.evaluate(() => ({ palette: document.documentElement.dataset.palette, typo: document.documentElement.dataset.typo }));
const shot = join(tmpdir(), '_z5_palette_orage.png');
await page.screenshot({ path: shot });
console.log(JSON.stringify({ r, apresReload, shot }, null, 1));
await nav.close();
