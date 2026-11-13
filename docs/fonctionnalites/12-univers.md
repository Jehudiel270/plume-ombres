# Fiche module 12 — Univers multi-tomes (F17)

Date : 12/11/2026 · Branche : `fonctionnalite/univers` · Code : **F17** ·
Effort : L → porté v1 (sagas privées) · Risque juridique : aucun ·
Abonnement : **Illimité** (registre, `planMinimal: 'illimite'` — le plan le
plus large du catalogue réel).

## Fonction

Regrouper ses livres en SAGAS (univers), tomes ordonnés, tout restant privé.
La maquette imaginait des cartes et chronologies par univers ; la version
portée v1 fournit le SOCLE utile de l'atelier : création d'univers,
rattachement des tomes dans l'ordre, retrait, suppression. Les enrichissements
(visuel de saga, anti-spoilers par tome avancé, chronologie transversale)
viendront sur ce socle.

## Livré

1. **Page `/univers`** — liste des univers du compte avec leurs tomes en
   ordre (T1, T2…), création (titre + description), retrait d'un tome,
   suppression d'un univers (les livres ne sont JAMAIS supprimés —
   dissociation only).
2. **API `/api/univers`** — POST `creer | renommer | ajouter | retirer |
   supprimer` + DELETE : session 401, module fermé → 404, plan < Illimité →
   403, univers d'autrui → 404, livre rattaché seulement parmi SES livres
   (RLS), tomes bornés (position 1–100, UNIQUE univers+livre).
3. **Registre** — itineraires `['/univers', '/univers/*']`, api
   `['/api/univers']`, planMinimal `illimite` (déjà en place).

## Données (migration ADDITIVE, idempotente)

`20261112000008_univers.sql` — `univers` (propriétaire CASCADE, titre 1–160,
description ≤ 2 000) ; `univers_livres` (univers CASCADE, livre CASCADE,
position CHECK 1–100, UNIQUE univers+livre). RLS « own » complète sur les
deux tables.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('univers')` — fermé OU plan insuffisant → 404
  (la grille des plans s'affiche côté tarifs, jamais ici).
- API : mêmes gardes que ci-dessus ; un livre d'un autre compte est
  « introuvable » (RLS), un univers d'autrui aussi.
- check:flags : 17 interrupteurs / 33 pages / 29 routes, toutes couvertes.

## Tests et vérifications

- Build OK (35/35 pages, /univers et /api/univers présentes).
- Règles couvertes par les gardes serveur (propriété, plan, bornes) — la
  logique est entièrement déportée dans l'API et la base (pas de règle pure
  nouvelle à tester unitairement).
- Limites assumées : pas de chronologie transversale ni de matrice
  personnages multi-tomes (v2, adossée au graphe F25) ; l'ordre des tomes
  est géré à l'ajout (position suivante) — réordonnancement manuel fin en v2.
