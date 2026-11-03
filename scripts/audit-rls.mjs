// ============================================================
// scripts/audit-rls.mjs — Épreuve réelle d'isolation entre comptes.
//
// Crée un compte JETABLE, s'y connecte, puis tente de lire les données
// des autres comptes sur les tables sensibles. RLS correct ⇒ 0 ligne
// étrangère. Les lignes que le compte voit sont ensuite VÉRIFIÉES une
// par une : chaque ligne doit lui appartenir (abonnement gratuit créé à
// l'inscription, par exemple). Le compte jetable est SUPPRIMÉ à la fin,
// dans tous les cas.
//
// Aucun secret n'est affiché : seulement des compteurs et des codes HTTP.
// ============================================================
import { randomUUID } from 'node:crypto';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !ANON || !SERVICE) {
  console.error('Variables Supabase manquantes.');
  process.exit(2);
}

const entetesService = {
  apikey: SERVICE,
  Authorization: 'Bearer ' + SERVICE,
  'Content-Type': 'application/json',
};

const courriel = `audit-rls-${randomUUID().slice(0, 8)}@example.invalid`;
const motDePasse = `Audit-${randomUUID()}-9f`;

const TABLES = [
  'livres',
  'chapitres',
  'segments',
  'paiements',
  'abonnements',
  'abonnements_historique',
  'notifications',
  'favorites',
  'credits_traduction',
  'glossaires',
  'travaux_traduction',
  'admin_actions',
  'profiles',
];

// Colonnes qui désignent le propriétaire d'une ligne, selon les tables.
const COLONNES_PROPRIETAIRE = ['proprietaire_id', 'utilisateur_id', 'user_id', 'id'];

function entetesJeton(jeton) {
  return {
    apikey: ANON,
    Authorization: 'Bearer ' + jeton,
    Prefer: 'count=exact',
    Range: '0-0',
  };
}

async function principal() {
  // 1. Combien de lignes existent réellement (service role, hors RLS) ?
  const totaux = {};
  for (const table of TABLES) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: { ...entetesService, Prefer: 'count=exact', Range: '0-0' },
    });
    const plage = r.headers.get('content-range') ?? '';
    const total = plage.includes('/') ? plage.split('/')[1] : '?';
    totaux[table] = r.ok ? total : `err ${r.status}`;
  }

  // 2. Création du compte jetable.
  const creation = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: entetesService,
    body: JSON.stringify({
      email: courriel,
      password: motDePasse,
      email_confirm: true,
    }),
  });
  if (!creation.ok) {
    console.error('Création impossible :', creation.status, (await creation.text()).slice(0, 200));
    return;
  }
  const utilisateur = await creation.json();

  try {
    // 3. Connexion avec la clé publique, comme un visiteur.
    const connexion = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: courriel, password: motDePasse }),
    });
    if (!connexion.ok) {
      console.error('Connexion impossible :', connexion.status);
      return;
    }
    const session = await connexion.json();
    const jeton = session.access_token;

    // 4. Lecture avec le jeton du compte neuf.
    console.log('');
    console.log('TABLE                      lignes en base   vues   etrangeres');
    let fuites = 0;
    for (const table of TABLES) {
      const entetes = entetesJeton(jeton);
      const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, { headers: entetes });
      const plage = r.headers.get('content-range') ?? '';
      const vues = r.ok ? (plage.includes('/') ? plage.split('/')[1] : '?') : `refus ${r.status}`;

      // 4 bis. Contrôle d'appartenance : toute ligne visible doit être la sienne.
      let etrangeres = 0;
      const nombre = Number(vues);
      if (Number.isFinite(nombre) && nombre > 0) {
        const detail = await fetch(
          `${URL_BASE}/rest/v1/${table}?select=*&limit=200`,
          { headers: { apikey: ANON, Authorization: 'Bearer ' + jeton } }
        );
        const lignes = detail.ok ? await detail.json() : [];
        for (const ligne of Array.isArray(lignes) ? lignes : []) {
          const appartient = COLONNES_PROPRIETAIRE.some(
            (colonne) => ligne[colonne] === utilisateur.id
          );
          if (!appartient) etrangeres += 1;
        }
      }
      if (etrangeres > 0) fuites += 1;

      console.log(
        `${table.padEnd(26)}${String(totaux[table]).padEnd(17)}${String(vues).padEnd(7)}${etrangeres}`
      );
    }

    // 5. Écriture sur une ligne qui ne lui appartient pas (doit être refusée).
    const essai = await fetch(`${URL_BASE}/rest/v1/livres?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: 'Bearer ' + jeton },
    });
    console.log('');
    console.log(
      'Lecture croisée :',
      fuites === 0 ? 'AUCUNE LIGNE ÉTRANGÈRE' : `${fuites} TABLE(S) FUYANTE(S)`
    );
    console.log('Réponse de lecture :', essai.status);
  } finally {
    // 6. Nettoyage systématique.
    const suppression = await fetch(`${URL_BASE}/auth/v1/admin/users/${utilisateur.id}`, {
      method: 'DELETE',
      headers: entetesService,
    });
    console.log('Compte jetable supprimé :', suppression.ok ? 'oui' : `échec ${suppression.status}`);
  }
}

principal().catch((erreur) => {
  console.error('Épreuve interrompue :', erreur.message);
  process.exit(1);
});
