// Ajoute data-reveler (+ cascade) aux blocs des espaces client.
// Chaque remplacement est VÉRIFIÉ : le script échoue si une ancre
// n'est pas trouvée exactement une fois, pour ne jamais patcher à
// l'aveugle.
const fs = require('fs');

const modifs = [
  // ---------- Mon compte : les 5 sections velours ----------
  ['app/compte/page.tsx',
   '<section className="velours p-6" aria-label="Favoris">',
   '<section data-reveler="haut" data-delai="1" className="velours p-6" aria-label="Favoris">'],
  ['app/compte/page.tsx',
   '<section className="velours p-6" aria-label="Offre en cours">',
   '<section data-reveler="haut" data-delai="2" className="velours p-6" aria-label="Offre en cours">'],
  ['app/compte/page.tsx',
   '<section className="velours p-6" aria-label="Vos livres">',
   '<section data-reveler="haut" data-delai="3" className="velours p-6" aria-label="Vos livres">'],
  ['app/compte/page.tsx',
   '<section className="velours p-6" aria-label="Application">',
   '<section data-reveler="haut" data-delai="4" className="velours p-6" aria-label="Application">'],
  ['app/compte/page.tsx',
   '<section className="velours p-6" aria-label="Textes légaux">',
   '<section data-reveler="haut" data-delai="5" className="velours p-6" aria-label="Textes légaux">'],

  // ---------- Abonnement ----------
  ['app/abonnement/page.tsx',
   '<div>\r\n          <p className="sur-titre text-grenat-400">Abonnement</p>',
   '<div data-reveler="haut">\r\n          <p className="sur-titre text-grenat-400">Abonnement</p>'],
  ['app/abonnement/page.tsx',
   '<div className="velours p-4 mt-6 text-sm text-encre-300">',
   '<div data-reveler="haut" data-delai="1" className="velours p-4 mt-6 text-sm text-encre-300">'],
  ['app/abonnement/page.tsx',
   '<section className="velours p-6 mt-4" aria-label="Offre en cours">',
   '<section data-reveler="haut" data-delai="2" className="velours p-6 mt-4" aria-label="Offre en cours">'],
  ['app/abonnement/page.tsx',
   '<section className="mt-8" aria-label="Tarifs">',
   '<section data-reveler="haut" data-delai="3" className="mt-8" aria-label="Tarifs">'],
  ['app/abonnement/page.tsx',
   '<section className="velours p-6 mt-8" aria-label="Historique">',
   '<section data-reveler="haut" data-delai="4" className="velours p-6 mt-8" aria-label="Historique">'],

  // ---------- Bibliothèque : zone d'import ----------
  ['components/BibliothequeClient.tsx',
   '<div id="zone-import" tabIndex={-1} className="focus:outline-none">',
   '<div\n        id="zone-import"\n        data-reveler="haut"\n        tabIndex={-1}\n        className="focus:outline-none"\n      >'],

  // ---------- Connexion / mots de passe : la carte entre en zoom ----------
  ['app/connexion/page.tsx',
   '<div className="velours p-7 md:p-8">',
   '<div data-reveler="zoom" className="velours p-7 md:p-8">'],
  ['app/mot-de-passe-oublie/page.tsx',
   '<div className="velours p-7">',
   '<div data-reveler="zoom" className="velours p-7">'],
  ['app/nouveau-mot-de-passe/page.tsx',
   '<div className="velours p-7">',
   '<div data-reveler="zoom" className="velours p-7">'],
  ['app/auth/reinitialiser/page.tsx',
   '<div className="velours p-7 space-y-4 text-sm text-center">',
   '<div data-reveler="zoom" className="velours p-7 space-y-4 text-sm text-center">'],

  // ---------- Tunnel de paiement ----------
  ['app/paiement/succes/page.tsx',
   '<div className="velours p-6 mt-6 text-left space-y-3">',
   '<div data-reveler="haut" data-delai="1" className="velours p-6 mt-6 text-left space-y-3">'],
  ['app/paiement/echec/page.tsx',
   '<div className="velours p-6 mt-6 text-left space-y-3">',
   '<div data-reveler="haut" data-delai="1" className="velours p-6 mt-6 text-left space-y-3">'],
  ['app/paiement/[plan]/page.tsx',
   '<div className="velours p-6 mt-6">',
   '<div data-reveler="haut" data-delai="1" className="velours p-6 mt-6">'],
];

const parFichier = new Map();
for (const [f, avant, apres] of modifs) {
  const contenu = parFichier.get(f) ?? fs.readFileSync(f, 'utf8');
  const n = contenu.split(avant).length - 1;
  if (n !== 1) {
    console.error(`✗ ${f} : ${n} occurrence(s) de « ${avant.slice(0, 60)} »`);
    process.exitCode = 1;
    continue;
  }
  parFichier.set(f, contenu.replace(avant, apres));
  console.log(`✓ ${f} ← ${avant.slice(0, 52)}…`);
}
for (const [f, contenu] of parFichier) fs.writeFileSync(f, contenu);
console.log(`${modifs.length} remplacements examinés`);
