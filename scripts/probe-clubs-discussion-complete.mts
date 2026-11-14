// Vérification EN LIGNE des nouvelles fonctionnalités : compte jetable
// en base, session par mot de passe, cookies @supabase/ssr, appels API.
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
const COURRIEL = `probe-v4-${Date.now()}@example.com`;

async function main() {
  // 1. Compte jetable en base (bcrypt, format auth.users Supabase).
  const c = new Pg({ host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.imbziizequckeaxuotdz', password: lire('SUPABASE_DB_PASSWORD'), database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
    const uid = crypto.randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
     values ('${uid}', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','${COURRIEL}', crypt('${MDP}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"pseudo":"Probe V4"}', now(), now(), '', '', '', '')`
  );
  await c.query(`insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at) values ($1::uuid,'email',$1::text, jsonb_build_object('sub', $2::text, 'email', $3::text), now(), now(), now()) on conflict do nothing`, [uid, uid, COURRIEL]);
  // Profil (pseudo) si le trigger ne l'a pas posé.
  await c.query(`insert into public.profiles (id, pseudo) values ($1, 'Probe V4') on conflict (id) do nothing`, [uid]);
  await c.end();
  console.log('Compte jetable :', uid);

  // 2. Session par mot de passe.
  const rep = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COURRIEL, password: MDP }),
  });
  const sess = (await rep.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!sess.access_token) throw new Error(`session refusée : ${JSON.stringify(sess).slice(0, 200)}`);
  console.log('Session OK');

  // 3. Cookie @supabase/ssr : « base64- » + base64url(JSON de la
  //    session), découpé en chunks de 3180 caractères (.0, .1…).
  const brut = Buffer.from(JSON.stringify(sess)).toString('base64url');
  const valeur = `base64-${brut}`;
  const cle = `sb-${REF}-auth-token`;
  const morceaux: string[] = [];
  for (let i = 0; i * 3180 < valeur.length; i += 1) {
    const part = valeur.slice(i * 3180, (i + 1) * 3180);
    morceaux.push(
      morceaux.length === 0 && valeur.length <= 3180
        ? `${cle}=${part}`
        : `${cle}.${morceaux.length}=${part}`
    );
  }
  const cookie = morceaux.join('; ');
  const H = { Cookie: cookie, 'Content-Type': 'application/json' };
  const SITE = 'https://plumedombres.kodelyza.com';

  // 4. Validation de session : page /clubs.
  const rClubs = await fetch(`${SITE}/clubs`, { headers: { Cookie: cookie } });
  console.log('GET /clubs →', rClubs.status);

  // 5. Créer un club de test.
  const rClub = await fetch(`${SITE}/api/clubs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ action: 'creer', titre: 'Club de vérification V4', description: 'Vérification en ligne des onglets.', livreId: null }),
  });
  const club = (await rClub.json()) as { club?: { id?: string; id_club?: string }; erreur?: string; [k: string]: unknown };
  console.log('POST /api/clubs →', rClub.status, JSON.stringify(club).slice(0, 160));
  const clubId = (club.club?.id ?? club.club?.id_club ?? (club as { id?: string }).id) as string | undefined;
  if (!clubId) throw new Error('club non créé');
  console.log('Club :', clubId);

  // 6. Mon rôle après création (doit être admin).
  const pg2 = new Pg({ host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.imbziizequckeaxuotdz', password: lire('SUPABASE_DB_PASSWORD'), database: 'postgres', ssl: { rejectUnauthorized: false } });
  await pg2.connect();
  const role = await pg2.query(`select role from public.clubs_membres where club_id=$1 and utilisateur_id=$2`, [clubId, uid]);
  console.log('Rôle créateur :', role.rows[0]?.role);

  // 7. Un livre + chapitres de test pour le programme.
  const livre = await pg2.query(
    `insert into public.livres (proprietaire_id, titre, auteur) values ($1,'Livre de vérification V4','Probe') returning id`,
    [uid]
  );
  const livreId = livre.rows[0].id as string;
  for (let i = 1; i <= 10; i += 1) {
    await pg2.query(`insert into public.chapitres (livre_id, position, titre) values ($1,$2,$3)`, [livreId, i, `Chapitre ${i}`]);
  }
  const att = await pg2.query(`update public.clubs set livre_id=$1 where id=$2`, [livreId, clubId]);
  console.log('Livre de test lié :', livreId, att.rowCount);

  // 8. Programme d'étapes (4 ch/semaine sur 10 chapitres → 3 étapes).
  const rEt = await fetch(`${SITE}/api/clubs/${clubId}/etapes`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'generer', totalChapitres: 10, parEtape: 4 }),
  });
  console.log('POST etapes generer →', rEt.status, JSON.stringify(await rEt.json()).slice(0, 120));
  const rEtGet = await fetch(`${SITE}/api/clubs/${clubId}/etapes`, { headers: { Cookie: cookie } });
  const etapes = (await rEtGet.json()) as { etapes?: Array<{ numero: number; ouverte: boolean; chapitreA: number }>; dernierChapitreDebloque?: number | null };
  console.log('GET etapes →', rEtGet.status, `${etapes.etapes?.length} étapes, dernier ouvert ch.${etapes.dernierChapitreDebloque}`);

  // 9. Ouvrir l'étape 2.
  const rOuvre = await fetch(`${SITE}/api/clubs/${clubId}/etapes`, { method: 'PATCH', headers: H, body: JSON.stringify({ numero: 2 }) });
  console.log('PATCH etapes (ouvrir 2) →', rOuvre.status);

  // 10. Sondage + vote.
  const rSond = await fetch(`${SITE}/api/clubs/${clubId}/sondages`, {
    method: 'POST', headers: H, body: JSON.stringify({ question: 'Quel rythme ?', options: ['Quatre chapitres par semaine', 'Deux chapitres par semaine', 'Chacun à son rythme'] }),
  });
  const sond = (await rSond.json()) as { sondageId?: string };
  console.log('POST sondages →', rSond.status, sond.sondageId);
  const rOpt = await fetch(`${SITE}/api/clubs/${clubId}/sondages`, { headers: { Cookie: cookie } });
  const listeS = (await rOpt.json()) as { sondages?: Array<{ id: string; options: Array<{ id: string; label: string }>; repartition: Record<string, number>; parMoi: boolean }> };
  const s1 = listeS.sondages?.[0];
  console.log('GET sondages →', rOpt.status, `options=${s1?.options.length}, repartition=${Object.keys(s1?.repartition ?? {}).length}`);
  const opt1 = s1?.options[0]?.id;
  const rVote = await fetch(`${SITE}/api/clubs/${clubId}/sondages/vote`, { method: 'POST', headers: H, body: JSON.stringify({ sondageId: s1?.id, optionId: opt1 }) });
  console.log('POST vote →', rVote.status);
  const rVote2 = await fetch(`${SITE}/api/clubs/${clubId}/sondages/vote`, { method: 'POST', headers: H, body: JSON.stringify({ sondageId: s1?.id, optionId: opt1 }) });
  console.log('POST vote DOUBLON →', rVote2.status, '(409 attendu)');

  // 11. Rencontre + participation.
  const rRen = await fetch(`${SITE}/api/clubs/${clubId}/rencontres`, {
    method: 'POST', headers: H, body: JSON.stringify({ titre: 'Rencontre — Étape 1', prevuLe: new Date(Date.now() + 3 * 86_400_000).toISOString(), mode: 'salon écrit' }),
  });
  const ren = (await rRen.json()) as { rencontreId?: string };
  console.log('POST rencontres →', rRen.status, ren.rencontreId);
  const rPart = await fetch(`${SITE}/api/clubs/${clubId}/rencontres/participation`, { method: 'POST', headers: H, body: JSON.stringify({ rencontreId: ren.rencontreId }) });
  const part = (await rPart.json()) as { participe?: boolean };
  console.log('POST participation (bascule off) →', rPart.status, part.participe);

  // 12. Message + signalement + traitement staff.
  const rMsg = await fetch(`${SITE}/api/clubs/${clubId}`, { method: 'POST', headers: H, body: JSON.stringify({ contenu: 'Message de vérification pour la file de modération.', chapitreMax: 0 }) });
  console.log('POST message →', rMsg.status);
  const msgs = await pg2.query(`select id from public.clubs_messages where club_id=$1 order by id desc limit 1`, [clubId]);
  const msgId = msgs.rows[0].id as number;
  const rSig = await fetch(`${SITE}/api/clubs/${clubId}/signalements`, { method: 'POST', headers: H, body: JSON.stringify({ messageId: msgId, motif: 'Hors sujet', detail: 'Vérification' }) });
  console.log('POST signalement →', rSig.status);
  const rFile = await fetch(`${SITE}/api/clubs/${clubId}/signalements`, { headers: { Cookie: cookie } });
  const file = (await rFile.json()) as { enAttente?: Array<{ id: string; motif: string }> };
  console.log('GET file →', rFile.status, `${file.enAttente?.length} en attente`);
  const rTrait = await fetch(`${SITE}/api/clubs/${clubId}/signalements`, { method: 'PATCH', headers: H, body: JSON.stringify({ id: file.enAttente?.[0]?.id, action: 'masquer' }) });
  console.log('PATCH masquer →', rTrait.status);
  const masque = await pg2.query(`select masque from public.clubs_messages where id=$1`, [msgId]);
  console.log('Message masqué en base :', masque.rows[0]?.masque);

  // 13. Page salon en ligne (contient les onglets ?).
  const rSalon = await fetch(`${SITE}/clubs/${clubId}`, { headers: { Cookie: cookie } });
  const htmlSalon = await rSalon.text();
  console.log('GET /clubs/[id] →', rSalon.status, '| onglets :', ['Programme de lecture', 'Sondages', 'Membres', 'Rencontres'].map((t) => htmlSalon.includes(t)).join(','));

  // 14. Nettoyage : club, livre, compte.
  await pg2.query(`delete from public.clubs where id=$1`, [clubId]);
  await pg2.query(`delete from public.livres where id=$1`, [livreId]);
  await pg2.query(`delete from auth.users where id=$1`, [uid]);
  await pg2.end();
  console.log('Nettoyage fait.');
}

main().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
