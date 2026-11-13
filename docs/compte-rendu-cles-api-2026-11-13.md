# Compte rendu du 13 novembre 2026 — Clés d'API, fonctionnalités, clubs

## 1. Onglet « Clés API » — réservoir avec succession

### Ce qui a été construit

Nouvel onglet **« Clés API »** dans le tableau de bord (`/admin?onglet=cles`),
juste après « Système » :

- **Plusieurs fournisseurs** : Gemini (Google AI Studio), DeepSeek, OpenAI,
  OpenRouter, Mistral AI, et un fourre-tout « Autre » ;
- **Plusieurs clés par fournisseur** : par exemple 3 clés Gemini en parallèle ;
- **Succession** : dans chaque fournisseur, les clés sont alignées de haut en
  bas et essayées DANS CET ORDRE. Si une clé lâche (quota 429, accès refusé,
  clé invalide), la suivante prend le relais automatiquement ; après
  **3 échecs de suite**, une clé prend un **temps de repos d'une minute** puis
  réintègre la rotation. Une réussite remet son compteur à zéro ;
- **Affectation par abonnement** : chaque clé peut être réservée à un niveau
  (« Lecteur et plus », « Passionné et plus », « Illimité ») ou servir tout le
  monde. Une clé « Illimité » ne sert jamais un compte gratuit ;
- **Ajout simple** : un formulaire unique (fournisseur, libellé, abonnement
  servi, clé masquée à la saisie avec bouton Afficher) ;
- **Actions alignées** : monter/descendre dans la succession, désactiver sans
  supprimer, retirer avec confirmation ; aperçu masqué (`AIza…x9Qz`), badge
  d'état (Active / En repos N s / Active — 2 échecs) et dernière erreur tronquée ;
- **Voyant « Clés IA »** ajouté au bandeau de santé en tête du tableau de bord :
  vert si au moins une clé (variable d'environnement ou réservoir) est
  disponible, « À surveiller » sinon, avec raccourci vers l'onglet.

Consommateurs réellement branchés sur la succession aujourd'hui :

- l'**aide à la lecture** (résumé F10, questions F6) — boucle clés × modèles ;
- le **moteur de traduction Gemini** — succession de clés avant de passer au
  moteur suivant de la chaîne.

Les clés DeepSeek, OpenAI, OpenRouter et Mistral sont **stockées et prêtes** :
elles seront consommées par les futurs moteurs, sans nouvelle migration.

### Sécurité (inchangée dans l'esprit, étendue dans la portée)

- Table `cles_api` protégée par RLS : lecture et écriture réservées aux
  administrateurs (`public.est_admin()`) ; `anon` et `public` révoqués ;
- La valeur complète **ne quitte jamais le serveur** : les écrans ne reçoivent
  qu'un aperçu masqué, et le journal n'écrit jamais la valeur (seulement
  fournisseur, libellé, longueur, position) ;
- **Nouveau** : pour que les modules d'IA servent TOUS les abonnés depuis le
  réservoir, le serveur lit les clés via le rôle service — il suffit de définir
  la variable `SUPABASE_SERVICE_ROLE_KEY` chez l'hébergeur (Vercel, Production
  et Preview). Sans elle, comportement antérieur : seules les sessions
  administrateur peuvent s'en servir, et la variable `GEMINI_API_KEY` reste la
  voie officielle (elle est toujours essayée en premier) ;
- L'ancienne clé unique collée dans « Fonctionnalités »
  (`parametres_systeme`) reste lisible en filet : la migration la copie
  automatiquement en première position du réservoir.

## 2. Fonctionnalités : compactées façon FAQ, clés déménagées

- Le panneau des interrupteurs est désormais **une liste compacte** comme la
  FAQ publique : chaque module est une ligne dépliable
  (`<details>/<summary>` natifs — accessible sans JavaScript) ;
- Les informations essentielles restent visibles **sans déplier** : badges
  Ouvert/Fermé, abonnement minimal, pourcentage de déploiement ;
- En dépliant : description, pages/API, note juridique, bouton d'ouverture,
  case juriste, abonnement minimal, curseur de déploiement avec aperçu ;
- **La clé du modèle d'IA n'est plus dans l'onglet/page « Fonctionnalités »** :
  elle a déménagé dans l'onglet « Clés API » (un renvoi visible est posé sur la
  page dédiée `/admin/fonctionnalites`) ;
- La page dédiée et l'onglet partagent désormais le MÊME mapper
  (`lib/fonctionnalites/interrupteurs-admin.ts`) : une seule mise en forme,
  deux chemins d'accès.

## 3. Tableau de bord : autres améliorations posées

- **Liens profonds** : l'onglet ouvert est reflété dans l'URL
  (`/admin?onglet=cles`, `/admin?onglet=paiements`…) et l'URL est lue au
  chargement — on peut mettre un onglet en favori ou l'ouvrir depuis un lien
  (le bandeau de santé et la palette Ctrl+K en profitent) ;
