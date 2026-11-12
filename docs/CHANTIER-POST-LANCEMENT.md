# Journal du chantier post-lancement — Plume d'Ombres

Ouverture : 12/11/2026 · Flux : `main` (prod, intouchée) ← `develop` (intégration) ←
`fonctionnalite/<nom>` (une branche et un merge PAR fonctionnalité).

Règles appliquées (brief BRIEF-HERMES + décisions de l'administrateur) :

1. Une fiche AVANT le code, un merge par fonctionnalité, jamais de lot.
2. Ajouts uniquement ; migrations SQL additives (pas de DROP, pas de renommage).
3. Le serveur est l'autorité (interrupteurs, plan, anti-spoilers) : jamais un simple
   masquage d'interface.
4. Rien d'exposition publique sans juriste : modules à risque livrés éteints,
   activation impossible sans confirmation écrite (loi béninoise n° 2005-30).
5. Avant chaque merge : `npm run check:flags`, tests, `npm run build`.
6. Les migrations du chantier ne touchent la base de prod qu'au merge final.
7. Anti-spoilers : filtrage de données côté serveur, pas de flou CSS.
8. Conventions d'interface du projet réel (velours, champ-sombre, bouton-principal,
   sur-titre, liseret), vouvoiement, pas d'emoji, pas de nom de fournisseur.

Décisions de l'administrateur (12/11/2026) :

- **Clubs** : pas de juriste requis — clubs PRIVÉS (comptes inscrits, aucun texte de
  chapitre partagé, aucune page publique). Inscrit dans le registre.
- **Portage React/Next** de la maquette Nuxt (pas de migration de framework) :
  le site réel est en production, la logique des écrans est portée écran par écran.

Ordre d'attaque validé (rapport d'inspection du 12/11/2026) :

| # | Module | Code | Effort | État |
|---|---|---|---|---|
| 1 | Interrupteurs admin (registre, proxy, admin, check, tests) | — | M | **MERGÉ dans develop** |
| 2 | TTS lecture à voix haute | F9 | S | à venir |
| 3 | Vue bilingue alignée | F7 | M | à venir |
| 4 | Écran de gestion du glossaire | F16 | S | à venir |
| 5 | Carnet (notes, surlignage, citations, export) | — | M | à venir |
| 6 | Théories et comparateur | F8/F19 | M | à venir |
| 7 | Graphe narratif anti-spoilers (manuel d'abord) | F25 | L | à venir |
| 8 | Résumé à la reprise + Q&A anti-spoilers (IA) | — | M-L | à venir |
| 9 | XP, rangs, badges (non punitifs) | A17 | M | à venir |
| 10 | Cartes de lecture partageables | F13 | S-M | à venir (extrait cité : à peser) |
| 11 | Fiches d'ambiance enrichies | F5 | S-M | à venir |
| 12 | Univers multi-tomes / sagas | F17 | L | à venir (Illimité) |

Écartés du chantier (éteints par défaut, jamais sans juriste) : catalogue public,
collections éditoriales, calendrier des sorties, accès anticipé, commentaires publics,
avis notés. Variantes compatibles à étudier plus tard : œuvres libres de droits ou
auteurs partenaires avec partage de revenus, liens d'affiliation, licences de groupe.

## Suivi des merges dans develop

### 1. `fonctionnalite/interrupteurs-admin` — MERGÉ (12/11/2026)

- Registre `lib/fonctionnalites/registre.ts` (15 interrupteurs), états
  `lib/fonctionnalites/etats.ts` (cache 30 s, repli sûr), barrière proxy, barrière
  fine pages/API, page `/admin/fonctionnalites`, permission
  `admin.fonctionnalites.gerer`, migration `20261112000001_fonctionnalites_etats.sql`,
  garde-fou `npm run check:flags`.
- Tests : 16/16 dédiés, 187/188 au total (1 échec préexistant, indépendant),
  build OK, check:flags OK, lint inchangé.
- Fiche détaillée : `docs/fonctionnalites/00-interrupteurs-admin.md`.

## Précautions de fin de chantier

- Avant le merge final `develop` → `main` : passer les tests complets, appliquer les
  migrations additives à la base de prod, vérifier chaque interrupteur « fermé = 404 »
  en production, garder FedaPay en live uniquement sur `main`.
- Ne JAMAIS pousser de contenu fictif de la maquette (livre « Couronne de
  Cendre-Noire », personnages Elwenn, Maëlis, Lucan…) dans les données réelles.
- Rappel sécurité (reporté des sessions précédentes) : régénérer le jeton GitHub
  communiqué dans la conversation ; rotation du secret webhook FedaPay.
