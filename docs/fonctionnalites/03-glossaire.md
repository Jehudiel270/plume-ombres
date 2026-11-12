# Fiche module 4 — Écran de gestion du glossaire

Date : 12/11/2026 · Branche : `fonctionnalite/ecran-glossaire` · Code : **F16** ·
Effort : S · Risque juridique : aucun (le glossaire reste dans l'atelier du
lecteur, RLS « own », aucune donnée partagée).

## Problème du lecteur

La MÉCANIQUE du glossaire existe déjà depuis la mise en service de la traduction
(lib/glossaire.ts) : les entrées verrouillées sont injectées dans les prompts des
moteurs, avec budgets et décisions de traduction cohérentes d'un chapitre à
l'autre. Mais jusqu'ici une entrée ne pouvait être ajoutée que par les détections
automatiques de candidats — le lecteur n'avait aucun écran pour CONSULTER,
corriger, verrouiller ou supprimer un terme. La maquette définit cet écran
(F16) : gestion complète, ouverte sur le livre choisi, avec validation des
candidats proposés.

## Ce qui est porté (et ce qui ne l'est pas)

- **Ajouts uniquement** : aucune modification de lib/glossaire.ts. Les fonctions
  utilisées existaient déjà et sont déjà en prod côté traduction :
  `chargerGlossaire`, `proposerCandidats`, `ajouterEntree`, `majEntree`,
  `supprimerEntree`. La table `glossaires` et `glossaire_entrees` existent
  (migration 20261002000002) : **aucune migration SQL dans ce module**.
- Côté serveur : `/api/glossaire` (POST / PATCH / DELETE) revalide TOUT —
  session (401), interrupteur + plan (verifierModuleApi : module fermé → 404,
  plan insuffisant → 403), UUID du livre (400), propriété du livre par RLS
  (404 « introuvable » — un livre d'autrui se comporte comme inexistant),
  validité des catégories et des textes. Pour PATCH/DELETE, l'entrée est
  remontée entrée → glossaire → livre et vérifiée au même titre.
- Côté page : `/glossaire` est gardée par `verifierAccesModule` (module fermé →
  `notFound()`, la page n'existe pas). Le panneau n'est jamais rendu autrement.

## Interface

- Sélecteur de livre (les livres du compte, ordre par `updated_at`), onglets :
  « Entrées » (table triable, catégorie, verrou) et « Candidats » (détections
  automatiques du texte importé : occurrences, acceptation en un clic).
- Édition en place d'une entrée (source, traduction, catégorie, verrou) ;
  le verrou est mis en avant : une entrée verrouillée n'est JAMAIS remplacée
  par une suggestion du moteur.
- Formulaire d'ajout direct (source, traduction, catégorie, verrou).
- Toutes les écritures passent par `/api/glossaire` : le panneau ne touche
  jamais la base directement (le serveur est l'autorité).
- Conventions du projet réel : `champ-sombre`, `select-sombre`, `bouton-principal`,
  `sur-titre`, `liseret`, vouvoiement, pas d'emoji ; mobile 375 px d'abord
  (table en cartes empilées sous 640 px).

## Garde-fous et limites

- Entrées du glossaire visibles UNIQUEMENT par le propriétaire du livre (RLS) ;
  rien n'est exposé publiquement, aucune exportation dans ce module.
- L'écran liste jusqu'à 100 livres récents ; le paramètre `?livre=` est validé
  (UUID) et la propriété est revérifiée par la liste du compte.
- La détection des candidats est tolérante aux échecs (liste vide), jamais
  bloquante pour la consultation des entrées.
- Plan minimal : null (gratuit) — la traduction elle-même reste soumise aux
  crédits et aux plans du catalogue ; l'écran ne traduit rien.
