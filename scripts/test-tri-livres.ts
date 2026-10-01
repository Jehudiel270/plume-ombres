// ============================================================
// test-tri-livres.ts — Tests réels des helpers de tri/filtre de
// la bibliothèque + vérification HTTP de l'app shell.
//
// Usage :
//   npx tsx scripts/test-tri-livres.ts            # tout (unitaires + HTTP)
//   npx tsx scripts/test-tri-livres.ts --unit     # unitaires seulement
//
// Les tests HTTP s'attendent au serveur dev sur http://localhost:3100
// (npm run dev:start :3100). / et /bibliotheque redirigent vers
// /connexion sans session (307) : c'est un comportement valide.
// ============================================================

import {
  compterParStatut,
  filtrerParStatut,
  trierLivres,
} from '../lib/tri-livres';
import type { Livre, StatutLivre } from '../lib/types';

const SEUL_UNIT = process.argv.includes('--unit');

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

/** Fabrique un livre testable (id = titre simplifié, décalage horodaté). */
function livre(id: string, titre: string, statut: StatutLivre, il: number): Livre {
  return {
    id,
    proprietaire_id: 'u-test',
    titre,
    auteur: null,
    langue_source: 'en',
    langue_cible: 'fr',
    nom_fichier: `${id}.txt`,
    fichier_original: null,
    pdf_largeur: null,
    pdf_hauteur: null,
    pdf_marge: null,
    statut,
    // Décalage de 24h entre chaque livre (le plus « il » = le plus récent)
    created_at: new Date(Date.UTC(2026, 0, 1) + (il + 1) * 86400000).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1) + (il + 10) * 86400000)
      .toISOString(),
  };
}

// ---------- Données de référence ----------
// Remarque : created_at croît avec « il », updated_at décalé de +9 jours :
// l'ordre « récents » n'est PAS l'ordre d'insertion (piège classique).
const J: Livre = livre('j', 'Jeux de pouvoir', 'pret', 1);
const E: Livre = livre('e', 'Écume noire', 'erreur', 4);
const A: Livre = livre('a', 'Âme de cendre', 'importe', 2);
const C: Livre = livre('c', 'Cœur de minuit', 'traduit', 0);
const M: Livre = livre('m', 'Morsure de velours', 'en_traduction', 3);
const BASE = [J, E, A, C, M];

// ---------- trierLivres ----------
const recent = trierLivres(BASE, 'recents');
verifier(
  'tri récents : le plus modifié en tête (erreur, il=4)',
  recent[0]?.id === 'e' && recent[4]?.id === 'c',
  `reçu : ${recent.map((l) => l.id).join(',')}`
);

const titre = trierLivres(BASE, 'titre');
verifier(
  'tri titre A→Z (fr, insensible accents/casse) : Âme, Cœur, Écume, Jeux, Morsure',
  titre.map((l) => l.id).join(',') === 'a,c,e,j,m',
  `reçu : ${titre.map((l) => l.id).join(',')}`
);

const statut = trierLivres(BASE, 'statut');
verifier(
  'tri par statut : actionnable d’abord (erreur → en_traduction → pret → importe → traduit)',
  statut.map((l) => l.id).join(',') === 'e,m,j,a,c',
  `reçu : ${statut.map((l) => l.id).join(',')}`
);

// Égalité de statut départagée par la date de modification.
const egalite = trierLivres(
  [livre('x2', 'B', 'pret', 1), livre('x1', 'A', 'pret', 5)],
  'statut'
);
verifier(
  'tri statut : égalités départagées par « modifié récent »',
  egalite.map((l) => l.id).join(',') === 'x1,x2',
  `reçu : ${egalite.map((l) => l.id).join(',')}`
);

// Pureté : l'entrée n'est ni triée ni mutée.
const entree = [C, M, J];
entree.sort(); // état initial « volontairement » dérangé
const sauvegarde = [...entree];
trierLivres(entree, 'titre');
verifier('trierLivres : entrée non mutée', JSON.stringify(entree) === JSON.stringify(sauvegarde));
trierLivres([], 'recents'); // pas d'erreur sur liste vide
verifier('trierLivres : liste vide → []', trierLivres([], 'statut').length === 0);

