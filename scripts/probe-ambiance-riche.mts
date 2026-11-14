// Vérification EN LIGNE de la fiche d'ambiance riche : deux livres
// de test avec fiches complètes, page /ambiance/[id] rendue, puis
// nettoyage.
import { readFileSync } from 'node:fs';
import { Client as Pg } from 'pg';
import crypto from 'node:crypto';

const env = readFileSync('.env.local', 'utf8');
const lire = (k: string) => {
  const l = env.split('\n').find((x) => x.trim().startsWith(`${k}=`));
  return l ? l.split('=').slice(1).join('=').trim() : '';
};
const URL_BASE = lire('NEXT_PUBLIC_SUPABASE_URL');
const ANON = lire('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REF = URL_BASE.replace('https://', '').split('.')[0];
const MDP = 'Plume-Test-2026!';
const COURRIEL = `probe-amb-${Date.now()}@example.com`;
const SITE = 'https://plumedombres.kodelyza.com';

async function main() {
  // 1. Compte jetable + session.
  const c = new Pg({ host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.imbziizequckeaxuotdz', password: lire('SUPABASE_DB_PASSWORD'), database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const uid = crypto.randomUUID();
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new) values ('${uid}', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','${COURRIEL}', crypt('${MDP}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"pseudo":"Probe Ambiance"}', now(), now(), '', '', '', '')`);
  await c.query(`insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at) values ($1::uuid,'email',$1::text, jsonb_build_object('sub', $2::text, 'email', $3::text), now(), now(), now()) on conflict do nothing`, [uid, uid, COURRIEL]);
  await c.query(`insert into public.profiles (id, pseudo) values ($1, 'Probe Ambiance') on conflict (id) do nothing`, [uid]);

  // 2. Deux livres avec fiches d'ambiance RICHES.
  const l1 = await c.query(`insert into public.livres (proprietaire_id, titre, auteur) values ($1,'La Couronne de Cendre-Noire','A. Vermeille') returning id`, [uid]);
  const l2 = await c.query(`insert into public.livres (proprietaire_id, titre, auteur) values ($1,'Routes d''Hiver','A. Vermeille') returning id`, [uid]);
  const livre1 = l1.rows[0].id as string;
  const livre2 = l2.rows[0].id as string;
  const fiche1 = JSON.stringify({
    livre_id: livre1,
    genres: ['Fantasy sombre', 'Intrigue de cour'],
    tropes: ['Slow burn', 'Ennemis à amants'],
    intensite: 4,
    palette: [
      { nom: 'Cendre', hex: '#3b3236' }, { nom: 'Cire rouge', hex: '#9e1b32' },
      { nom: 'Encre', hex: '#14101a' }, { nom: 'Parchemin', hex: '#d9c3a0' },
      { nom: 'Or terni', hex: '#a98a4a' },
    ],
    atmosphere: 'Une cour aux couloirs froids, des archives qui sentent la cire et la poussière.',
    ton: 'Sombre, élégant, tendu sous la courtoisie',
    rythme_niveau: 3,
    rythme_label: 'Lent au début, puis de plus en plus serré',
    promesses: ['Une lente montée de tension entre deux adversaires', 'Des intrigues de palais à décoder'],
    playlist_nom: 'Veillée aux archives',
    playlist: [
      { titre: 'Cire et chandelles', humeur: 'Cordes graves, souffle retenu', minutes: 4 },
      { titre: 'Couloir des Cendrées', humeur: 'Pas feutrés, piano seul', minutes: 3 },
    ],
    citation_ouverture: 'À Vaelmont, on apprend très tôt que le silence est une langue.',
    mots_cles: ['Archives', 'Cour', 'Hiver', 'Encre'],
  });
  const fiche2 = JSON.stringify({
    livre_id: livre2,
    genres: ['Fantasy sombre'],
    tropes: ['Slow burn'],
    intensite: 4,
    palette: [], atmosphere: null, ton: null, rythme_niveau: null, rythme_label: null,
    promesses: [], playlist_nom: null, playlist: [], citation_ouverture: null, mots_cles: [],
  });
  await c.query(`insert into public.ambiance_livres (livre_id, genres, tropes, intensite, palette, atmosphere, ton, rythme_niveau, rythme_label, promesses, playlist_nom, playlist, citation_ouverture, mots_cles) select livre_id, genres, tropes, intensite, palette::jsonb, atmosphere, ton, rythme_niveau, rythme_label, promesses, playlist_nom, playlist::jsonb, citation_ouverture, mots_cles from json_to_recordset($1::json) as x(livre_id uuid, genres text[], tropes text[], intensite int, palette json, atmosphere text, ton text, rythme_niveau int, rythme_label text, promesses text[], playlist_nom text, playlist json, citation_ouverture text, mots_cles text[])`, [JSON.stringify([JSON.parse(fiche1), JSON.parse(fiche2)])]);
  await c.end();

  // 3. Session + cookie.
  const rep = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: COURRIEL, password: MDP }) });
  const sess = (await rep.json()) as { access_token: string };
  if (!sess.access_token) throw new Error('session refusée');
  const brut = Buffer.from(JSON.stringify(sess)).toString('base64url');
  const cle = `sb-${REF}-auth-token`;
  const valeur = `base64-${brut}`;
  const morceaux: string[] = [];
  for (let i = 0; i * 3180 < valeur.length; i += 1) {
    const part = valeur.slice(i * 3180, (i + 1) * 3180);
    morceaux.push(morceaux.length === 0 && valeur.length <= 3180 ? `${cle}=${part}` : `${cle}.${morceaux.length}=${part}`);
  }
  const cookie = morceaux.join('; ');

  // 4. Pages en ligne.
  const rListe = await fetch(`${SITE}/ambiance`, { headers: { Cookie: cookie } });
  console.log('GET /ambiance →', rListe.status);
  const rFiche = await fetch(`${SITE}/ambiance/${livre1}`, { headers: { Cookie: cookie } });
  const html = await rFiche.text();
  const morceaux2 = ['Palette', 'Cire rouge', 'Atmosphère', 'cour aux couloirs froids', 'Ton', 'rythme', 'Lent au début', 'Ce que le livre promet', 'Veillée aux archives', 'Cire et chandelles', 'Cordes graves', 'Citation d’ouverture', 'À Vaelmont', 'Pour vous si vous avez aimé', 'Routes d', 'Slow burn', 'Fantasy sombre'];
  console.log('GET /ambiance/[id] →', rFiche.status);
  for (const m of morceaux2) console.log(`  ${html.includes(m) ? 'OK ' : 'MANQUE'} — ${m}`);

  // 5. Nettoyage.
  const c2 = new Pg({ host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.imbziizequckeaxuotdz', password: lire('SUPABASE_DB_PASSWORD'), database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c2.connect();
  await c2.query(`delete from auth.users where id=$1`, [uid]);
  await c2.end();
  console.log('Nettoyage fait.');
}
main().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
