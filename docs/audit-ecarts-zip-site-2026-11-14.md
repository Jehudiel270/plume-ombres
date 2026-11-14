# Audit d'écarts — cahier initial (zip) ↔ site en ligne

Date : 14/11/2026. Comparaison systématique du cahier initial
(`chantier/ui/plume-ombres-ui` — design Nuxt de démonstration) avec
le site Plume d'Ombres (Next.js + Supabase).

## 1. Ce qui MANQUAIT — rétabli par ce chantier (20261114160000)

| Fonctionnalité du zip | État avant | État après |
|---|---|---|
| Programme de lecture par étapes (4 chapitres/semaine, focus, déverrouillage progressif) | Absent | `clubs_etapes` + onglet « Programme de lecture », plafond de discussion croisé (position de lecture × étape ouverte) |
| Sondages du club | Absent (restes de base sans code) | `clubs_sondages` + options + votes, un vote par membre garanti par clé primaire, résultats après le vote |
| Rencontres (en ligne / salon écrit, participants) | Absent | `clubs_rencontres` + participants, bascule « Je participe », passées/à venir |
| Rôles admin / moderateur / membre | Absent (créateur seul) | `clubs_membres.role`, gestion par l'admin, exclusion, liste des membres visible du club |
| File de modération | Absent (champ `signale` orphelin) | `clubs_signalements` (motif), traitement conserver/masquer par le staff, `clubs_messages.masque` invisible des membres (RLS) |
| Fiche d'ambiance riche (palette de 5 couleurs nommées, atmosphère, ton, rythme 1-5 + libellé, promesses sans spoiler, playlist nommée avec pistes titre/humeur/minutes, citation d'ouverture du chapitre 1, mots-clés) | Socle seul (genres, tropes, intensité) | Colonnes riches + formulaire complet + page `/ambiance/[id]` fidèle au cahier |
| Recommandations d'œuvres « Pour vous si vous avez aimé » | Absent | Score genres ×2 + tropes ×1 sur la bibliothèque du compte, top 3, jamais un livre sans lien |

Détail de correction pendant le chantier : la base contenait des
tables `clubs_sondages` / `clubs_rencontres` d'un chantier antérieur
JAMAIS branché au site (schéma différent, zéro ligne, aucun code
versionné ne les lisait) — c'est l'origine de la divergence entre ce
qui avait été annoncé et ce qui était réellement utilisable. Elles
ont été remplacées proprement par le schéma cible.

## 2. Écarts RESTANTS détectés (décision requise)

**Décision de l'administrateur (15/11/2026)** : les deux écarts à risque
juridique sont laissés de côté ; les deux suivants sont rétablis en
variante atelier (migration 20261115000005, module `suivis`).

| Écart du zip | Décision du 15/11/2026 | Réalisation |
|---|---|---|
| Avis de lecteurs (`reviews`) | **LAISSÉ de côté** — avis publics sur des œuvres : diffamation, LCEN, droit de réponse ; exposition éditoriale du site | — |
| Demandes de retrait (`takedown_requests`) | **LAISSÉ de côté** — procédure légale de retrait de contenu (notifications, délais, voies de recours) | — |
| Suivi des sorties (`follows`) | **RÉTABLI** (variante atelier) | `suivis_oeuvres` (RLS : ses livres seulement), bouton « Suivre cette œuvre » sur /livres/[id] et /ambiance/[id], page `/suivis` |
| Calendrier de sorties (`chapter_releases` + accès anticipé) | **RÉTABLI en variante atelier** — la version « la plateforme publie des chapitres avec accès anticipé abonnés » reste derrière `calendrier` (éteint, risque juridique) | `/suivis` : agenda des sorties RÉELLES (rencontres des clubs à venir, échéances de défis, traductions terminées) |
| Notifications de club (transversal, "vous serez prévenu" du cahier) | **RÉTABLI** | type `club` + RPC `notifier_club` (SECURITY DEFINER) : étape ouverte, rencontre proposée, sondage publié → notification aux membres, hors auteur |
| Commentaires publics par chapitre (`comments` + `comment_votes` + balise spoiler + abonnés) | Écart VOLONTAIRE — la décision d'architecture du 12/11/2026 (clubs privés, rien de public) prime ; couvert par le salon vivant des clubs | — |
| Page « À la une » (discover : nouveautés, sorties, communautés) | P2 — fusionnable avec le catalogue existant | — |

## 3. Ce qui était DÉJÀ aligné (vérifié)

