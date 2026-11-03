// ============================================================
// scripts/verifier-inscription.mjs — Épreuve du parcours d'un visiteur
// qui arrive d'une publicité : inscription réelle (API publique, clé anon),
// puis vérification que son espace existe (profil, essai, crédits).
// Le compte est supprimé à la fin.
// ============================================================
import { randomUUID } from 'node:crypto';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://plume-ombres.vercel.app';

const manque = Object.entries({ URL_BASE, ANON, SERVICE }).filter(([, v]) => !v).map(([k]) => k);
if (manque.length) {
  console.error('Variables manquantes :', manque.join(', '));
  process.exit(1);
}

const entetesJson = { 'Content-Type': 'application/json', apikey: ANON };
const entetesService = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

let echecs = 0;
function verifier(nom, ok, detail = '') {
  console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ' — ' + detail : ''}`);
  if (!ok) echecs += 1;
}

const email = `test-pub-${randomUUID().slice(0, 8)}@example.invalid`;
const motDePasse = `Essai-${randomUUID().slice(0, 12)}!`;

const t0 = Date.now();

// 1. Inscription comme le ferait le formulaire du site.
const r = await fetch(`${URL_BASE}/auth/v1/signup`, {
  method: 'POST',
  headers: entetesJson,
  body: JSON.stringify({
    email,
    password: motDePasse,
    data: { pseudo: 'Visiteur test' },
    gotrue_meta_security: {},
  }),
});
const corps = await r.json().catch(() => ({}));
verifier('inscription acceptée', r.status === 200 || r.status === 201, `${r.status} en ${Date.now() - t0} ms`);
verifier('compte immédiatement actif (pas de blocage e-mail)', Boolean(corps?.access_token || corps?.user?.id), corps?.user?.id ?? '');

let id = corps?.user?.id;
let jeton = corps?.access_token;

if (!id) {
  const redeux = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: entetesJson,
    body: JSON.stringify({ email, password: motDePasse }),
  });
  const j = await redeux.json().catch(() => ({}));
  id = j?.user?.id;
  jeton = j?.access_token;
  verifier('connexion juste après inscription', redeux.status === 200, String(redeux.status));
}

if (!id) {
  console.error('Impossible de créer le compte de test — abandon.');
  process.exit(1);
}

try {
  // 2. L'espace du visiteur doit exister côté base (déclencheurs).
  const lire = async (table, colonne = 'id') => {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&${colonne}=eq.${id}`, {
      headers: entetesService,
    });
    const j = await res.json().catch(() => []);
    return Array.isArray(j) ? j : [];
  };

  const profil = await lire('profiles');
  verifier('profil créé automatiquement', profil.length === 1, `${profil.length} ligne(s)`);

  const essai = await lire('essais_abonnement', 'compte_id');
  verifier('essai de lancement attribué', essai.length >= 1, `${essai.length} ligne(s)`);

  const credits = await lire('credits_traduction', 'proprietaire_id');
  // Informatif : le solde de crédits est créé à l'achat, jamais à
  // l'inscription (le site ne lit cette table que via des fonctions SQL).
  console.log(`  info crédits : ${credits.length} ligne(s) (normal : 0 à l'inscription)`);

  const abo = await lire('abonnements', 'proprietaire_id');
  verifier('abonnement (même gratuit) présent', abo.length >= 1, `${abo.length} ligne(s)`);
  const essaiActif =
    abo[0]?.plan === 'essai' &&
    abo[0]?.statut === 'actif' &&
    Boolean(abo[0]?.essai_fin) &&
    new Date(abo[0].essai_fin).getTime() > Date.now();
  verifier('essai actif et daté dans le futur', essaiActif, `${abo[0]?.plan ?? '?'} / ${abo[0]?.statut ?? '?'} / fin ${abo[0]?.essai_fin ?? '?'}`);

  // 3. Le visiteur peut-il lire son espace avec son propre jeton ?
  const perso = await fetch(`${URL_BASE}/rest/v1/profiles?select=id,pseudo&id=eq.${id}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jeton}` },
  });
  const corpsPerso = await perso.json().catch(() => []);
  verifier('espace lisible avec son jeton (RLS)', perso.status === 200 && Array.isArray(corpsPerso) && corpsPerso.length === 1, String(perso.status));

  // 4. Le site public répond bien au visiteur non connecté.
  const accueil = await fetch(SITE, { redirect: 'follow' });
  const html = await accueil.text();
  verifier('page d’accueil publique', accueil.ok, String(accueil.status));
  verifier('image de partage déclarée', /property="og:image"/.test(html), /og:image/.test(html) ? 'og:image présente' : 'absente');
  verifier('tarifs publics', (await fetch(`${SITE}/tarifs`)).status === 200, '');
  verifier('conditions publiques', (await fetch(`${SITE}/conditions`)).status === 200, '');
} finally {
  // 5. Nettoyage : le compte de test ne doit pas rester.
  const sup = await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: entetesService,
  });
  verifier('compte de test supprimé', sup.ok, String(sup.status));
}

console.log(echecs === 0 ? '\nTOUT EST VERT' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
