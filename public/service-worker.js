/* ============================================================
 * service-worker.js — PWA (100 % gratuite, sans dépendance).
 *
 * Stratégie simple et sûre :
 *  - App shell (pages + assets Next) : cache-first avec mise à
 *    jour en arrière-plan (stale-while-revalidate) — la lecture
 *    reste fluide hors-ligne.
 *  - API/Supabase : network-only (jamais mis en cache — les
 *    données ont besoin d'être réelles).
 *  - Mise à jour : versionnage par constante VERSION, purge du
 *    cache obsolète à l'installation.
 *
 * NB : c'est un fichier « vanilla » servi depuis /public, donc
 * la portée (scope) est la racine du site — aucune magic Next.
 * ============================================================ */

const VERSION = 'plume-v1';
const CACHE_APP = `${VERSION}-app`;
const CACHE_MAX_ENTREES = 120; // borné pour rester léger

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      // Pré-charger l'app shell (root + page bibliothèque).
      await cache.addAll(['/', '/bibliotheque']);
      // Purge des anciennes versions.
      const cles = await caches.keys();
      for (const cle of cles) {
        if (cle.startsWith('plume-') && cle !== CACHE_APP) {
          await caches.delete(cle);
        }
      }
    })()
  );
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

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  // On ne gère que le GET (les mutations restent réseau).
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  // L'API / Supabase ne se met JAMAIS en cache.
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Pages (navigation) : réseau d'abord, repli cache (offline).
  if (requete.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const reseau = await fetch(requete);
          const cache = await caches.open(CACHE_APP);
          cache.put(requete, reseau.clone());
          bornerTache(cache);
          return reseau;
        } catch {
          // Hors-ligne : on renvoie la page mise en cache, sinon
          // la page racine (le meilleure repli « app shell »).
          const cache = await caches.open(CACHE_APP);
          const cacheReponse = await cache.match(requete);
          if (cacheReponse) return cacheReponse;
          return cache.match('/');
        }
      })()
    );
    return;
  }

  // Assets statiques (JS/CSS/images) : cache-first + actualisation.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      const enCache = await cache.match(requete);
      const rafraichir = fetch(requete)
        .then((reseau) => {
          cache.put(requete, reseau.clone());
          bornerTache(cache);
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
    if (cles.length > CACHE_MAX_ENTREES) {
      cache.delete(cles[0]);
    }
  });
}