Lecture bilingue, lecture vocale, carnet (notes/citations/hypothèses),
glossaire, théories, graphe narratif, univers de saga, cartes de
lecture, défis, XP/badges/familier, collections personnelles,
favoris, calendrier, clubs vivants (réactions, réponses, messages
privés, émojis réels, épinglage, édition 15 min), import PDF/EPUB,
traduction multi-moteurs, exports EPUB/PDF/DOCX, admin complet,
PWA, pages légales.

## 4. Méthode de vérification à respecter au déploiement

1. Tests unitaires (353), `tsc --noEmit`, `next build` — verts.
2. Migration appliquée au pooler + `notify pgrst, 'reload schema'`.
3. Après merge `main` : vérification HUMAINE en ligne de chaque
   onglet d'un club réel (programme posé puis étape ouverte, sondage
   créé puis voté, rencontre proposée puis rejointe, rôle changé,
   message signalé puis masqué) et d'une fiche d'ambiance riche
   (palette, playlist, citation) — le retour « scripts verts » ne
   suffit jamais (leçon des chantiers précédents).

## 5. Vérifications EN LIGNE réellement passées (14/11/2026)

Comptes jetables créés puis supprimés, session réelle, cookies
@supabase/ssr, sur https://plumedombres.kodelyza.com :

| Vérification | Résultat |
|---|---|
| POST /api/clubs (création) | 201, créateur `role=admin` |
| Programme : génération 10 chapitres → 3 étapes de 4 | 200, dernier ouvert chapitre 4 |
| Ouverture séquentielle de l'étape 2 | 200 |
| Sondage (3 options) | 200, répartition vide avant le vote |
| Vote unique (doublon refusé) | 200 puis 409 |
| Rencontre « salon écrit » + bascule participation | 200 |
| Message + signalement + file staff + masquage | 200, `masque=true` en base |
| Page salon : 4 onglets rendus (programme, sondages, membres, rencontres) | 200 |
| Fiche ambiance riche : palette nommée, atmosphère, ton, rythme, promesses, playlist, citation ch. 1, mots-clés | 200, tout rendu |
| Recommandations « Pour vous si vous avez aimé » | rendues (genres + tropes partagés) |

Correctif de sécurité posé pendant la vérification : la première
policy d'adhésion (`clubs_membres_select_club`) lisait
`clubs_membres` dans sa propre clause USING — PostgreSQL renvoyait
42P17 (récursion infinie) et bloquait la lecture des membres en
ligne. Remplacée par la fonction `appartient_au_club()`
(SECURITY DEFINER) — migration 20261114170000.

Note d'infrastructure : le protocole git (HTTPS smart-HTTP) restait
bloqué depuis l'environnement de travail ; les poussées ont été
effectuées via l'API Git Data de GitHub (blobs → arbre → commits →
refs), à contenu de commit identique au dépôt local. (Le 15/11 : le
HTTPS est de nouveau fonctionnel — poussées normales.)

## 6. Vérifications EN LIGNE du chantier « suivis » (15/11/2026)

Probe `scripts/probe-suivis-agenda.mts` (réutilisable) : deux comptes
jetables créés puis supprimés, session réelle, cookies @supabase/ssr,
sur https://plumedombres.kodelyza.com — **24/24 vérifications
réussies** :

| Vérification | Résultat |
|---|---|
| POST /api/clubs + programme 12 chapitres → 3 étapes | 201, 200 |
| POST /api/suivis (suivre son livre) | 201 |
| POST /api/suivis (doublon) | 200, `dejaSuivi=true` (idempotent) |
| POST /api/suivis (livre d'autrui) | 403 (RLS + policy) |
| GET /api/suivis | 200 : livre listé avec chapitres, œuvre traduite dans les sorties |
| GET /suivis (page) | 200, titre + œuvres suivies rendus |
| Bouton de suivi fiche livre / fiche ambiance | rendu, état `aria-pressed` correct dans les DEUX sens (suivi → non suivi) |
| PATCH etapes (ouvrir étape 2) + POST rencontre + POST sondage | 200 |
| Notifications de club (type `club`) : l'autre membre reçoit étape / rencontre / sondage | 3/3 ; l'auteur ne reçoit PAS ses propres événements |
| Agenda /api/suivis contient la rencontre à venir | oui |
| DELETE /api/suivis | 200, livre retiré, bouton repasse à « Suivre cette œuvre » |
| Nettoyage comptes jetables | cascade complète (0 livre restant) |

Leçon notée pendant le probe : après POST suivi, la fiche livre rend
le bouton en état « Œuvre suivie » — vérifier l'ÉTAT réel, pas un
libellé supposé.
