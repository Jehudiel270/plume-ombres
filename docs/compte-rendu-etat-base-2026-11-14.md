# Compte rendu du 14 novembre 2026 — État de la base et application des migrations

Suite directe aux comptes rendus des 13 et 14/11 : vous m'avez transmis la
clé Supabase pour que j'applique moi-même `docs/sql/migrations-chantier-consolidees.sql`.
Voici exactement ce que cette clé permet, l'état réel constaté de la base,
et le chemin le plus court pour terminer.

## 1. La clé transmise : ce qu'elle permet et ce qu'elle ne permet pas

Le jeton reçu est la **clé `anon`** du projet (le champ `role: anon` est
inscrit dans le jeton lui-même, sa référence de projet est la bonne). C'est
la clé **publique** qui embarque dans le navigateur de chaque visiteur.

Elle permet : **sonder** la base via l'API REST — détecter si une table ou
une fonction existe (absente = HTTP 404 ; présente = toute autre réponse,
généralement 401 car protégée par RLS) — sans jamais lire la moindre donnée.

Elle ne permet **pas** : exécuter du SQL de structure (DDL). Créer les
tables et fonctions exige l'un de ces trois accès, que je n'ai pas :
le mot de passe de la base (`SUPABASE_DB_PASSWORD`), un jeton personnel
d'API de gestion (`sbp_…`), ou le collage manuel dans le SQL Editor.
J'ai donc sondé, pré-vérifié et préparé **tout ce qui pouvait l'être** :
il ne manque qu'une seule information pour que j'exécute moi-même.

## 2. État réel de la base (sondage du 14/11)

Projet `imbziizequckeaxuotdz`, joint et fonctionnel. La base est **à jour
jusqu'au lot du 3 novembre inclus**, plus la première moitié du lot du
11 novembre :

- dépendances du fichier consolidé **toutes présentes** : `abonnements`,
  `abonnements_historique`, `admin_actions`, `chapitres`, `livres`,
  `paiements`, `plans_abonnement`, `profiles`, fonctions `est_admin` et
  `est_super_admin` ;
- lots du 03/11 appliqués (`visites`, `admin_sections`, `admin_alertes`,
  `mes_sections`, `purger_visites`…) ;
- lot du 11/11 n°1 (`pseudo`, `moyen` sur `paiements`) appliqué.

**Manquant — 16 objets**, exactement deux paquets jamais collés :

| Paquet | Contenu | Effet tant que ce n'est pas appliqué |
| --- | --- | --- |
| 11/11 n°2 | fonction `admin_supprimer_compte` + action « supprimer_compte » du journal | la suppression d'un compte depuis le tableau de bord échoue (l'écran existe, la RPC non) |
| Chantier consolidé (12/11 → 14/11) | `fonctionnalites_etats`, `carnet_notes`, `theories`, `graphe_personnages`/`graphe_relations`, `resume_lectures`, `lectures_xp`/`badges_obtenus`, `ambiance_livres`, `univers`/`univers_livres`, `parametres_systeme`, `cles_api`, `admin_stats_revenus`, `evenements_webhook` | onglet « Clés API » vide, bloc revenus en attente, journal des webhooks muet, modules du chantier sans stockage |

Conformément à ce qui était prévu, les écrans de la vague 2 **tolèrent**
cet état (message explicite au lieu d'une erreur) : le site ne casse pas,
mais tout le chantier reste en veilleuse tant que la base n'a pas reçu
ces deux paquets.

Observation au passage : la table `journal_admin` n'existe pas en
production et **aucune migration ne la crée** — toutes les migrations y
font référence sous garde (`to_regclass … is not null`), la journalisation
d'administration est donc silencieusement ignorée. Sans effet aujourd'hui
(aucun écran ne la lit), à créer un jour si l'on veut un vrai journal
d'audit consolidé.

## 3. Ce qui a été fait ce jour (branche `fonctionnalite/application-migrations`)

- **Fichier consolidé étendu** : le lot 11/11 n°2 (`suppression_comptes_admin`)
  est désormais inclus en tête de `docs/sql/migrations-chantier-consolidees.sql`
  avec l'en-tête mis à jour — **un seul collage suffit à présent pour tout
  appliquer**, y compris ce qui manquait hors chantier. Le fichier reste
  additif et idempotent.
- **Intégrité vérifiée** : chaque instruction significative des 13 fichiers
  individuels (12 chantier + 11/11 n°2) a été retrouvée dans le consolidé
  — aucun écart.
- **Pré-vol syntaxique réel** : le fichier a été passé au parseur PostgreSQL
  17 (`pglast`) — 143 instructions reconnues, aucune erreur ; les fonctions
  internes vivent dans des blocs `do $$`, comme prévu.
- **Dépendances sondées en production** (§ 2) : tout ce que le fichier
  référence en dehors de ses propres créations existe.
- **Nouvel outil** `scripts/verifier-etat-base.mjs` : sonde anonyme qui
  affiche la matrice complète présent/absent et un verdict — à relancer
  APRÈS application pour la preuve du contraire. Aucun secret requis
  (clé anon lue dans l'environnement).
- `scripts/appliquer-sql.ts` accepte maintenant `SUPABASE_DB_PASSWORD`
  depuis l'environnement en plus de `.env.local`.

## 4. Terminer l'application : deux chemins

**Chemin A — le plus court si vous me faites confiance avec la base :**
donnez-moi le **mot de passe de la base** (Supabase → Project Settings →
Database → Database password ; le réinitialiser est possible au même
endroit). Une seule commande que j'exécute moi-même, en une transaction
annulable en cas d'erreur :

    npx tsx scripts/appliquer-sql.ts docs/sql/migrations-chantier-consolidees.sql

puis la preuve par la sonde, et la re-vérification complète. La clé anon
seule ne me permet pas d'aller plus loin — ce n'est pas une question de
volonté, c'est une garde de sécurité de Supabase : la clé publique ne
peut pas modifier la structure.

**Chemin B — vous collez vous-même (2 minutes) :**
1. SQL Editor de Supabase (projet plume-ombres) ;
2. coller le contenu INTÉGRAL de `docs/sql/migrations-chantier-consolidees.sql`
   (version étendue d'aujourd'hui) → Run — idempotent, relancer est sans danger ;
3. relancer `node scripts/verifier-etat-base.mjs` : il doit répondre
   « Tout est appliqué » ;
4. dans Vercel, ajouter `SUPABASE_SERVICE_ROLE_KEY` (Production **et**
   Preview) pour que le réservoir de clés serve tous les abonnés ;
5. ouvrir `/admin` : onglet « Clés API » (coller les clés, Gemini d'abord),
   bloc « Revenus » actif, journal des webhooks se remplira à la première
   notification FedaPay.

## 5. Git

Branche `fonctionnalite/application-migrations` (un commit), fusionnée dans
`develop` local : fichier consolidé étendu, sonde `verifier-etat-base.mjs`,
correctif `appliquer-sql.ts`, présent compte rendu. Le push vers GitHub
reste impossible depuis cet environnement (aucun identifiant) : depuis
votre machine, `git push origin develop` après vérification — Vercel
déploiera `develop` immédiatement.

Rappel de la ligne de base en vigueur (inchangée, aucun code applicatif
modifié aujourd'hui) : tests 261/261, `check:flags` 17/33/32, build de
production OK.
