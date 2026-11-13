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
| 2 | TTS lecture à voix haute | F9 | S | **MERGÉ dans develop** |
| 3 | Vue bilingue alignée | F7 | M | **MERGÉ dans develop** |
| 4 | Écran de gestion du glossaire | F16 | S | **MERGÉ dans develop** |
| 4b | Confort lecteur : plein écran, défilement auto, raccourcis | socle | S | **MERGÉ dans develop** |
| 5 | Carnet (notes, citations, surlignages + export F24 Premium) | F2 | M | **MERGÉ dans develop** |
| 6 | Théories privées + comparateur de cohérence | F8/F19 | M | **MERGÉ dans develop** |
| 7 | Graphe narratif anti-spoilers (manuel) | F25 | L | **MERGÉ dans develop** |
| 8 | Résumé à la reprise + Q&A anti-spoilers (IA, Premium) | F6/F10 | M-L | **MERGÉ dans develop** |
| 9 | XP, rangs, badges (non punitifs) | A17 | M | **MERGÉ dans develop** |
| 10 | Cartes de lecture (extrait plafonné + attribution) | F13 | S-M | **MERGÉ dans develop** (éteint : à peser) |
| 11 | Fiches d'ambiance enrichies | F5 | S-M | **MERGÉ dans develop** |
| 12 | Univers multi-tomes / sagas | F17 | L | **MERGÉ dans develop** (Illimité) |

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

### 2. `fonctionnalite/lecture-vocale` — MERGÉ (12/11/2026)

- Lecture à voix haute (F9) par Web Speech API : découpage typographique partagé
  avec le rendu, voix françaises d'abord, vitesse et voix mémorisées, paragraphe
  en cours signalé et amené à l'écran.
- Branchement minimal : prop `outils` facultative dans Lecteur, prop
  `lectureVocaleOuverte` dans EspaceLivre, barrière fine serveur dans la page du
  livre (`verifierAccesModule`). Livré fermé : rien ne s'affiche avant ouverture
  de l'interrupteur `lecture_vocale`.
- Tests : 7/7 dédiés, 194/195 au total, build OK, check:flags OK, lint à l'état
  de base.
- Fiche détaillée : `docs/fonctionnalites/01-lecture-vocale.md`.

### 3. `fonctionnalite/vue-bilingue` — MERGÉ (12/11/2026)

- Vue bilingue alignée (F7) : paires source ↔ traduction construites depuis les
  SEGMENTS (alignement exact par construction, les unités réellement traduites),
  repli paragraphe par paragraphe avec offsets exacts pour la recherche.
- Interface : troisième bouton « Bilingue » dans la bascule du lecteur, rendu
  côte à côte dès 640 px, colonne source secondaire, segment non traduit visible.
- Barrière fine serveur `verifierAccesModule('bilingue')` dans la page du livre.
- Tests : 5/5 dédiés, 199/200 au total, build OK, check:flags OK, lint à l'état
  de base.
- Fiche détaillée : `docs/fonctionnalites/02-vue-bilingue.md`.

### 4. `fonctionnalite/ecran-glossaire` — MERGÉ (12/11/2026)

- Écran de gestion du glossaire (F16) : consultation, ajout, correction, verrou
  et suppression des entrées ; validation en un clic des candidats détectés
  automatiquement. Zéro modification de la mécanique d'injection existante
  (lib/glossaire.ts) et **aucune migration SQL** (tables de 20261002000002).
- Serveur : `/api/glossaire` (POST/PATCH/DELETE) — session 401, module fermé
  404, plan insuffisant 403, livre d'autrui 404 (RLS « own », entrée remontée
  entrée → glossaire → livre pour PATCH/DELETE).
- Page `/glossaire` gardée par `verifierAccesModule('glossaire')` — module
  fermé = 404. Livré fermé (interrupteur `glossaire`, `prod: false`).
- Tests, build et check:flags exécutés avant le merge (voir fiche).
- Fiche détaillée : `docs/fonctionnalites/03-glossaire.md`.

### 4b à 12. Mergés le 12/11/2026 (détail dans les fiches)

- **4b `fonctionnalite/confort-lecteur`** — plein écran (Fullscreen API,
  dégradation propre sans API), défilement automatique réglable (20–300 px/s
  mémorisé, pause auto bas de page / changement de chapitre), raccourcis
  `f` / `a` / `←` `→`, TTS élargi ×0,5–×2. Socle gratuit. Fiche :
  `docs/fonctionnalites/04-confort-lecteur.md`.
- **5 `fonctionnalite/carnet`** — Carnet F2 (notes, citations, surlignages)
  + export portable F24 Premium. Migration 20261112000002. Fiche :
  `docs/fonctionnalites/05-carnet.md`.
- **6 `fonctionnalite/theories`** — théories PRIVÉES F8 (statut traçant) +
  comparateur de cohérence F19 (terme → paires source↔traduit bornées).
  Migration 20261112000003. Fiche : `docs/fonctionnalites/06-theories-comparateur.md`.
