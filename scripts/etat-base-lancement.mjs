// État réel de la base au moment du lancement.
// Lecture seule, aucun secret affiché.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

async function compte(table, filtres = '') {
  try {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*${filtres}`, {
      headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, Prefer: 'count=exact', Range: '0-0' },
    });
    if (!r.ok) return `?${r.status}`;
    const plage = r.headers.get('content-range') ?? '';
    return plage.split('/')[1] ?? '?';
  } catch (e) {
    return `erreur ${e.message}`;
  }
}

async function lignes(table, select = '*', limite = 20) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${select}&limit=${limite}`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
  });
  if (!r.ok) return { erreur: r.status };
  return r.json();
}

console.log('--- volumes ---');
for (const t of ['livres', 'chapitres', 'segments', 'paiements', 'abonnements', 'plans', 'packs_credits', 'profils', 'travaux_traduction']) {
  console.log(`${t.padEnd(20)} ${await compte(t)}`);
}

console.log('\n--- plans vendus ---');
const plans = await lignes('plans', 'code,nom,prix_xof,devise,actif', 20);
console.log(Array.isArray(plans) ? JSON.stringify(plans) : plans);

console.log('\n--- packs de crédits ---');
const packs = await lignes('packs_credits', '*', 10);
console.log(Array.isArray(packs) ? JSON.stringify(packs).slice(0, 600) : packs);

console.log('\n--- paiements enregistrés ---');
const paie = await lignes('paiements', 'reference,plan,montant,statut,fournisseur,created_at', 10);
console.log(Array.isArray(paie) ? JSON.stringify(paie) : paie);
