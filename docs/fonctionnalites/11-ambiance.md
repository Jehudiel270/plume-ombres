# Fiche module 11 — Fiches d'ambiance enrichies (F5)

Date : 12/11/2026 · Branche : `fonctionnalite/ambiance` · Code : **F5** ·
Effort : S-M · Risque juridique : aucun · Abonnement : **gratuit**.

## Fonction

L'ambiance du récit, livre par livre : genres, tropes et intensité (1 =
Discret → 5 = Très sombre), posés par le PROPRIÉTAIRE du livre. Complète les
avertissements de contenu existants (socle : AvertissementsLivre) — ne les
remplace pas. Usage : se souvenir du ton d'une œuvre avant de la reprendre,
documenter sa bibliothèque.

## Livré

1. **Page `/ambiance`** — les livres du compte, chacun avec sa fiche
   éditable en place : intensité (5 paliers, boutons), genres (au plus 5,
   séparés par des virgules), tropes (au plus 8).
2. **Server action d'enregistrement** (`app/ambiance/actions.ts`) — session,
   module `ambiance` revérifiés côté serveur, listes plafonnées par la lib
   (non contournables), upsert RLS « own ».
3. **Règle pure et testée** (`lib/ambiance.ts`) : intensité fermée 1–5 avec
   libellés français, listes nettoyées et plafonnées, chargement des fiches.

## Données (migration ADDITIVE, idempotente)

`20261112000007_ambiance_livres.sql` — table `ambiance_livres` : livre (PK,
CASCADE), genres/tropes text[] (plafonnés par l'app), intensité (CHECK
1–5), horodatages. RLS « own » complète.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('ambiance')` — fermé → 404.
- Action : `verifierModuleApi('ambiance')` — fermé → refus ; RLS « own »
  garantit qu'on n'écrit que sur SES livres.
- Registre : l'entrée `ambiance` (F5) existait (itineraires `['/ambiance']`).
- check:flags : 17 interrupteurs, pages couvertes.

## Tests et vérifications

- `lib/ambiance.test.ts` : 2/2 (intensité fermée + libellés, listes
  plafonnées).
- Build OK (34/34 pages, /ambiance présente).
- Limites assumées : pas de préférences globales du lecteur (filtres
  d'ambiance à l'import) — v2 ; pas de page publique d'ambiance (hors
  périmètre atelier).
