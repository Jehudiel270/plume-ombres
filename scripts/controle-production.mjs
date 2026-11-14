// Contrôle post-déploiement : clubs e2e, pages clés, graphe IA route.
const URL_SITE = 'https://plumedombres.kodelyza.com';
const URL_SB = 'https://imbziizequckeaxuotdz.supabase.co';
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltYnppaXplcXVja2VheHVvdGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDMzNzUsImV4cCI6MjEwNDAxOTM3NX0.eOzPwylvKiA7N2vpyZlCYcsMkICrIdhbC4EUzKKBGuU';
const REF = 'imbziizequckeaxuotdz';

let echecs = 0;
function point(nom, ok, detail = '') {
  console.log(`${ok ? '•' : '✖'} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
}

// 1) Pages publiques et privées (coques) répondent.
for (const chemin of ['/', '/tarifs', '/faq', '/connexion', '/bibliotheque', '/ambiance', '/clubs']) {
  try {
    const r = await fetch(`${URL_SITE}${chemin}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const ok = r.status === 200 || r.status === 307 || r.status === 302;
    point(`GET ${chemin}`, ok, `HTTP ${r.status}`);
  } catch (e) {
    point(`GET ${chemin}`, false, e.message);
  }
}

// 2) Route IA graphe : sans session → 401 (la route existe et répond).
try {
  const r = await fetch(`${URL_SITE}/api/livres/00000000-0000-0000-0000-000000000000/graphe/ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'proposer', niveauDetail: 'detaille', chapitreLu: 1 }),
    signal: AbortSignal.timeout(20_000),
  });
  point('POST graphe/ia sans session', r.status === 401, `HTTP ${r.status}`);
} catch (e) {
  point('POST graphe/ia sans session', false, e.message);
}

// 3) Création de club END-TO-END (signup + POST /api/clubs).
const email = `controle-club-${Date.now()}@example.com`;
try {
  const rInscription = await fetch(`${URL_SB}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Controle-2026!' }),
    signal: AbortSignal.timeout(15_000),
  });
  const corpsInscription = await rInscription.json();
  const session = corpsInscription.session ?? corpsInscription;
  if (!session.access_token) throw new Error('signup sans session');
  const b64url = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const rClubs = await fetch(`${URL_SITE}/api/clubs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sb-${REF}-auth-token=base64-${b64url}`,
    },
    body: JSON.stringify({ action: 'creer', titre: 'Club de contrôle' }),
    signal: AbortSignal.timeout(25_000),
  });
  const corps = await rClubs.json();
  point('Création de club e2e', rClubs.status === 201, `HTTP ${rClubs.status} ${JSON.stringify(corps).slice(0, 80)}`);
} catch (e) {
  point('Création de club e2e', false, e.message);
}

console.log(echecs === 0 ? '\nTOUT EST VERT' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