- **7 `fonctionnalite/graphe-narratif`** — graphe F25 manuel (personnages +
  relations, première apparition), filtrage anti-spoilers PAR LE SERVEUR
  (une arête exige ses deux extrémités visibles). Migration 20261112000004.
  Fiche : `docs/fonctionnalites/07-graphe-narratif.md`.
- **8 `fonctionnalite/assistance-lecture`** — résumé à la reprise F10 (cache
  par livre) + questions F6, Premium. Anti-spoilers STRUCTUREL : le contexte
  du modèle ne contient que les chapitres ≤ lu. Migration 20261112000005.
  Fiche : `docs/fonctionnalites/08-assistance-reprise.md`.
- **9 `fonctionnalite/progression`** — XP/rangs/badges A17 non punitifs
  (25 XP par chapitre découvert, UNIQUE en base). Migration 20261112000006.
  Fiche : `docs/fonctionnalites/09-progression-xp.md`.
- **10 `fonctionnalite/cartes-lecture`** — cartes F13 (extrait plafonné
  STRICT 280 + attribution toujours apposée, aucune publication auto).
  Livré éteint (extrait cité : à peser). Fiche :
  `docs/fonctionnalites/10-cartes-lecture.md`.
- **11 `fonctionnalite/ambiance`** — fiches F5 (genres, tropes, intensité
  1–5) par livre, server action gardée. Migration 20261112000007. Fiche :
  `docs/fonctionnalites/11-ambiance.md`.
- **12 `fonctionnalite/univers`** — sagas F17 privées, tomes ordonnés,
  plan Illimité. Migration 20261112000008. Fiche :
  `docs/fonctionnalites/12-univers.md`.

Incident noté : le bac à sable a été recyclé en cours de chantier (dépôt local
remplacé par un clone ancien) — les modules 4b à 8 ont été RECONSTRUITS puis
poussés immédiatement après chaque merge ; aucun contenu perdu.

## 13/11/2026 — Mise en ligne de l'aperçu : diagnostic + clé du modèle

État de départ : les modules 1 à 12 sont tous MERGÉS dans `develop` et
poussés. Le retour du terrain est le suivant :

1. **« Internal Server Error » sur l'aperçu develop** — diagnostic
   confirmé par reproduction locale : les variables d'environnement
   Supabase n'étaient pas actives pour la portée « Preview » de Vercel ;
   `createServerClient` lève à chaque requête et l'environnement entier
   répond un 500 opaque. Deux parades livrées sur
   `correctif/proxy-env-manquant` (mergé) :
   - le proxy répond une page **503 explicite** (quoi cocher, où) quand
     les variables manquent, avec trace console pour les logs Vercel ;
   - une panne momentanée de Supabase est tolérée : la session est
     ignorée au lieu de faire répondre 500 à tout le site (pages
     publiques lisibles, privées renvoyées vers `/connexion`).
   Procédure complète d'ouverture : `docs/mise-en-ligne-apercu-develop.md`
   (portée Preview + SQL consolidé `docs/sql/migrations-chantier-consolidees.sql`
   + interrupteurs + clé du modèle).
2. **Clé du modèle d'aide à la lecture collable dans le panneau admin**
   (`fonctionnalite/cle-modele-admin`, mergée) : table
   `parametres_systeme` (migration 20261113000001, RLS lecture + écriture
   réservées à `est_admin()`, journalisation SANS la valeur), API
   `/api/admin/parametres` (GET aperçu masqué / PUT / DELETE, garde
   `admin.fonctionnalites.gerer`), formulaire en bas de
   `/admin/fonctionnalites`. `lib/parametres.ts` : la variable
   d'environnement `GEMINI_API_KEY` prime toujours (voie officielle pour
   tous les abonnés) ; la clé en base sert à l'essai PAR l'administrateur
   sur SON compte, sans redéploiement. La valeur complète ne quitte
   jamais le serveur (aperçu `AIza…x9Qz`).
   Fiche mise à jour : `docs/fonctionnalites/08-assistance-reprise.md`.
3. Vérifications du 13/11 : suite complète **239/239**, `check:flags`
   **17 interrupteurs / 33 pages / 30 routes** toutes couvertes, build
   OK (**36/36** pages), reproduction locale du 503 et de la dégradation
   gracieuse (accueil 200, `/bibliotheque` → 307).

## Précautions de fin de chantier

- Avant le merge final `develop` → `main` : passer les tests complets, appliquer les
  migrations additives à la base de prod, vérifier chaque interrupteur « fermé = 404 »
  en production, garder FedaPay en live uniquement sur `main`.
- Ne JAMAIS pousser de contenu fictif de la maquette (livre « Couronne de
  Cendre-Noire », personnages Elwenn, Maëlis, Lucan…) dans les données réelles.
- Rappel sécurité (reporté des sessions précédentes) : régénérer le jeton GitHub
  communiqué dans la conversation ; rotation du secret webhook FedaPay.
