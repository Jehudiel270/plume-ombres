# Fiche module 7 — Graphe narratif anti-spoilers (« l'arbre de l'histoire »)

Date : 12/11/2026, refondu le 15/11/2026 · Branche : `fonctionnalite/graphe-narratif` puis
`fonctionnalite/graphe-toile-riche` · Code : **F25** · Effort : L · Risque juridique : aucun ·
Abonnement : **gratuit** (les enrichissements IA du graphe viendront plus tard, Premium).

## Fonctionnalité signature, MANUELLE d'abord

La maquette (F25, `components/narrative`) propose une TOILE INTERACTIVE : glisser les
personnages, zoomer, survoler, légende de types cliquable, relations à fiabilité,
chronologie, fiche latérale. La première livraison (12/11) en reprenait le squelette
(cercle statique) ; la refonte du 15/11 porte l'expérience COMPLÈTE, adaptée au modèle
réel : c'est toujours le lecteur qui construit son graphe (aucune donnée d'intrigue
inventée), et le filtrage serveur reste la règle d'or.

## Livré (refonte du 15/11/2026)

1. **Page `/livres/[id]/graphe`** — coque serveur (livre + chapitres du compte) ; les
   DONNÉES du graphe viennent de l'API.
2. **Filtrage anti-spoilers PAR LE SERVEUR** — personnages, relations ET événements
   portent leur première apparition ; l'API GET ne renvoie que ce qui est couvert par
   le chapitre lu. Une relation n'est visible que si LES DEUX extrémités le sont ; un
   événement ne cite que des personnages couverts. Le client ne reçoit que le NOMBRE
   d'éléments masqués.
3. **Toile interactive** — personnages placés par IMPORTANCE (principaux au centre,
   anneaux concentriques), chacun GLISSABLE (positions de session), déplacement du
   fond, ZOOM molette et boutons (50–300 %, recentrage, réinitialisation, plein écran),
   infobulles au survol (rôle + degré ; phrase de relation + type + fiabilité),
   sélection avec anneau et mise en avant du VOISINAGE, courbes écartées pour les
   paires multiples, portraits ou initiales, libellés à la demande, recherche avec
   ciblage et flash, alternative textuelle sr-only.
4. **Relations lisibles d'un coup d'œil** — COULEUR = type (famille, amitié, alliance,
   rivalité, amour, autorité, dette, méfiance, trahison, secret, autre), TRAIT =
   fiabilité (fait plein, déduction tirets, hypothèse pointillé, incertain pointillé
   fin), ÉPAISSEUR = intensité (1–5), FLÈCHES = sens (aller, retour, réciproque),
   état courant lisible. LÉGENDE CLIQUABLE par type avec compteurs (masque/affiche).
5. **Vues** — GRAPHE / PERSONNAGES (table triée : rôle, importance, degré, fiche) /
   CHRONOLOGIE (événements datés par chapitre, genre coloré, personnages cliquables,
   localisation sur la toile).
6. **Fiche latérale** — personnage (relations directes cliquables, événements),
   relation (phrase, type, état, fiabilité, intensité en pastilles, localisation),
   événement (personnages, relation liée, localisation).
7. **Édition manuelle enrichie (propriétaire)** — personnage avec IMPORTANCE (1–3) ;
   relation complète (type, sens, intensité, état, fiabilité, apparition) ; ÉVÉNEMENTS
   de chronologie (genre, titre, texte, chapitre, personnages concernés, relation
   liée) ; suppressions.

## Données (migrations ADDITIVES, idempotentes)

`20261112000004_graphe_narratif.sql` — tables de base (`graphe_personnages`,
`graphe_relations`), RLS « own ».
`20261115000001_graphe_riche.sql` — `importance` (1–3) sur les personnages ; `type`,
`sens`, `intensite`, `etat`, `fiabilite` sur les relations ; table
`graphe_evenements` (chapitre obligatoire = filtrage anti-spoilers, genre check,
relation facultative, liste de personnages) avec RLS « own » complète.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('graphe')` — fermé → 404 ; livre d'autrui → 404.
- API `/api/livres/[id]/graphe` : GET (lecture filtrée par chapitreLu),
  POST (personnage/relation/événement, réservé au PROPRIÉTAIRE ; les
  personnages cités par un événement sont vérifiés dans le graphe du livre),
  DELETE (idem) — session 401, interrupteur 404/403, UUID validés, RLS partout.
- Registre : l'entrée `graphe` (F25) existait déjà avec ses itinéraires et
  son API.

## Tests et vérifications

- `lib/graphe.test.ts` : 10 tests purs (filtrage par chapitre lu, règle
  « une arête ne révèle pas ses extrémités », événements soumis au même
  filtrage, comptage des masqués nœuds + arêtes + événements, rôles, cercle,
  anneaux par importance, phrase de relation selon le sens, validateurs
  fermés, bornes intensité/importance). Suite complète : 303/303.
- Build OK (33/33 pages), lien du livre conditionné à l'interrupteur.
- Limites assumées : pas de disposition physique (force-directed) — le
  cercle est lisible jusqu'à ~20 personnages ; extraction IA des personnages
  non incluse (prévue, Premium) ; chronologie = tri des cartes par apparition.
