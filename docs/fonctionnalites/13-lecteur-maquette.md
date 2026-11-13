# Fiche module 13 — Lecteur : portage de la maquette

Date : 14/11/2026 · Branche : `fonctionnalite/lecteur-maquette` ·
Base : **maquette du lecteur livrée dans le zip `plume-ombres-ui`**
(`pages/lire/[id]/[n].vue`, `components/reader/*`, `components/notebook/*`) ·
Effort : L · Risque juridique : aucun · Abonnement : socle gratuit ;
Résumé/Questions restent derrière l'interrupteur `reprise` (F6/F10,
Passionné), comme à la livraison.

## Problème du lecteur

La vague précédente avait empilé les outils dans une rangée au-dessus du
chapitre (recherche, Aa, lecture à voix haute, carnet, reprise, défiler,
plein écran) : encombrant, jamais atteignable pendant le défilement, et le
carnet se limitait à un formulaire. La consigne de l'administrateur : partir
de la MAQUETTE (le zip) et l'adapter, pas réinventer.

## Livré (chaque point cite son origine dans le zip)

1. **Barre d'outils fixe du bas** (`BarreOutilsLecteur.tsx`) — portage
   direct de la barre `rd-tool` de la maquette : icône + libellé, cible
   tactile 44 px, défilement horizontal quand ça déborde. Outils :
   Bilingue, Écouter, Carnet, Résumé, Questions, Chercher, Réglages,
   Défiler, Plein écran — chacun monté seulement si le module est ouvert
   (évalué côté serveur). La rangée d'outils au-dessus du chapitre est
   SUPPRIMÉE : le texte est l'interface.
2. **Feuille du lecteur** (`FeuilleLecteur.tsx`) — portage de
   `ReaderSheet.vue` : feuille du bas sur mobile, carte en bas à droite
   sur grand écran, fond assombri cliquable, Échap, non modale (la lecture
   vocale continue derrière).
3. **Écouter** (`useVoix.ts` + `PanneauEcouter.tsx`) — portage de
   `ReaderTts.vue` : Play/Pause/Stop, état annoncé (« Paragraphe X sur
   Y »), vitesse en boutons segmentés, voix de l'appareil (françaises
   d'abord), message d'échec. Le paragraphe lu reste signalé dans le
   texte. FINI le retour en haut pour couper : la barre du bas reste à
   l'écran en scrollant.
4. **Sélection de texte** (`MenuSelection.tsx`) — portage de
   `ReaderSelectionMenu.vue` : cinq couleurs de surlignage (or, rouge,
   azur, menthe, lilas), note en place, PLUS les actions propres au
   lecteur demandées : Copier, Comparer (termes vers le comparateur
   F19, prérempli), Chercher (dans le chapitre). Les commandes natives
   du navigateur restent disponibles (le menu ne bloque pas la
   sélection).
5. **Surlignages re-rendus dans le texte** — même mécanique que la
   maquette : l'extrait du carnet est retrouvé dans le chapitre (blancs
   ignorés, `lib/plages-texte.ts`, pur et testé) et marqué `mark` de la
   couleur choisie. Fusion avec les occurrences de recherche : la
   recherche prime, le surlignage reparaît intact après. Clic sur un
   surlignage : Copier / Annoter / Retirer (sans quitter la lecture).
6. **Carnet express** (`PanneauCarnetExpress.tsx`) — portage de
   `NotebookComposer.vue` adapté : livre et chapitre déjà connus, type
   Note/Citation, couleur, commentaire ; modification d'une entrée via
   la bulle (PATCH).
7. **Résumé et Questions** (`PanneauxAide.tsx`) — portage de
   `ReaderRecap.vue` / `ReaderQa.vue` : mêmes deux outils de la barre,
   mêmes garde-fous anti-spoilers (l'API construit le contexte serveur
   avec les chapitres ≤ position).
8. **Correctif « pages manquantes »** — `/api/atelier/liens` renvoie les
   pages des modules ouverts pour le compte (Carnet, Théories,
   Progression, Ambiance, Glossaire, Univers, Cartes) ; la barre de
   navigation affiche l'entrée « Atelier » (desktop + mobile) quand au
   moins un module est ouvert. Un module activé est désormais trouvable
   PARTOUT, pas seulement dans la fiche d'un livre.
9. **Comparateur clarifié (F19)** — onglet renommé « Comparateur de
   traduction », explication concrète avec exemple, préremplissage
   `?onglet=comparateur&terme=…` quand on arrive depuis le lecteur (la
   recherche part toute seule).

## Données (migration ADDITIVE, idempotente)

`20261114000005_carnet_couleurs.sql` — `alter table carnet_notes add
column if not exists couleur text check (couleur is null or
char_length(couleur) <= 20)`. Aucune suppression, aucun renommage ; les
entrées existantes (couleur NULL) s'affichent en azur. API `/api/carnet` :
GET (liste filtrée livre/chapitre/type), POST et PATCH acceptent
`couleur`.

## Garde-fous (le serveur est l'autorité)

- Les outils du lecteur ne se montent que si l'interrupteur est ouvert :
  la page `/livres/[id]` évalue `verifierAccesModule` et ne passe que des
  drapeaux booléens (aucune logique de droit côté client).
- `/api/carnet` : session 401, module fermé 404, plan insuffisant 403,
  UUID validés, extraits plafonnés (800 car.), RLS « own » partout.
- `/api/atelier/liens` : session 401, interrupteurs revérifiés par lien,
  `Cache-Control: no-store`, déclarée dans `ITINERAIRES_SOCLE` (aucun
  contenu de lecture, des liens).

## Tests et vérifications

- `lib/plages-texte.test.ts` : 11/11 (fusion recherche × surlignages,
  primauté de la recherche, rognage hors bornes, `trouverExtrait`
  insensible aux blancs).
- Suite complète : **272/272** (261 précédents + 11 nouveaux).
  `npm run check:flags` : 17 interrupteurs, 33 pages, 33 routes d'API
  couvertes. `npm run build` : OK.
- Limites assumées : le surlignage d'un passage à cheval sur deux
  paragraphes ne se re-marque pas (limite de la correspondance par
  bloc, identique à la maquette) ; la vue bilingue garde l'ancien
  surlignage de recherche seul ; « Fiche » de la maquette n'a pas de
  sens ici (le lecteur EST la fiche) et laisse la place au plein écran.
