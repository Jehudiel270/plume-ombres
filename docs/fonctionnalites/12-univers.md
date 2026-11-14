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

## Vue saga (v2, portage fidèle de la maquette) — 14/11/2026

Branche `fonctionnalite/univers-saga-vue`. La maquette (`components/universe`)
imaginait « la saga en un regard » : c'est porté, ADOSsé au graphe narratif
(F25) — les données de la saga viennent des graphes de chaque tome, elles
n'existent nulle part ailleurs (aucune donnée d'intrigue inventée).

1. **`lib/univers-saga.ts`** (pur, testé) — agrège les graphes DÉJÀ filtrés
   par `chargerGraphe` (chapitre lu de chaque tome) : rapprochement des
   personnages inter-tomes par NOM NORMALISÉ (casse/accents ignorés),
   personnages communs entre tomes adjacents, chronologie inter-tomes,
   évolutions de relations par paire, comptes de masqués. Principe : rien de
   masqué n'entre dans l'agrégation — le rapprochement inter-tomes ne voit
   que du visible, donc ne révèle jamais un personnage d'un tome non entamé.
2. **`/univers/[id]` refondue** — quatre statistiques de saga ; **frise
   arborée des tomes** (`FriseSaga`, portage de `UniverseTomeMap`) : nœud par
   tome avec état (lu / en cours / non commencé), LIENS inter-tomes avec le
   nombre de personnages communs, « racines » (avatars des personnages
   visibles de chaque tome), tome actif partagé par `?tome=N` ;
   **détail du tome** : personnages (avec apparitions et relations
   documentées), relations avec MINI-GRAPHE SVG (`MiniGrapheTome`, portage de
   `UniverseMiniGraph` — couleurs par type, tirets par fiabilité,
   importance par rayon), événements ; liens « Ouvrir le livre » et « Graphe
   du tome » ; **« La saga, tomes confondus »** (`OngletsSaga`, portage des
   trois onglets de la maquette) : MATRICE personnage × tome dépliable
   (`UniverseCharacterMatrix`), CHRONOLOGIE filtrable par personnage
   (`UniverseTimeline`), ÉVOLUTIONS de relations en frises par paire
   (`UniverseRelations`).
3. **Page `/univers`** — bouton « Explorer la saga » vers le détail.
4. **Plafond** : la vue saga charge au plus 20 tomes (une saga de lecteur
   reste modeste) ; requêtes groupées (`in`) pour chapitres, lectures et
   totaux.

## Graphe : aide et suggestions locales (même branche)

Portage des `Modals.vue` et des propositions de la maquette, adaptés SANS IA
et sans contenu inventé (tout est calculé sur les données réelles) :

- **Modale d'aide** (`ModaleAide`) : mode d'emploi exact de la toile
  (déplacements, zoom, légende cliquable, trait/fiabilité, anti-spoilers,
  vues).
- **`lib/graphe.ts::calculerSuggestions`** (pur, testé) — co-apparitions
  d'événements SANS relation déjà documentée, personnages isolés, relations
  à fiabilité faible (hypothèse/incertain).
- **Panneau « Suggestions »** dans la toile : pistes affichées avec compte,
  bouton « Préremplir une relation » qui ouvre l'édition avec les deux
  personnages choisis — le lecteur reste l'unique décideur, rien ne
  s'ajoute sans confirmation.

## Tests et vérifications (v2)

- `lib/univers-saga.test.ts` : 9 tests (normalisation des noms,
  regroupement inter-tomes, liens adjacents, anti-spoilers, apparitions et
  liens par tome, évolutions groupées, chronologie triée, tri, saga vide).
- `lib/graphe.test.ts` : +2 tests de suggestions.
- Suite complète : 314/314. `tsc --noEmit` OK. `check:flags` OK (aucune
  route nouvelle : tout vit sous les itinéraires `univers` existants).
