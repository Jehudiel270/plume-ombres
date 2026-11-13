# Ouvrir l'aperçu develop — procédure complète (13/11/2026)

Symptôme constaté : la branche en ligne répondait « **Internal Server
Error** ». Diagnostic confirmé localement (reproduction : un serveur
démarré sans variables d'environnement répond exactement ce 500 opaque)
: **le déploiement d'aperçu n'a pas de variables Supabase**, donc le
proxy plante à chaque requête. Le correctif livré le 13/11 affiche
désormais une page 503 explicite au lieu de ce 500.

Suivre les étapes dans l'ordre. Aucune n'est dangereuse pour la
production (`main` n'est pas touchée ; les migrations sont additives et
idempotentes).

## Étape 1 — Variables d'environnement : activer la portée « Preview »

1. Ouvrir Vercel → projet → **Settings** → **Environment Variables**.
2. Pour chaque variable (au minimum `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, et si possible `GEMINI_API_KEY`) :
   vérifier que la case **Preview** est cochée, pas seulement
   **Production**.
3. **Deployments** → dernier déploiement de `develop` → **Redeploy**.

Sans cette étape, tout le reste est invisible : l'aperçu répond 503 avec
la page de diagnostic (plus claire que l'ancien 500).

## Étape 2 — Migrations : exécuter le SQL consolidé dans Supabase

1. Ouvrir le tableau de bord Supabase du projet → **SQL Editor**.
2. Coller l'intégralité de
   `docs/sql/migrations-chantier-consolidees.sql` (dépôt develop) et
   exécuter. Relancer le script est SANS DANGER (tout est additif et
   idempotent).
3. Tables créées : `fonctionnalites_etats`, `carnet_notes`, `theories`,
   `graphe_personnages`, `graphe_relations`, `resume_lectures`,
   `progression_*`, `ambiance_livres`, `univers_*`,
   `parametres_systeme`.

Sans les tables, les pages du chantier s'affichent quand même (lecture
dégradée prévue), mais carnet, théories, graphe, XP, ambiance et
univers ne fonctionnent pas réellement.

## Étape 3 — Ouvrir les interrupteurs dans le panneau admin

1. Sur l'APERÇU develop, se connecter avec le compte administrateur.
2. Aller sur `/admin/fonctionnalites`.
3. Ouvrir les modules à essayer (carnet, théories, graphe, progression,
   ambiance, univers ; `reprise` pour l'aide à la lecture). Un module
   fermé répond 404 par construction.
4. Choisir l'abonnement minimal voulu (le module `reprise` exige
   **Passionné** : pour l'essayer sur votre compte, attribuez-vous
   l'abonnement depuis l'admin ou attendez la variable d'environnement
   pour la mise en prod).

## Étape 4 — Clé du modèle d'aide à la lecture (module 8)

1. Toujours sur `/admin/fonctionnalites`, tout en bas : « Clé du modèle
   d'aide à la lecture ».
2. Coller la clé d'API Gemini (AI Studio, gratuite) → **Enregistrer la
   clé**. Aucun redéploiement nécessaire.
3. Tester sur VOTRE compte : ouvrir un livre, bouton « Reprise » du
   lecteur → résumé (F10) et questions (F6).
4. Pour ouvrir le module à tous les abonnés : définir
   `GEMINI_API_KEY` dans Vercel (Production **et** Preview) — la
   variable prime toujours sur la clé en base.

## Étape 5 — Vérification

- L'aperçu répond 200 sur `/` (landing) et `/tarifs`.
- `/bibliotheque` sans session redirige vers `/connexion` (307).
- Les modules ouverts s'affichent ; un module fermé répond 404.
- Le résumé « Reprise » répond avec une clé valide.

## Rappels de sécurité (en attente, reportés des sessions précédentes)

- Régénérer le jeton GitHub communiqué dans la conversation.
- Rotation du secret du webhook FedaPay.