- Onglet **« Fonctionnalités »** intégré au tableau de bord (après « Clés
  API »), avec pastille du nombre de modules ouverts — même contenu que la
  page dédiée ;
- Vérifications : **tests 245/245** (6 nouveaux sur le réservoir de clés),
  `check:flags` **17 interrupteurs / 33 pages / 31 routes d'API**, **build de
  production OK** (67 routes).

### Idées relevées (recherche), non construites ce jour

Restent pertinents pour une prochaine vague : journal d'audit enrichi (échecs
d'autorisation déjà tracés ; ajouter l'impersonation avec motif obligatoire),
vue des webhooks/retentes de paiement (idempotence par événement), indicateurs
MRR/churn à partir des données d'abonnement existantes, révélation d'une clé
à la saisie uniquement (déjà le cas), health check « profond » séparé du
liveness. Les patterns de rotation retenus (cooldown par clé, priorité ordre
fixe, filtrage par niveau) suivent ce que font les passerelles de référence.

## 4. Clubs de lecture : état des lieux (réponse à votre question)

**Aujourd'hui, les clubs ne sont pas gérés du tout dans le site réel.** Ce qui
existe :

- un **interrupteur F11 « Clubs de lecture privés »** dans le registre, livré
  FERMÉ (décision de l'administrateur du 12/11/2026 : clubs PRIVÉS entre
  comptes inscrits, aucun texte de chapitre partagé, aucune page publique,
  modération et anti-spam exigées avant ouverture) ;
- une **maquette statique** (prototype UI hors production) qui montre le design
  prévu : clubs avec programme par étapes, sondages, membres à rôles
  (administrateur du club / modérateur / membre), rencontres, file de
  modération — mais toutes les données y sont codées en dur pour la
  démonstration.

**Non, ce n'est pas déjà bien géré** : il n'y a ni page `/clubs`, ni API
`/api/clubs`, ni table en base, ni modération, ni garde anti-spoiler. Le
drapeau existe, le contenu derrière lui non. Quand vous voudrez construire le
module, le chemin est balisé : tables `clubs` / `club_membres` (rôles) /
`club_messages` (garde chapitre ≤ chapitre du club, côté serveur) /
`club_sondages`, signalements et file de modération pour les administrateurs,
rate-limiting des messages, notifications dans la cloche, le tout derrière
l'interrupteur F11 avec la règle « aucun texte de chapitre ne quitte la base
d'un compte ». À ouvrir seulement après ces garde-fous, comme l'exige la note
juridique de décision du 12/11.

## 5. Migrations à appliquer (SQL Editor de Supabase)

**Rappel** : je n'ai pas d'accès direct à votre Supabase de production depuis
cet environnement — le fichier consolidé est prêt, il suffit de le coller :

1. Ouvrez le **SQL Editor** de Supabase (projet plume-ombres) ;
2. Collez le contenu INTÉGRAL de `docs/sql/migrations-chantier-consolidees.sql`
   et exécutez — le fichier est **idempotent** (relancer ne duplique rien) ;
3. Il crée/met à jour : `fonctionnalites_etats`, `carnet_notes`, `theories`,
   `graphe_narratif`, `resume_lectures`, `progression_xp`, `ambiance_livres`,
   `univers`, `parametres_systeme`, et **`cles_api` (nouveau)** — avec le
   portage automatique de l'ancienne clé Gemini si vous en aviez collé une ;
4. Dans Vercel, ajoutez si possible `SUPABASE_SERVICE_ROLE_KEY` (Production et
   Preview) pour que le réservoir serve tous les abonnés ;
5. Ouvrez `/admin` → onglet **« Clés API »** et collez vos clés (Gemini
   d'abord), puis ouvrez les interrupteurs dans « Fonctionnalités ».

## 6. Git

Branche `fonctionnalite/cles-api-admin` (2 commits, basée sur develop) :
- `0f72b77` — socle serveur (migration, lib, consommateurs, route API) ;
- `1d70e2b` — interface (onglet, panneau compact, voyant, liens profonds).

À noter : l'environnement de travail de ce jour a été réinitialisé entre-temps
(snapshot ancien restauré) ; le dépôt a été remis à niveau depuis GitHub
(`origin/develop`) et le travail reconstruit dessus. Deux éléments de la
session précédente, jamais poussés, restent perdus : le commit `ed6536c`
(onglet chantier — reconstruit et amélioré ici) et le brouillon
« lecture estimée / progression » (5 fichiers, non récupérables). Le push vers
GitHub n'a pas pu être fait depuis cet environnement (aucun identifiant
disponible) : depuis votre machine, `git push origin develop
fonctionnalite/cles-api-admin` après fusion, ou dites-le-moi pour que je
refasse la fusion localement.
