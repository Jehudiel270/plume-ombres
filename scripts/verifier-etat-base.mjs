// ============================================================
// verifier-etat-base.mjs — État de la base SANS accès administrateur.
//
// Sonde le projet Supabase via l'API REST avec la clé anon (publique) :
// une table/fonction absente répond 404, une présente répond autre
// chose (401 = présente mais protégée par RLS, comportement attendu).
// Aucune donnée n'est lue, aucun secret n'est requis.
//
// Usage :
//   node scripts/verifier-etat-base.mjs
// Prérequis : NEXT_PUBLIC_SUPABASE_ANON_KEY (environnement ou .env.local).
// ============================================================
import { readFileSync } from 'node:fs';

function lireEnv(cle) {
  if (process.env[cle]) return process.env[cle];
  try {
    const contenu = readFileSync('.env.local', 'utf8');
    const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
    return ligne ? ligne.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const JETON = lireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!JETON) {
  console.error('Clé anon introuvable : définissez NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}
let REF = '';
try {
  REF = JSON.parse(Buffer.from(JETON.split('.')[1], 'base64').toString('utf8')).ref;
} catch {
  console.error('Clé anon illisible (JWT attendu).');
  process.exit(1);
}
const BASE = `https://${REF}.supabase.co/rest/v1`;

// Chaque entrée = un objet attendu APRÈS application du fichier
// consolidé docs/sql/migrations-chantier-consolidees.sql (avec, en
// commentaire, la migration qui le crée).
const ATTENDUS = [
  ['table', 'fonctionnalites_etats', '20261112000001'],
  ['table', 'carnet_notes', '20261112000002'],
  ['table', 'theories', '20261112000003'],
  ['table', 'graphe_personnages', '20261112000004'],
  ['table', 'graphe_relations', '20261112000004'],
  ['table', 'resume_lectures', '20261112000005'],
  ['table', 'lectures_xp', '20261112000006'],
  ['table', 'badges_obtenus', '20261112000006'],
  ['table', 'ambiance_livres', '20261112000007'],
  ['table', 'univers', '20261112000008'],
  ['table', 'univers_livres', '20261112000008'],
  ['table', 'parametres_systeme', '20261113000001'],
  ['table', 'cles_api', '20261113000002'],
  ['table', 'evenements_webhook', '20261114000002'],
  ['fonction', 'admin_stats_revenus', '20261114000001'],
  ['fonction', 'admin_supprimer_compte', '20261111000002'],
];

// Objets PRÉEXISTANTS dont dépend le fichier consolidé (télé-diagnostic).
const DEPENDANCES = [
  ['table', 'abonnements'], ['table', 'admin_actions'], ['table', 'chapitres'],
  ['table', 'livres'], ['table', 'paiements'], ['table', 'plans_abonnement'],
  ['table', 'profiles'], ['fonction', 'est_admin'], ['fonction', 'est_super_admin'],
];

async function sonderTable(t) {
  const r = await fetch(`${BASE}/${t}?select=*&limit=0`, {
    headers: { apikey: JETON, Authorization: `Bearer ${JETON}` },
  });
  if (r.status === 404) return { present: false, detail: 'absente' };
  if (r.ok || r.status === 401 || r.status === 403) return { present: true, detail: `HTTP ${r.status}` };
  const c = await r.json().catch(() => ({}));
  return { present: r.status !== 404, detail: `HTTP ${r.status} ${c.code || ''}` };
}

async function sonderFonction(f) {
  const r = await fetch(`${BASE}/rpc/${f}`, {
    method: 'POST',
    headers: { apikey: JETON, Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const c = await r.json().catch(() => ({}));
  const absente = r.status === 404 || /Could not find the function/i.test(c.message || '');
  return absente ? { present: false, detail: 'absente' } : { present: true, detail: `HTTP ${r.status}` };
}

async function sonder(type, nom) {
  return type === 'table' ? sonderTable(nom) : sonderFonction(nom);
}

console.log(`Projet : ${REF} (sonde anonyme, aucune donnée lue)\n`);

console.log('— DÉPENDANCES PRÉEXISTANTES —');
let dependancesOk = true;
for (const [type, nom] of DEPENDANCES) {
  const s = await sonder(type, nom);
  dependancesOk &&= s.present;
  console.log(`  ${s.present ? '✓' : '✗'} ${nom} (${s.detail})`);
}

console.log('\n— MIGRATIONS DU CHANTIER (fichier consolidé) —');
let manquantes = 0;
for (const [type, nom, migration] of ATTENDUS) {
  const s = await sonder(type, nom);
  if (!s.present) manquantes += 1;
  console.log(`  ${s.present ? '✓' : '✗'} ${nom} — ${s.present ? 'appliquée' : 'À APPLIQUER'} (${migration})`);
}

console.log('\n— VERDICT —');
if (manquantes === 0) {
  console.log('Tout est appliqué : rien à faire côté base.');
} else {
  console.log(
    `${manquantes} objet(s) manquant(s) : coller docs/sql/migrations-chantier-consolidees.sql\n` +
    'dans le SQL Editor de Supabase, ou fournir SUPABASE_DB_PASSWORD\n' +
    'puis : npx tsx scripts/appliquer-sql.ts docs/sql/migrations-chantier-consolidees.sql'
  );
  process.exit(2);
}
