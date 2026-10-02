/* ============================================================
 * service-worker.js — PWA (100 % gratuite, sans dépendance).
 *
 * Stratégies par famille de requêtes (même origine uniquement) :
 *  - App shell (navigation GET : /, /bibliotheque, /livres/…) —
 *    NETWORK-FIRST : on préfère la version fraîche depuis le
 *    réseau, et on met à jour le cache en fond ; hors-ligne,
 *    repli sur la page mise en cache, sinon la racine « / »
 *    (app shell, pré-chargée à l'installation).
 *  - Assets statiques (JS/CSS/images, /_next, /icon-*, etc.) —
 *    CACHE-FIRST + actualisation en arrière-plan : la lecture
 *    reste fluide hors-ligne, les fichiers se réactualisent
 *    discrètement dès que le réseau revient.
 *  - API /api/ (*) — NETWORK-FIRST SANS CACHE : l'API est toujours
 *    interrogée en réseau, NE JAMAIS mise en cache (données de
 *    traduction, statuts, livres — les données doivent rester
 *    réelles). Hors-ligne : réponse JSON 503 propre (jamais de
 *    donnée vieille recrachée).
 *  - Origines tierces (Supabase, CDN) — non interceptées : le
 *    réseau les sert directement (aucun cache, aucune donnée
 *    de traduction stockée localement).
 *
 * Mise à jour : versionnage par constante VERSION, purge des
 * caches « plume-* » obsolètes à l'installation ET à
 * l'activation.
 *
 * NB : c'est un fichier « vanilla » servi depuis /public, donc
 * la portée (scope) est la racine du site — aucune magic Next.
 * ============================================================ */

const VERSION = 'plume-v3';
const CACHE_APP = `${VERSION}-app`;
const CACHE_MAX_ENTREES = 200; // borné pour rester léger

/* ---------- Cycle de vie ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      // Pré-charger l'app shell (racine + bibliothèque) :
      // l'accueil et la bibliothèque restent utilisables hors-ligne.
      await cache.addAll(['/', '/bibliotheque']);
      // Purge des anciennes versions.
      const cles = await caches.keys();
      for (const cle of cles) {
        if (cle.startsWith('plume-') && cle !== CACHE_APP) {
          await caches.delete(cle);
        }
      }
      // MISE À JOUR AUTOMATIQUE : on n'attend PAS que tous les onglets
      // soient fermés pour activer la nouvelle version. Le nouveau
      // service worker prend la main immédiatement ; la page se
      // recharge ensuite d'elle-même (voir components/PWA.tsx).
      await self.skipWaiting();
    })()
  );
});

// La page peut demander explicitement l'activation immédiate.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cles = await caches.keys();
      for (const cle of cles) {
        if (cle.startsWith('plume-') && cle !== CACHE_APP) {
          await caches.delete(cle);
        }
      }
      await self.clients.claim();
    })()
  );
});

/* ---------- Interception des requêtes ---------- */

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  // On ne gère que le GET (les mutations réseau restent natives).
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  // Origines tierces (Supabase, fournisseurs…) : jamais interceptées.
  if (url.hostname !== self.location.hostname) return;

  // -------- API /api/ : réseau d'abord, JAMAIS de cache --------
  // Les données (livres, chapitres, traductions…) doivent rester
  // réelles : on laisse passer la requête réseau, et si le réseau
  // est mort, on renvoie une erreur JSON propre plutôt qu'une
  // donnée potentiellement périmée.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const reseau = await fetch(requete);
          // Pas de cache : on renvoie la réponse telle quelle.
          return reseau;
        } catch {
          // Hors-ligne : réponse d'erreur explicite (pas de donnée
          // stockée à renvoyer).
          return new Response(
            JSON.stringify({
              erreur: 'Hors-ligne — le serveur est injoignable.',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        }
      })()
    );
    return;
  }

  // -------- Navigation (pages) : réseau → repli cache --------
  if (requete.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const reseau = await fetch(requete);
          const cache = await caches.open(CACHE_APP);
          if (reseau.ok) {
            // On mémorise seulement les réponses valides.
            cache.put(requete, reseau.clone());
            bornerTache(cache);
          }
          return reseau;
        } catch {
          // Hors-ligne : page mise en cache, sinon la racine
          // (app shell pré-chargée — le meilleur repli).
          const cache = await caches.open(CACHE_APP);
          const cacheReponse = await cache.match(requete);
          if (cacheReponse) return cacheReponse;
          return cache.match('/');
        }
      })()
    );
    return;
  }

  // -------- Assets statiques : cache-first + actualisation --------
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      const enCache = await cache.match(requete);
      const rafraichir = fetch(requete)
        .then((reseau) => {
          if (reseau.ok) {
            cache.put(requete, reseau.clone());
            bornerTache(cache);
          }
          return reseau;
        })
        .catch(() => enCache);
      return enCache || (await rafraichir);
    })()
  );
});

// Borne la taille du cache (évite de saturer le quota mobile).
function bornerTache(cache) {
  cache.keys().then((cles) => {
    while (cles.length > CACHE_MAX_ENTREES) {
      cache.delete(cles.shift());
    }
  });
}