// ---------- filtrerParStatut ----------
verifier('filtre null → tous les livres (ordre initial)', filtrerParStatut(BASE, null).map((l) => l.id).join(',') === 'j,e,a,c,m');
verifier('filtre « erreur » → 1 livre', JSON.stringify(filtrerParStatut(BASE, 'erreur').map((l) => l.id)) === '["e"]');
verifier(
  'filtre « pret » seul → 1',
  filtrerParStatut(BASE, 'pret').map((l) => l.id).join(',') === 'j'
);
verifier(
  'filtre « traduit » → 1',
  filtrerParStatut(BASE, 'traduit').map((l) => l.id).join(',') === 'c'
);
verifier('filtre « importe » → 1 (a)', filtrerParStatut(BASE, 'importe').map((l) => l.id).join(',') === 'a');
// (cas « pas de livre à ce statut »)
const seulementTraduits = [C];
verifier('filtre « erreur » sur liste sans erreur → []', filtrerParStatut(seulementTraduits, 'erreur').length === 0);
verifier('filtre : entrée non mutée', JSON.stringify(BASE) === JSON.stringify([J, E, A, C, M]));

// ---------- compterParStatut ----------
const compteurs = compterParStatut(BASE);
verifier(
  'compteur par statut',
  compteurs.importe === 1 && compteurs.pret === 1 && compteurs.en_traduction === 1 && compteurs.traduit === 1 && compteurs.erreur === 1,
  JSON.stringify(compteurs)
);
const compteursVide = compterParStatut([]);
verifier(
  'compteur liste vide → tous les statuts à 0',
  Object.values(compteursVide).every((n) => n === 0)
);
// Statut inconnu (données sales) : ne doit pas planter ni compter.
const sale: Livre[] = [{ ...C, statut: 'inconnu' as StatutLivre } as Livre];
const compteursSale = compterParStatut(sale);
verifier('compteur : statut inconnu ignoré (ne plante pas)', Object.values(compteursSale).every((n) => n === 0));

// ---------- Pipeline filtre → tri (l'ordre utilisé par le composant) ----------
const pipeline = trierLivres(filtrerParStatut([...BASE, ...BASE], 'pret'), 'titre');
verifier('pipeline filtre+tri : 2 « pret » après duplication, A→Z', pipeline.length === 2 && pipeline[0]?.id === 'j');

// ---------- HTTP (app shell sur localhost:3100) ----------
async function testerHttp() {
  const base = process.env.TEST_BASE ?? 'http://localhost:3100';

  async function statut(code: string, attendus: number[], url: string): Promise<number | null> {
    try {
      const reponse = await fetch(`${base}${url}`, { redirect: 'manual' });
      const valeur = reponse.status;
      verifier(
        `HTTP ${url} → ${valeur} (attendu ${attendus.join('|')})`,
        attendus.includes(valeur)
      );
      return valeur;
    } catch (e) {
      verifier(
        `HTTP ${url} joignable (${base})`,
        false,
        e instanceof Error ? e.message : String(e)
      );
      return null;
    }
  }

  console.log(`\n-- HTTP (${base}) --`);
  // Accueil + bibliothèque : 200 si session, 307/302 sinon → les deux valables.
  await statut('racine', [200, 302, 307], '/');
  await statut('bibliothèque', [200, 302, 307], '/bibliotheque');
  // Manifeste + service worker : 200 impératif (PWA).
  const manifeste = await statut('manifeste', [200], '/manifest.webmanifest');
  if (manifeste === 200) {
    const corps = await (await fetch(`${base}/manifest.webmanifest`)).text();
    verifier(
      'manifest : name + start_url + icônes',
      corps.includes('Plume') && corps.includes('"start_url"') && corps.includes('icon-192.png')
    );
  }
  const sw = await statut('service worker', [200], '/service-worker.js');
  if (sw === 200) {
    const corps = await (await fetch(`${base}/service-worker.js`)).text();
    verifier(
      'SW : stratégies présentes (navigate + /api/ + cache-first)',
      corps.includes('mode === \'navigate\'') && corps.includes('/api/') && corps.includes('enCache')
    );
    const nbCachePut = corps.split('cache.put(').length - 1;
    verifier(
      'SW : 2 seuls cache.put (navigation + assets) — /api/ jamais mis en cache',
      nbCachePut === 2
    );
    verifier(
      'SW : repli hors-ligne API = JSON 503 + version plume-*',
      corps.includes('503') && /plume-v\d+/.test(corps)
    );
  }
}

// Lancement (scripts compilés en CommonJS : pas d'`await` au niveau
// module → tout se passe dans une IIFE asynchrone).
(async () => {
  if (!SEUL_UNIT) {
    await testerHttp();
  }

  if (echecs > 0) {
    console.error(`\n${echecs} échec(s).`);
    process.exit(1);
  }
  console.log('\nTous les tests passent.');
})();