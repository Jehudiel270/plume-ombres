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
const resultat = await page.evaluate(async () => {
  const racine = document.documentElement;
  const avant = { palette: racine.dataset.palette, typo: racine.dataset.typo, fond: racine.style.getPropertyValue('--fond-intensite') || null };
  const d = document.querySelector('[role="dialog"]');
  const clic = (texte) => {
    const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase().includes(texte));
    if (b) { b.click(); return true; }
    return false;
  };
  clic('orage');
  await new Promise((r) => setTimeout(r, 500));
  const apresPalette = racine.dataset.palette;
  clic('vélin');
  await new Promise((r) => setTimeout(r, 500));
  const apresTypo = racine.dataset.typo;
  const fondApres = racine.style.getPropertyValue('--fond-intensite') || null;
  // persistance
  const stockage = { palette: localStorage.getItem('plume.dombres.palette.v1'), typo: localStorage.getItem('plume.dombres.typo.v1') };
  return { avant, apresPalette, apresTypo, fondApres, stockage };
});
// après rechargement, le choix doit tenir
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1500));
const apresReload = await page.evaluate(() => ({ palette: document.documentElement.dataset.palette, typo: document.documentElement.dataset.typo }));
const shot = join(tmpdir(), '_z5_palette_changee.png');
await page.screenshot({ path: shot });
console.log(JSON.stringify({ resultat, apresReload, shot }, null, 1));
await nav.close();
