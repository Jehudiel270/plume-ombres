# Fiche module 6 — Théories de lecture + comparateur

Date : 12/11/2026 · Branche : `fonctionnalite/theories` · Code : **F8/F19** ·
Effort : M · Risque juridique : aucun · Abonnement : **gratuit**.

## Écart assumé avec la maquette

La maquette `/theories` (F8) affichait les hypothèses d'une COMMUNAUTÉ (votes,
partage). L'atelier Plume d'Ombres est **personnel** : la version portée garde
la STRUCTURE (hypothèses rattachées à un livre, statuts traçants, comparaison
deux à deux) mais tout est PRIVÉ. Aucune théorie n'est visible d'un autre
compte (RLS « own », aucune route de partage).

## Livré

1. **Théories (F8)** — `/theories` : hypothèses de lecture personnelles.
   Titre (une phrase), raisonnement (sur quoi l'on s'appuie), étiquettes
   libres (au plus 5, plafonnées), statut traçant **Ouverte → Confirmée /
   Infirmée** (quand l'histoire répond, on tranche et on le garde).
2. **Comparateur (F19)** — deuxième onglet : choisir un livre + un terme
   (source ou traduction) → les passages où il apparaît, dans l'ordre de
   lecture, source italique en face du traduit. BORNÉ : 60 paires, extraits
   plafonnés à 300 caractères — jamais de texte intégral. C'est l'outil de
   VÉRIFICATION qui complète la vue bilingue (F7) : « comment ce nom, cette
   tournure a-t-elle été rendue partout ? ».

## Données (migration ADDITIVE, idempotente)

`20261112000003_theories.sql` — table `theories` : livre (CASCADE), chapitre
(SET NULL), titre (2–200), raisonnement (≤ 8 000), etiquettes text[]
(≤ 5 par l'app), statut (`ouverte | confirmee | infirmee`),
tranchee_au_chapitre_id, horodatages. RLS « own » complète.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('theories')` — fermé → 404.
- API `/api/theories` : POST/PATCH/DELETE (théories) + **GET ?livre=&terme=**
  (comparateur) — session 401, module fermé 404, plan insuffisant 403, UUID
  validés, RLS partout.
- Registre : entrée `theories` mise à jour (api: ['/api/theories']).

## Tests et vérifications

- `lib/theories.test.ts` : 3/3 (étiquettes bornées, statuts fermés et
  libellés, normalisation du terme).
- `npm run build` : OK (33/33 pages).
- Limites assumées : pas de votes ni de partage (privé par conception) ; le
  comparateur s'appuie sur les SEGMENTS traduits (un livre non traduit ne
  montre que la colonne source).
