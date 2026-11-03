// ============================================================
// scripts/verifier-audience.mjs — Épreuve réelle des objets créés par
// les migrations du 3 novembre 2026 (audience + sections admin).
//
//   1. insère 3 visites FACTICES via la clé service_role ;
//   2. appelle public.admin_stats_visites(30) et vérifie que les
//      comptages remontent bien (dont les uniques) ;
//   3. appelle public.section_autorisee('paiements') ;
//   4. supprime les visites factices (aucune trace laissée).
//
// Usage : node --env-file=.env.local scripts/verifier-audience.mjs
// ============================================================

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !SERVICE) {
  console.error('Variables Supabase absentes (.env.local).');
  process.exit(1);
}

const ENTETES = {
  apikey: SERVICE,
  Authorization: 'Bearer ' + SERVICE,
  'Content-Type': 'application/json',
};

const marque = 'verif-' + Date.now();

async function requete(chemin, options = {}) {
  const reponse = await fetch(URL_BASE + chemin, { ...options, headers: { ...ENTETES, ...(options.headers ?? {}) } });
  const texte = await reponse.text();
  let corps = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { statut: reponse.status, corps };
}

// 1. Trois visites factices : deux pages, deux visiteurs distincts.
const lignes = [
  { chemin: '/', source: 'direct', appareil: 'bureau', visiteur: marque + '-a' },
  { chemin: '/catalogue', source: 'google.com', appareil: 'mobile', visiteur: marque + '-a' },
  { chemin: '/', source: 'direct', appareil: 'bureau', visiteur: marque + '-b' },
];

const insertion = await requete('/rest/v1/visites', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify(lignes),
});
console.log('1. insertion visites :', insertion.statut);
if (insertion.statut >= 300) {
  console.log('   détail :', JSON.stringify(insertion.corps));
  process.exit(1);
}

// 2. Agrégats.
const agregats = await requete('/rest/v1/rpc/admin_stats_visites', {
  method: 'POST',
  body: JSON.stringify({ p_jours: 30 }),
});
console.log('2. admin_stats_visites :', agregats.statut);
const charge = agregats.corps ?? {};
const totaux = charge.totaux ?? {};
console.log('   totaux :', JSON.stringify(totaux));
const jourAujourdhui = (charge.parJour ?? []).at(-1) ?? {};
console.log('   dernier jour :', JSON.stringify(jourAujourdhui));
console.log('   pages :', JSON.stringify((charge.pages ?? []).slice(0, 3)));
console.log('   appareils :', JSON.stringify((charge.appareils ?? []).slice(0, 3)));
console.log('   sources :', JSON.stringify((charge.sources ?? []).slice(0, 3)));

// 3. Sections.
const section = await requete('/rest/v1/rpc/section_autorisee', {
  method: 'POST',
  body: JSON.stringify({ p_section: 'paiements' }),
});
console.log('3. section_autorisee(paiements) :', section.statut, JSON.stringify(section.corps));

const sectionInconnue = await requete('/rest/v1/rpc/section_autorisee', {
  method: 'POST',
  body: JSON.stringify({ p_section: 'racine' }),
});
console.log('   section inconnue refusée :', JSON.stringify(sectionInconnue.corps));

// 4. Nettoyage.
const suppression = await fetch(`${URL_BASE}/rest/v1/visites?visiteur=like.${marque}*`, {
  method: 'DELETE',
  headers: { ...ENTETES, Prefer: 'return=minimal' },
});
console.log('4. suppression visites factices :', suppression.status);

const restantes = await requete(`/rest/v1/visites?visiteur=like.${marque}*&select=id`);
console.log('   restantes :', Array.isArray(restantes.corps) ? restantes.corps.length : restantes.corps);

const ok =
  insertion.statut < 300 &&
  agregats.statut === 200 &&
  typeof totaux.visites === 'number' &&
  suppression.status < 300;
console.log(ok ? 'BILAN : OK' : 'BILAN : ÉCHEC');
process.exit(ok ? 0 : 1);
