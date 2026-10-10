// Configure le site Netlify de Plume d'Ombres : variables d'environnement
// puis redéploiement. N'affiche JAMAIS une valeur de secret.
//
// Usage :
//   node scripts/_netlify-config.mjs --decouvrir   (lecture seule)
//   node scripts/_netlify-config.mjs               (écrit puis redéploie)
import { readFileSync } from 'node:fs';

const API = 'https://api.netlify.com/api/v1';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$/.exec(l);
  if (m) env[m[1]] = m[2].trim();
}

const JETON = env.NETLIFY_AUTH_TOKEN;
if (!JETON) {
  console.error('NETLIFY_AUTH_TOKEN absent de .env.local');
  process.exit(1);
}
const entetes = { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' };

/** Variables à poser sur Netlify (noms → valeur lue dans .env.local). */
const A_POSER = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TRANSLATOR_DEFAULT',
  'LIBRETRANSLATE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'FEDAPAY_ENV',
  'FEDAPAY_PUBLIC_KEY',
  'FEDAPAY_SECRET_KEY',
  'FEDAPAY_WEBHOOK_SECRET',
];

const decouvrir = process.argv.includes('--decouvrir');

async function appel(chemin, options = {}) {
  const r = await fetch(`${API}${chemin}`, { headers: entetes, ...options });
  const texte = await r.text();
  let corps = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { ok: r.ok, statut: r.status, corps };
}

// ---------- 1. Trouver le site ----------
const sites = await appel('/sites?per_page=100');
if (!sites.ok) {
  console.error(`Lecture des sites refusée (HTTP ${sites.statut}). Jeton invalide ou sans droit ?`);
  process.exit(1);
}
const liste = Array.isArray(sites.corps) ? sites.corps : [];
const site = liste.find((s) => `${s.name} ${s.url} ${s.ssl_url}`.includes('plume-ombres'));
if (!site) {
  console.error(`${liste.length} site(s) visible(s), aucun « plume-ombres » :`);
  for (const s of liste) console.log(`  - ${s.name} (${s.ssl_url})`);
  process.exit(1);
}
const compte = site.account_slug;
console.log(`Site trouvé : ${site.name}`);
console.log(`  url        : ${site.ssl_url}`);
console.log(`  id         : ${site.id}`);
console.log(`  compte     : ${compte}`);
console.log(`  dépôt      : ${site.build_settings?.repo_url ?? '(inconnu)'} @ ${site.build_settings?.branch ?? '?'}`);
console.log(`  état       : ${site.state} · dernière publication : ${site.published_deploy?.published_at ?? '(jamais)'}`);

if (decouvrir) {
  const existantes = await appel(`/accounts/${compte}/env?site_id=${site.id}`);
  const cles = Array.isArray(existantes.corps) ? existantes.corps.map((v) => v.key) : [];
  console.log(`\nVariables déjà présentes sur Netlify (${cles.length}) :`);
  console.log(cles.length ? '  ' + cles.sort().join('\n  ') : '  (aucune)');
  const manquantes = A_POSER.filter((k) => !cles.includes(k) && env[k]);
  const dejaLa = A_POSER.filter((k) => cles.includes(k));
  console.log(`\nÀ poser maintenant (${manquantes.length}) : ${manquantes.join(', ') || '(rien)'}`);
  console.log(`Déjà présentes (${dejaLa.length}) : ${dejaLa.join(', ') || '(aucune)'}`);
  const sansValeur = A_POSER.filter((k) => !env[k]);
  console.log(`Sans valeur dans .env.local : ${sansValeur.join(', ') || '(aucune)'}`);
  process.exit(0);
}

// ---------- 2. Poser les variables ----------
const existantes = await appel(`/accounts/${compte}/env?site_id=${site.id}`);
const cles = new Set(
  Array.isArray(existantes.corps) ? existantes.corps.map((v) => v.key) : []
);

const bilan = [];
for (const cle of A_POSER) {
  const valeur = env[cle];
  if (!valeur) {
    bilan.push(`${cle} : IGNORÉE (valeur absente)`);
    continue;
  }
  const corpsVariable = { key: cle, values: [{ value: valeur, context: 'all' }] };
  const reponse = cles.has(cle)
    ? await appel(`/accounts/${compte}/env/${cle}?site_id=${site.id}`, {
        method: 'PUT',
        body: JSON.stringify({ values: corpsVariable.values }),
      })
    : await appel(`/accounts/${compte}/env?site_id=${site.id}`, {
        method: 'POST',
        body: JSON.stringify([corpsVariable]),
      });
  bilan.push(`${cle} : ${reponse.ok ? (cles.has(cle) ? 'MISE À JOUR' : 'CRÉÉE') : `ÉCHEC (HTTP ${reponse.statut}) ${JSON.stringify(reponse.corps).slice(0, 160)}`}`);
}
console.log('\nVariables :');
for (const ligne of bilan) console.log('  ' + ligne);

// ---------- 3. Redéployer ----------
const build = await appel(`/sites/${site.id}/builds`, {
  method: 'POST',
  body: JSON.stringify({ clear_cache: false }),
});
if (!build.ok) {
  console.error(`\nDéploiement refusé (HTTP ${build.statut}) : ${JSON.stringify(build.corps).slice(0, 200)}`);
  process.exit(1);
}
console.log(`\nDéploiement déclenché : ${build.corps?.id ?? '(sans identifiant)'} · état ${build.corps?.state ?? '?'}`);
console.log(`Suivi : https://app.netlify.com/sites/${site.name}/deploys`);
