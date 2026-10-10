// Le parcours « RETIRER un abonnement » (déjà livré, vague W8/W9) utilise la
// MÊME modale de confirmation que la gestion des rôles. Déclenche-t-il la même
// erreur « enqueueModel » ?
//   node scripts/_repro-modale.mjs
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
    access_token: c.access_token, token_type: 'bearer',
    expires_in: c.expires_in ?? 3600,
    expires_at: c.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: c.refresh_token, user: c.user,
  };
  const valeur =
    'base64-' +
    Buffer.from(JSON.stringify(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { valeur, uid: c.user.id, nomCookie: `sb-${REF}-auth-token` };
}

const pg = new ClientPg({
  host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: `postgres.${REF}`,
  password: env('SUPABASE_DB_PASSWORD'), database: 'postgres', ssl: { rejectUnauthorized: false },
});
await pg.connect();

const marque = Date.now().toString(36);
const MDP = `Repro-${randomUUID().slice(0, 8)}-Aa1!`;
const admin = await session(`repro-admin2-${marque}@plume-ombres.invalid`, MDP);
const cible = await session(`repro-cible3-${marque}@plume-ombres.invalid`, MDP);
await pg.query(`insert into public.profiles (id,pseudo,role) values ($1,'Repro Admin','admin') on conflict (id) do update set role='admin'`, [admin.uid]);
await pg.query(`insert into public.profiles (id,pseudo,role) values ($1,'Repro Abonne','utilisateur') on conflict (id) do update set role='utilisateur'`, [cible.uid]);
// Abonnement ACTIF : c'est ce qui ACTIVE le bouton « Retirer ».
await pg.query(
  `insert into public.abonnements (proprietaire_id, plan, statut, periode_debut, periode_fin)
   values ($1,'mensuel','actif', now() - interval '2 days', now() + interval '28 days')
   on conflict (proprietaire_id) do update set statut='actif', periode_fin = now() + interval '28 days'`,
  [cible.uid]
);

let navigateur;
try {
  navigateur = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'] });
  const ctx = await navigateur.createBrowserContext();
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`.slice(0, 160)));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.setCookie({ name: admin.nomCookie, value: admin.valeur, domain: new URL(BASE).hostname, path: '/' });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 180_000 });
  await pause(1500);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((x) => (x.innerText || '').includes('Comptes'));
    t?.click();
  });
  await pause(1200);

  const ouvrir = await page.evaluate(() => {
    const ligne = [...document.querySelectorAll('main li')].find((l) => (l.innerText || '').includes('Repro Abonne'));
    if (!ligne) return { ok: false, motif: 'ligne introuvable' };
    const b = [...ligne.querySelectorAll('button')].find((x) => (x.innerText || '').includes('Retirer'));
    if (!b) return { ok: false, motif: 'bouton Retirer introuvable' };
    if (b.disabled) return { ok: false, motif: 'bouton Retirer désactivé' };
    b.click();
    return { ok: true };
  });
  await pause(700);
  const modale = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  const confirmer = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return false;
    const b = [...d.querySelectorAll('button')].find((x) => (x.innerText || '').includes('Retirer l’abonnement'));
    if (!b) return false;
    b.click();
    return true;
  });
  await pause(6000);

  const statut = (await pg.query(`select statut from public.abonnements where proprietaire_id=$1`, [cible.uid])).rows[0]?.statut;
  console.log('ouverture modale:', JSON.stringify(ouvrir), '| modale présente:', modale, '| confirmation cliquée:', confirmer);
  console.log('statut de l’abonnement après:', statut);
  console.log('erreurs console:', erreurs.length, JSON.stringify(erreurs.slice(0, 3)));
  console.log(
    erreurs.length > 0
      ? '⇒ DÉFAUT PRÉEXISTANT confirmé : le parcours « Retirer » (action livrée en W8/W9) casse aussi la page.'
      : '⇒ le parcours « Retirer » ne casse pas la page.'
  );
} finally {
  try {
    await pg.query(`delete from public.admin_actions where cible_id=$1`, [cible.uid]);
    await pg.query(`delete from public.abonnements where proprietaire_id=$1`, [cible.uid]);
    await pg.query(`delete from public.profiles where id = any($1)`, [[admin.uid, cible.uid]]);
    await pg.query(`delete from auth.users where id = any($1)`, [[admin.uid, cible.uid]]);
  } catch (e) { console.warn('nettoyage :', e.message); }
  await pg.end().catch(() => {});
  if (navigateur) await navigateur.close().catch(() => {});
}
