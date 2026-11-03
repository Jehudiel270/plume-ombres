// Audit de lancement — ce que voit un visiteur non connecté, sur le site réel.
// Pour chaque route publique : statut, <h1> unique, restes de gabarit, erreurs.
const BASE = 'https://plumedombres.kodelyza.com';

const ROUTES = [
  '/', '/tarifs', '/faq', '/contact', '/conditions', '/confidentialite',
  '/cookies', '/mentions-legales', '/remboursement', '/connexion',
  '/mot-de-passe-oublie', '/bibliotheque', '/compte', '/favoris',
  '/paiement/lecteur_mensuel',
];

// Marqueurs qui interdisent un lancement commercial.
const INTERDITS = [
  'À REMPLIR', 'A REMPLIR', '[À', 'TODO', 'FIXME', 'lorem ipsum', 'Lorem ipsum',
  'Gabarit à valider', 'gabarit à valider', 'CNIL', 'LCEN', 'placeholder',
];

const resultats = [];
for (const route of ROUTES) {
  let statut = 0, html = '', erreur = '';
  try {
    const r = await fetch(BASE + route, { redirect: 'manual' });
    statut = r.status;
    html = r.status < 300 ? await r.text() : '';
  } catch (e) { erreur = String(e.message ?? e); }

  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  const trouves = INTERDITS.filter((m) => html.includes(m));
  const fuites = /supabase\.co|service_role|sk_live|wh_live|FEDAPAY_SECRET/i.test(html);
  resultats.push({ route, statut, h1, interdits: trouves, fuiteSecret: fuites, erreur });
}

// Le tunnel de paiement doit exiger une connexion (redirection), pas servir une page morte.
for (const r of resultats) {
  const etat = r.erreur ? `ERREUR ${r.erreur}`
    : r.statut >= 300 && r.statut < 400 ? `redirection ${r.statut} (connexion exigée)`
    : r.statut === 200 ? `200 · h1=${r.h1}${r.interdits.length ? ` · INTERDITS: ${r.interdits.join(', ')}` : ''}${r.fuiteSecret ? ' · FUITE SECRET !' : ''}`
    : `${r.statut}`;
  console.log(`${r.route.padEnd(26)} ${etat}`);
}

const problemes = resultats.filter((r) => r.erreur || r.interdits.length || r.fuiteSecret || (r.statut === 200 && r.h1 !== 1));
console.log(`\nPROBLEMES=${problemes.length}`);
process.exitCode = problemes.length ? 1 : 0;
