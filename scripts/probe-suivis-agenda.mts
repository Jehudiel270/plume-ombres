// Vérification EN LIGNE du chantier « Suivis des œuvres + agenda des
// sorties » (15/11/2026) : compte jetable, session réelle, cookies
// @supabase/ssr, rendu des pages, appels API, notifications de club.
// Les comptes jetables sont SUPPRIMÉS à la fin.
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
const SUFFIXE = Date.now();
const COURRIEL_A = `probe-suivi-a-${SUFFIXE}@example.com`;
const COURRIEL_B = `probe-suivi-b-${SUFFIXE}@example.com`;
const SITE = 'https://plumedombres.kodelyza.com';

function cookieDepuis(sess: { access_token?: string; refresh_token?: string }): string {
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
  return morceaux.join('; ');
}

async function creerCompte(
  c: Pg,
  courriel: string,
  pseudo: string
): Promise<string> {
  const uid = crypto.randomUUID();
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
     values ('${uid}', '00000000-0000-0000-0000-000000000000','authenticated','authenticated','${courriel}', crypt('${MDP}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', $1::jsonb, now(), now(), '', '', '', '')`,
    [JSON.stringify({ pseudo })]
  );
  await c.query(
    `insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at) values ($1::uuid,'email',$1::text, jsonb_build_object('sub', $2::text, 'email', $3::text), now(), now(), now()) on conflict do nothing`,
    [uid, uid, courriel]
  );
  await c.query(`insert into public.profiles (id, pseudo) values ($1, $2) on conflict (id) do nothing`, [uid, pseudo]);
  return uid;
}

async function session(courriel: string) {
  const rep = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: courriel, password: MDP }),
  });
  const s = (await rep.json()) as { access_token?: string; refresh_token?: string };
  if (!s.access_token) throw new Error(`session refusée pour ${courriel}`);
  return s;
}

let verifications = 0;
let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  verifications += 1;
  if (condition) {
    console.log(`  ✓ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    echecs += 1;
    console.log(`  ✗ ÉCHEC : ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const c = new Pg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lire('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1. Deux comptes jetables (A : propriétaire du livre ; B : membre du club).
  const uidA = await creerCompte(c, COURRIEL_A, 'Probe Suivi A');
  const uidB = await creerCompte(c, COURRIEL_B, 'Probe Suivi B');
  console.log('Comptes jetables :', uidA, uidB);

  // 2. Un livre dans l'atelier de A + sa fiche d'ambiance minimale.
  const livreId = crypto.randomUUID();
  await c.query(
    `insert into public.livres (id, proprietaire_id, titre, auteur, statut) values ($1, $2, 'Probe du Suivi', 'Auteur Probe', 'traduit')`,
    [livreId, uidA]
  );
  await c.query(
    `insert into public.chapitres (livre_id, position, titre, statut) values ($1, 1, 'Chapitre un', 'traduit')`,
    [livreId]
  );
  await c.query(
    `insert into public.ambiance_livres (livre_id, genres, atmosphere, ton, rythme_niveau, origine)
     values ($1, '{Fantasy sombre}', 'Une ambiance de vérification.', 'Grave', 3, 'manuel')`,
    [livreId]
  );
  console.log('Livre probe :', livreId);

  // 3. Session A + un club avec B membre.
  const sessA = await session(COURRIEL_A);
  await session(COURRIEL_B); // prouve que B existe
  const H = { Cookie: cookieDepuis(sessA), 'Content-Type': 'application/json' };

  const rClub = await fetch(`${SITE}/api/clubs`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'creer', titre: 'Club Probe Suivi', description: 'Vérification en ligne' }),
  });
  const clubTxt = await rClub.text();
  const club = JSON.parse(clubTxt) as { id?: string; erreur?: string };
  console.log('  réponse clubs :', rClub.status, clubTxt.slice(0, 200));
  const clubId = club.id;
  verifier('POST /api/clubs (création)', rClub.status === 201 || rClub.status === 200, `status=${rClub.status}`);
  if (!clubId) throw new Error('club non créé');
  // B membre (SQL : l'adhésion par code n'est pas testée ici).
  await c.query(
    `insert into public.clubs_membres (club_id, utilisateur_id, position_lecture, role) values ($1, $2, 1, 'membre') on conflict do nothing`,
    [clubId, uidB]
  );

  // 4. Programme de lecture posé (étape 1 ouverte d'office).
  const rProg = await fetch(`${SITE}/api/clubs/${clubId}/etapes`, {
    method: 'POST', headers: H, body: JSON.stringify({ action: 'generer', totalChapitres: 12 }),
  });
  verifier('POST etapes (programme 12 ch → 3 étapes)', rProg.status === 200 || rProg.status === 201, `status=${rProg.status}`);

  // 5. Suivi du livre par A : POST puis GET puis doublon idempotent.
  const rSuivi = await fetch(`${SITE}/api/suivis`, {
    method: 'POST', headers: H, body: JSON.stringify({ livreId }),
  });
  verifier('POST /api/suivis (suivre son livre)', rSuivi.status === 201, `status=${rSuivi.status}`);
  const rSuivi2 = await fetch(`${SITE}/api/suivis`, {
    method: 'POST', headers: H, body: JSON.stringify({ livreId }),
  });
  const jSuivi2 = (await rSuivi2.json()) as { dejaSuivi?: boolean };
  verifier('POST /api/suivis (doublon idempotent)', rSuivi2.status === 200 && jSuivi2.dejaSuivi === true, `status=${rSuivi2.status}`);

  // 6. Un livre d'AUTRUI : refusé (RLS + policy).
  const livreAutrui = crypto.randomUUID();
  await c.query(
    `insert into public.livres (id, proprietaire_id, titre, statut) values ($1, $2, 'Livre de B', 'traduit')`,
    [livreAutrui, uidB]
  );
  const rAutrui = await fetch(`${SITE}/api/suivis`, {
    method: 'POST', headers: H, body: JSON.stringify({ livreId: livreAutrui }),
  });
  verifier('POST /api/suivis (livre d’autrui refusé)', rAutrui.status === 403 || rAutrui.status === 404 || rAutrui.status === 422, `status=${rAutrui.status}`);

  // 7. GET /api/suivis : le livre suivi apparaît, avec chapitres.
  const rListe = await fetch(`${SITE}/api/suivis`, { headers: { Cookie: cookieDepuis(sessA) } });
  const liste = (await rListe.json()) as { suivis?: Array<{ livreId: string; chapitresTotal: number }>; agenda?: unknown[]; sorties?: Array<{ id: string }> };
  verifier('GET /api/suivis (200)', rListe.status === 200, `status=${rListe.status}`);
  verifier('le livre suivi est listé avec ses chapitres', !!liste.suivis?.some((s) => s.livreId === livreId && s.chapitresTotal >= 1), `suivis=${liste.suivis?.length}`);
  verifier('l’œuvre traduite apparaît dans les sorties', !!liste.sorties?.some((s) => s.id === livreId), `sorties=${liste.sorties?.length}`);

  // 8. Pages rendues en ligne.
  const rPage = await fetch(`${SITE}/suivis`, { headers: { Cookie: cookieDepuis(sessA) } });
  const pageTxt = await rPage.text();
  verifier('GET /suivis (200)', rPage.status === 200, `status=${rPage.status}`);
  verifier('page /suivis : titre + œuvres suivies rendus', pageTxt.includes('Suivis') && pageTxt.includes('Probe du Suivi'));
  const rPageLivre = await fetch(`${SITE}/livres/${livreId}`, { headers: { Cookie: cookieDepuis(sessA) } });
  const pageLivre = await rPageLivre.text();
  // Le livre est ALORS suivi : le bouton affiche l'état « Œuvre suivie ».
  verifier('fiche livre : bouton de suivi rendu (état suivi)', rPageLivre.status === 200 && pageLivre.includes('Œuvre suivie') && pageLivre.includes('aria-pressed="true"'), `status=${rPageLivre.status}`);
  const rPageAmb = await fetch(`${SITE}/ambiance/${livreId}`, { headers: { Cookie: cookieDepuis(sessA) } });
  const pageAmb = await rPageAmb.text();
  verifier('fiche ambiance : bouton de suivi rendu', rPageAmb.status === 200 && (pageAmb.includes('Œuvre suivie') || pageAmb.includes('Suivre cette œuvre')), `status=${rPageAmb.status}`);

  // 9. Notifications de club : A ouvre l'étape 2, B doit recevoir
  //    une notification type 'club'.
  const rOuvre = await fetch(`${SITE}/api/clubs/${clubId}/etapes`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ numero: 2 }),
  });
  verifier('PATCH etapes (ouvrir étape 2)', rOuvre.status === 200, `status=${rOuvre.status}`);
  const rRen = await fetch(`${SITE}/api/clubs/${clubId}/rencontres`, {
    method: 'POST', headers: H, body: JSON.stringify({ titre: 'Rencontre probe', prevuLe: new Date(Date.now() + 3 * 86_400_000).toISOString(), mode: 'salon écrit' }),
  });
  verifier('POST rencontres (proposer)', rRen.status === 200 || rRen.status === 201, `status=${rRen.status}`);
  const rSond = await fetch(`${SITE}/api/clubs/${clubId}/sondages`, {
    method: 'POST', headers: H, body: JSON.stringify({ question: 'On continue ?', options: ['Oui', 'Non'] }),
  });
  verifier('POST sondages (publier)', rSond.status === 200 || rSond.status === 201, `status=${rSond.status}`);

  // B : les trois événements ont généré des notifications type 'club'.
  const notifsB = await c.query(
    `select titre from public.notifications where proprietaire_id = $1 and type = 'club' order by cree_le`,
    [uidB]
  );
  const titres = notifsB.rows.map((r) => String((r as { titre: string }).titre));
  verifier('B notifié : étape ouverte', titres.some((t) => t.includes('Étape 2')), `notifs=${titres.length}`);
  verifier('B notifié : nouvelle rencontre', titres.some((t) => t.includes('rencontre')), '');
  verifier('B notifié : nouveau sondage', titres.some((t) => t.includes('sondage')), '');
  verifier('A ne reçoit PAS ses propres événements', !(await c.query(`select 1 from public.notifications where proprietaire_id = $1 and type = 'club'`, [uidA])).rowCount, '');
  // L'agenda de A contient maintenant la rencontre probe.
  const liste2 = (await (await fetch(`${SITE}/api/suivis`, { headers: { Cookie: cookieDepuis(sessA) } })).json()) as { agenda?: Array<{ titre: string }> };
  verifier('agenda : la rencontre apparaît dans /api/suivis', !!liste2.agenda?.some((e) => e.titre.includes('Rencontre probe')), `agenda=${liste2.agenda?.length}`);

  // 10. Ne plus suivre : DELETE puis GET sans le livre, et la fiche
  //     du livre montre alors l'état non-suivi (« Suivre cette œuvre »).
  const rRetire = await fetch(`${SITE}/api/suivis?livreId=${livreId}`, { method: 'DELETE', headers: { Cookie: cookieDepuis(sessA) } });
  verifier('DELETE /api/suivis', rRetire.status === 200, `status=${rRetire.status}`);
  const liste3 = (await (await fetch(`${SITE}/api/suivis`, { headers: { Cookie: cookieDepuis(sessA) } })).json()) as { suivis?: Array<{ livreId: string }> };
  verifier('le livre n’est plus suivi', !liste3.suivis?.some((s) => s.livreId === livreId), `suivis=${liste3.suivis?.length}`);
  const pageApres = await (await fetch(`${SITE}/livres/${livreId}`, { headers: { Cookie: cookieDepuis(sessA) } })).text();
  verifier('fiche livre : bouton repasse à « Suivre cette œuvre »', pageApres.includes('Suivre cette œuvre') && pageApres.includes('aria-pressed="false"'), '');

  // 11. Nettoyage : comptes jetables supprimés (cascade livres, clubs).
  await c.query(`delete from auth.users where id in ($1, $2)`, [uidA, uidB]);
  const reste = await c.query(`select count(*)::int as n from public.livres where id in ($1, $2)`, [livreId, livreAutrui]);
  verifier('comptes jetables supprimés (cascade données)', reste.rows[0].n === 0, `livres restants=${reste.rows[0].n}`);
  await c.end();

  console.log(`\nRésultat : ${verifications - echecs}/${verifications} vérifications réussies`);
  if (echecs > 0) {
    console.log(`${echecs} ÉCHEC(S) — à corriger avant livraison.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('PANNE :', e.message);
  process.exit(1);
});
