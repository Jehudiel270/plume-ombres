# Fiche module 7 — Graphe narratif anti-spoilers (manuel)

Date : 12/11/2026 · Branche : `fonctionnalite/graphe-narratif` · Code : **F25** ·
Effort : L (porté manuel) · Risque juridique : aucun · Abonnement : **gratuit**
(les enrichissements IA du graphe viendront plus tard, Premium).

## Fonctionnalité signature, MANUELLE d'abord

La maquette (F25) propose graphe, liste, chronologie et fiche personnage avec
contrôle de densité. Le chantier livre la version MANUELLE : c'est le lecteur
qui construit son graphe (personnages + relations, première apparition datée),
car l'extraction automatique nécessiterait de l'IA sur tout le livre (crédits,
coûts) — prévue plus tard derrière le plan Premium. Le modèle de filtrage
serveur de la maquette (`server/api/books/[bookId]/graph.get.ts`) est repris
TEL QUEL dans le principe.

## Livré

1. **Page `/livres/[id]/graphe`** — coque serveur (livre + chapitres du
   compte) ; les DONNÉES du graphe viennent de l'API.
2. **Filtrage anti-spoilers PAR LE SERVEUR** — chaque personnage et chaque
   relation porte sa PREMIÈRE APPARITION (chapitre). L'API GET ne renvoie que
   ce qui est couvert par le chapitre lu (progression locale du lecteur
   transmise à l'API, réglable « jusqu'au chapitre N »). Une relation n'est
   visible que si LES DEUX extrémités le sont — son simple affichage ne
   révèle personne. Aucune donnée au-delà ne quitte la base (le client reçoit
   seulement le NOMBRE d'éléments masqués, jamais leur contenu). Pas de flou
   CSS : c'est du filtrage de données.
3. **Vues** — GRAPHE : nœuds en cercle (SVG, couleur par rôle : protagoniste,
   antagoniste, allié, secondaire, autre), arêtes libellées ; RELATIONS :
   liste lisible « A — libellé → B » ; cartes personnage (description courte,
   apparition). Compteur « N éléments masqués ».
4. **Édition manuelle (propriétaire)** — ajout de personnage (nom, rôle,
   description, première apparition) et de relation (origine, destination,
   libellé, apparition), suppression. L'accès au graphe est signalé dans le
   livre par un lien « Graphe narratif » (monté seulement si l'interrupteur
   est ouvert).

## Données (migration ADDITIVE, idempotente)

`20261112000004_graphe_narratif.sql` — `graphe_personnages` (nom 1–120, rôle
check, description ≤ 2 000, premiere_chapitre_id nullable) ;
`graphe_relations` (origine/destination CASCADE, libellé 1–160, CHECK
origine ≠ destination, premiere_chapitre_id). RLS « own » complète sur les
deux tables.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('graphe')` — fermé → 404 ; livre d'autrui → 404.
- API `/api/livres/[id]/graphe` : GET (lecture filtrée par chapitreLu),
  POST (personnage/relation, réservé au PROPRIÉTAIRE), DELETE (idem) —
  session 401, interrupteur 404/403, UUID validés, RLS partout.
- Registre : l'entrée `graphe` (F25) existait déjà avec ses itinéraires et
  son API.

## Tests et vérifications

- `lib/graphe.test.ts` : 5 tests purs (filtrage par chapitre lu, règle
  « une arête ne révèle pas ses extrémités », comptage des masqués, rôles,
  positions du cercle).
- Build OK (33/33 pages), lien du livre conditionné à l'interrupteur.
- Limites assumées : pas de disposition physique (force-directed) — le
  cercle est lisible jusqu'à ~20 personnages ; extraction IA des personnages
  non incluse (prévue, Premium) ; chronologie = tri des cartes par apparition.
