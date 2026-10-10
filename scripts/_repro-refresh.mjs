// Reproduction MINIMALE : le parcours ABONNEMENT (déjà livré, vague W8/W9)
// déclenche-t-il la même erreur console que le parcours RÔLES ?
//   node scripts/_repro-refresh.mjs
// But : savoir si l'erreur « enqueueModel » est une régression du chantier
// super_admin ou un défaut PRÉEXISTANT de la page /admin.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { Client as ClientPg } from 'pg';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = (process.env.BASE_URL ?? 'http://localhost:3951').replace(/\/$/, '');
const LIGNES = readFileSync('.env.local', 'utf8').split(/\r?\n/);
const env = (k) => {
  const l = LIGNES.find((x) => x.trim().startsWith(`${k}=`));
  if (!l) throw new Error(`clé ${k} absente`);
  return l.split('=').slice(1).join('=').trim();
};
const SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REF = new URL(SUPA_URL).host.split('.')[0];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(email, mdp) {
  const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: mdp }),
  });
  const c = await r.json();
  const s = {
    access_token: c.access_token,
    token_type: 'bearer',
    expires_in: c.expires_in ?? 3600,
    expires_at: c.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: c.refresh_token,
    user: c.user,
  };
  const valeur =
    'base64-' +
    Buffer.from(JSON.stringify(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { valeur, uid: c.user.id, nomCookie: `sb-${REF}-auth-token` };
}

const pg = new ClientPg({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: `postgres.${REF}`,
  password: env('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await pg.connect();

const marque = Date.now().toString(36);
const MDP = `Repro-${randomUUID().slice(0, 8)}-Aa1!`;
const admin = await session(`repro-admin-${marque}@plume-ombres.invalid`, MDP);
const cible = await session(`repro-cible-${marque}@plume-ombres.invalid`, MDP);
await pg.query(
  `insert into public.profiles (id,pseudo,role) values ($1,'Repro Admin','admin') on conflict (id) do update set role='admin'`,
  [admin.uid]
);
await pg.query(
  `insert into public.profiles (id,pseudo,role) values ($1,'Repro Cible','utilisateur') on conflict (id) do update set role='utilisateur'`,
  [cible.uid]
);

let navigateur;
try {
  navigateur = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  });
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`.slice(0, 200)));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.setCookie({ name: admin.nomCookie, value: admin.valeur, domain: new URL(BASE).hostname, path: '/' });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
  await pause(1500);

  // Onglet « Comptes »
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((x) =>
      (x.innerText || '').includes('Comptes')
    );
    t?.click();
  });
  await pause(1200);

  const avant = erreurs.length;

  // Action ABONNEMENT préexistante : on reproduit EXACTEMENT la mécanique du
  // parcours rôles — manipulation du <select> par le setter natif + événement
  // « change », puis clic. C'est le seul moyen de comparer à armes égales.
  const choix = await page.evaluate(() => {
    const ligne = [...document.querySelectorAll('main li')].find((l) =>
      (l.innerText || '').includes('Repro Cible')
    );
    if (!ligne) return { ok: false, motif: 'ligne introuvable' };
    const sel = ligne.querySelector('select');
    if (!sel) return { ok: false, motif: 'select introuvable' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '3_mois');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  });
  await pause(400);

  const clique = await page.evaluate(() => {
    const ligne = [...document.querySelectorAll('main li')].find((l) =>
      (l.innerText || '').includes('Repro Cible')
    );
    if (!ligne) return { ok: false, motif: 'ligne introuvable' };
    const b = [...ligne.querySelectorAll('button')].find((x) => (x.innerText || '').includes('Accorder'));
    if (!b) return { ok: false, motif: 'bouton Accorder introuvable' };
    if (b.disabled) return { ok: false, motif: 'bouton désactivé' };
    b.click();
    return { ok: true };
  });
  await pause(6000);

  const apres = erreurs.length;
  console.log('choix du select :', JSON.stringify(choix));
  console.log('clic « Accorder » :', JSON.stringify(clique));
  console.log(`erreurs console : ${avant} avant, ${apres} après`);
  console.log('détail :', JSON.stringify(erreurs.slice(0, 4), null, 1));
  console.log(
    apres > avant
      ? '⇒ le parcours ABONNEMENT (préexistant) déclenche AUSSI l’erreur : défaut de page, pas une régression des rôles.'
      : '⇒ le parcours ABONNEMENT ne déclenche PAS l’erreur : la régression vient du parcours RÔLES.'
  );
} finally {
  try {
    await pg.query(`delete from public.admin_actions where cible_id=$1`, [cible.uid]);
    await pg.query(`delete from public.abonnements where proprietaire_id=$1`, [cible.uid]);
    await pg.query(`delete from public.profiles where id = any($1)`, [[admin.uid, cible.uid]]);
    await pg.query(`delete from auth.users where id = any($1)`, [[admin.uid, cible.uid]]);
  } catch (e) {
    console.warn('nettoyage :', e.message);
  }
  await pg.end().catch(() => {});
  if (navigateur) await navigateur.close().catch(() => {});
}
