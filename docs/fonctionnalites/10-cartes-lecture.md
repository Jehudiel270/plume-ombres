# Fiche module 10 — Cartes de lecture partageables (F13)

Date : 12/11/2026 · Branche : `fonctionnalite/cartes-lecture` · Code : **F13** ·
Effort : S-M · Risque juridique : **extrait cité — encadré** (voir Garde-fous) ·
Abonnement : **gratuit**.

## Fonction

Une citation mise en carte visuelle : extrait plafonné, titre du livre et du
chapitre, attribution de l'atelier, rappel de droits. Aperçu immédiat,
téléchargement en SVG (ouvrable partout, sans service externe) ou copie du
texte avec attribution.

## Encadrement de l'extrait cité (le point sensible, noté au registre)

- **Plafond STRICT de 280 caractères** appliqué dans la lib (non contournable
  par l'interface), coupe sur frontière de mot avec ellipse.
- **Attribution TOUJOURS apposée** dans le SVG (produit par `lib/cartes`,
  échappé) + rappel : « Extrait cité, usage privé — l'œuvre reste la
  propriété de ses ayants droit ».
- **Aucune publication automatique** : pas de partage social intégré, pas de
  page publique, rien n'est stocké (la carte naît et vit côté client).
- La page ne transfère AUCUN texte intégral : le lecteur colle son extrait,
  les chapitres ne fournissent que leurs titres.
- Module livré ÉTEINT (`prod: false`) : l'administrateur pèse l'ouverture.

## Interface

`/cartes` : choix du livre (et du chapitre pour la référence), collage de
l'extrait, compteur plafonné visible, aperçu fidèle, téléchargement SVG,
copie avec attribution.

## Garde-fous (le serveur est l'autorité)

- Page : `verifierAccesModule('cartes')` — fermé → 404.
- Registre : l'entrée `cartes` (F13) existait (itineraires `['/cartes']`).
  Aucune API : aucune écriture, aucune donnée de lecteur collectée.
- check:flags : 17 interrupteurs / 31 pages / 28 routes, toutes couvertes.

## Tests et vérifications

- `lib/cartes.test.ts` : 4/4 (plafond strict + coupe de mot, échappement
  SVG, découpe de lignes bornée, attribution et rappel présents dans le SVG).
- Build OK (34/34 pages).
- Limites assumées : SVG plutôt que PNG (pas de dépendance canvas) ; la
  publication hors atelier reste de la responsabilité du lecteur — la carte
  porte le rappel, pas une validation juridique.
