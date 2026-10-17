# Traduction — corrections du 17 octobre 2026

## Ce qui a été corrigé

| Problème signalé | Cause réelle | Correctif |
|---|---|---|
| Traduction très lente | Une requête HTTP **et 3 RPC Supabase par segment**, 4 travailleurs, 80 ms de pause après chaque segment | Route `POST /api/translate/lot` : **un lot = 40 segments**, une seule authentification, un seul débit, une seule réservation de quota, **8 traductions en parallèle** |
| Micro-segments coûteux | 20 528 segments en attente, **moyenne 215 caractères** : une latence moteur complète pour un bout de phrase | `lib/traduction/groupes.ts` : les segments courts consécutifs sont **regroupés dans un seul appel** (max 12 segments / 4 500 caractères), avec marqueurs `⟦PLUME:n⟧` et **repli un-par-un** si le découpage n'est pas sûr |
| Segments restés en erreur (« 9 en erreur ») | La file n'était construite qu'une fois : un échec pendant le passage n'était **jamais retenté** | **Deux passes de reprise automatiques** (3 s puis 10 s) après le passage, sans action de l'utilisateur |
| Persistance après fermeture du navigateur | Le moteur tournait **uniquement dans le navigateur** : aucun exécutant serveur | Table `travaux_traduction` + `POST /api/translate/travail` + fonction planifiée Netlify chaque minute. Le navigateur pose un **battement toutes les 20 s** ; s'il s'arrête, le serveur reprend au bout de **2 min** |
| Notifications vides | La cloche ne faisait que **lire** la table ; et `livres.statut` n'était **jamais** mis à `traduit`, donc le trigger ne se déclenchait jamais | `cloreLivreSiComplet()` met le livre à `traduit` en fin de traduction → le trigger crée la notification. L'exécutant notifie aussi la fin d'un travail |
| Compteur de caractères | Aucun affichage **avant** de lancer, jauge figée pendant la traduction | « **X segments · Y caractères à traduire** » avant lancement, et rafraîchissement de la jauge à chaque lot |
| Logo | — | Nouveau visuel : site, icônes PWA, iOS, favicon (`assets/logo-source.png` conservé pour régénérer) |

## Preuves mesurées (exécutions réelles)

- Débit avant : **29 caractères/seconde**. Après : **208 car/s** sur micro-segments et **2 130 car/s** sur paragraphes réels — soit **~4 à 5 minutes pour un livre de 530 000 caractères**.
- Tests : **66 tests verts** (`groupes`, `lot`, `travaux`), `tsc` 0 erreur.
- Build de production vert, déployé.
- Exécutant serveur en production : sans secret → **401** ; avec secret → `{"statut":"inactif"}` ; sur un travail réel → **40 segments traduits** (`traites: 40`), segments en base 3 074 → **3 114**.
- Notification : livre passé à `traduit` → **1 ligne créée** dans `notifications` (puis nettoyée).

## Variables et prérequis (faits)

- `CRON_SECRET` posé sur Netlify (site `plume-ombres`).
- `LIBRETRANSLATE_URL` **retirée** de la production : elle pointait sur `127.0.0.1:5000`, donc chaque segment payait une tentative morte.
- `SUPABASE_SERVICE_ROLE_KEY` déjà présente — l'exécutant l'utilise.

## Ce qui reste

- La VM Oracle + LibreTranslate (tâches A1-A5) : sans elle, la chaîne utilise les moteurs distants.
- Les 13 erreurs de lint préexistantes (`OrdreChaine.tsx`, `PresentationSlides.jsx`) ne bloquent pas le build.
- La migration est en SQL standard (table + index + RLS) : **aucune dépendance à un service propriétaire**, donc transposable à Neon ; seul le déclencheur planifié est une fonction Netlify, remplaçable par n'importe quel cron.
