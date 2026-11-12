# Fiche module 3 — Vue bilingue alignée

Date : 12/11/2026 · Branche : `fonctionnalite/vue-bilingue` · Code : **F7** ·
Effort : M · Risque juridique : aucun (usage strictement personnel, aucun contenu
ne quitte l'atelier du lecteur).

## Problème du lecteur

La traduction est automatique : le lecteur veut VÉRIFIER la fidélité d'un passage
qui lui paraît étrange. La recherche du PDF de cadrage (F7, « Comparateur de
traduction ») définit exactement cela : texte source et texte traduit alignés,
« alignement segment par segment ». Idées-améliorations la classe « fort effet,
effort M, gratuit » : c'est LE différenciateur de confiance face à une traduction
automatique.

## Alignement : segment par segment, exact par construction

La traduction du projet est produite SEGMENT par SEGMENT (lib/segmenter.ts, table
`segments`) : chaque segment porte sa source et sa traduction. La vue bilingue
lit donc les segments du chapitre (une requête, RLS « own », ordre par position)
et les affiche en paires — l'alignement est exact car c'est celui qui a servi à
traduire.

- Segment non traduit : colonne traduction vide (tiret discret) — rien n'est
  inventé, le lecteur voit ce qui reste à traduire.
- Repli : si les segments sont indisponibles, les textes assemblés
  (`chapitres.texte_source` / `texte_traduit`) sont appariés PARAGRAPHE par
  PARAGRAPHE avec le même outil typographique que le rendu
  (`decouperEnParagraphes`, séparateurs de scène exclus des deux côtés), et les
  offsets exacts du côté traduit permettent à la recherche de surligner.
- Sécurité : `debutTraduit = -1` désactive le surlignage d'une paire dont
  l'offset est inconnu (paires par segments) — jamais de marque posée au hasard.

## Interface

- La bascule du lecteur (CommandesTraduction) gagne un TROISIÈME bouton
  « Bilingue », affiché seulement si l'interrupteur est ouvert ET que le
  chapitre possède une traduction.
- Rendu : côte à côte dès 640 px (grid 2 colonnes), empilé au-dessus en mobile ;
  colonne source visuellement secondaire (plus petite, italique, pâle, liseré à
  gauche, attribut `lang` de la langue source pour la césure et les lecteurs
  d'écran).
- La recherche plein texte et le TTS continuent de porter sur le texte AFFICHÉ
  (la traduction) : `texteNet` ne change pas de définition.
- Lettrine conservée sur la toute première paire ; `content-visibility` par
  paquets de 6 paires (chapitres longs).

## Branchement (ajouts minimals, même logique que le module 2)

| Fichier | Changement |
|---|---|
| `lib/bilingue.ts` (nouveau) | logique pure : appariement segments + repli paragraphes |
| `lib/bilingue.test.ts` (nouveau) | 5 tests |
| `components/lecteur/Lecteur.tsx` | props facultatives `pairesBilingue` / `langueSourceBilingue` + branche de rendu des paires |
| `components/lecteur/CommandesTraduction.tsx` | types élargis + bouton « Bilingue » conditionné à `bilingueDisponible` |
| `components/EspaceLivre.tsx` | type d'état étendu (`'bilingue'`), lecture des segments au besoin, passage des props |
| `app/livres/[id]/page.tsx` | barrière fine serveur `verifierAccesModule('bilingue')` (en parallèle de F9, Promise.all) |
| `app/globals.css` | styles additifs `.paire-bilingue` / `.bilingue-source` / `.bilingue-attente` |

Le serveur est l'autorité : interrupteur évalué côté page (registre + plan
effectif du compte) ; le bouton n'existe pas quand le module est fermé.

## Tests et vérifications exécutés

- `npx tsx --test lib/bilingue.test.ts` : **5/5** (segments, offsets exacts,
  séparateurs de scène, débordements, textes vides).
- `npm run test:unitaires` : 199/200 (seul échec = préexistant, fuseau UTC).
- `npm run check:flags` : OK · `npm run build` : OK · `npm run lint` : à l'état de
  base de `develop`.

## Ce qui n'est pas vérifié ici

- Le rendu réel sur chapitre long (88 000 caractères) avec des milliers de
  segments : l'architecture (paquets, requête unique) est celle du lecteur
  existant, mais la mesure sur données réelles se fera sur l'aperçu.
- Le tap-à-mot (définition au toucher, idée 3 du document d'idées) n'est PAS
  inclus : périmètre tenu à la vue alignée.
