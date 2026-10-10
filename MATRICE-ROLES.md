# Matrice rôles × permissions — Plume d'Ombres

> Source de vérité du code : `lib/roles.ts` (matrice pure) appliquée par le garde serveur
> `lib/roles-garde.ts`. Test exécutable : `npx tsx scripts/test-roles-admin.ts` (parties A→G).
> Sonde navigateur : `node scripts/probe-super-admin.mjs`.
> Une permission vit à DEUX endroits : garde serveur **et** chemin d'interface.

## Rôles

| Rôle | Porté par | Défaut | Peut quoi |
|---|---|---|---|
| `utilisateur` | `profiles.role` | oui | son espace personnel |
| `admin` | `profiles.role` | non | tout `utilisateur` + le tableau de bord d'exploitation (comptes, abonnements, paiements) |
| `super_admin` | `profiles.role` | non | tout `admin` + **nommer et rétrograder les rôles** |

`super_admin` **hérite explicitement** des permissions d'`admin` : la liste est recopiée dans
`lib/roles.ts` (constante `PERMISSIONS_ADMIN`, dépliée dans `PERMISSIONS_ACCORDEES`). Aucune
hiérarchie implicite, aucun héritage silencieux — un test le vérifie.

`public.est_admin()` (SECURITY DEFINER) est la seule lecture du rôle d'exploitation côté base, et
vaut vrai pour `admin` **et** `super_admin`. `public.est_super_admin()` est la seule lecture du rang
suprême. Deux déclencheurs protègent l'écriture :

- `proteger_role_profiles` — **seul un super-administrateur** peut modifier un rôle ; un `admin`
  simple ne peut pas s'octroyer quoi que ce soit, malgré la politique `profiles_update_own` ; et un
  super-administrateur **ne peut pas modifier son propre rôle** (garantit qu'il subsiste toujours au
  moins un super-administrateur en base) ;
- `miroir_role_admin` — recopie les admins et super-admins dans la liste blanche
  `public.administrateurs` de la branche paiement, si elle existe.

## Permissions

| Permission | utilisateur | admin | super_admin | Où c'est appliqué |
|---|:---:|:---:|:---:|---|
| `espace.mes_livres` | ✓ | ✓ | ✓ | RLS `*_own` (livres/chapitres/segments de SON compte) |
| `admin.tableau_de_bord.voir` | ✗ | ✓ | ✓ | `app/admin/page.tsx`, `GET/PUT /api/admin/chaine`, `/api/admin/export`, `/api/translate/sante` |
| `admin.stats.voir` | ✗ | ✓ | ✓ | `public.stats_admin()` (RPC, contrôle interne) |
| `admin.comptes.lister` | ✗ | ✓ | ✓ | `public.admin_lister_comptes()` (RPC) |
| `admin.abonnements.lire` | ✗ | ✓ | ✓ | colonne « Abonnement » de `TableauComptes` |
| `admin.abonnements.attribuer` | ✗ | ✓ | ✓ | `POST /api/admin/abonnement` |
| `admin.abonnements.revoquer` | ✗ | ✓ | ✓ | `DELETE /api/admin/abonnement` |
| `admin.roles.attribuer` | ✗ | ✗ | ✓ | `POST /api/admin/roles` (nommer/rétrograder un compte entre `utilisateur` et `admin`) |
| `admin.roles.super_admin` | ✗ | ✗ | ✓ | `POST /api/admin/roles` **et** la RPC `admin_changer_role` — exigée dès que la cible **est** ou **devient** `super_admin` |
| `contenu.tiers.lire` | ✗ | ✗ | ✗ | **INTERDIT à tout rôle, super_admin compris** — aucune politique admin sur `livres`/`chapitres`/`segments` |

`contenu.tiers.lire` est une permission **interdite** : la matrice la refuse pour les trois rôles et
le test l'exécute. Les statistiques passent par des fonctions **agrégées** qui ne renvoient que des
nombres (`stats_admin`, `admin_lister_comptes`, `admin_courriels_comptes`,
`admin_stats_abonnements`, `admin_lister_paiements`).

## Matrice garde × route

| Route / entrée | Permission vérifiée | anonyme | utilisateur | admin | super_admin |
|---|---|:---:|:---:|:---:|:---:|
| `/admin` (page) | `admin.tableau_de_bord.voir` | 401 → `/connexion` | 403 → `/bibliotheque` | 200 | 200 |
| `POST /api/admin/abonnement` | `admin.abonnements.attribuer` | 401 | 403 | 200 | 200 |
| `DELETE /api/admin/abonnement` | `admin.abonnements.revoquer` | 401 | 403 | 200 | 200 |
| `GET/PUT /api/admin/chaine` | `admin.tableau_de_bord.voir` | 401 | 403 | 200 | 200 |
| `POST /api/admin/roles` | `admin.roles.attribuer` (+ `admin.roles.super_admin` si la cible est/devient super-admin) | 401 | 403 | **403** | 200 |
| `public.stats_admin()` | `est_admin()` interne | 42501 | 42501 | données | données |
| `public.admin_lister_comptes()` | `est_admin()` interne | 42501 | 42501 | données | données |
| `public.admin_changer_role(...)` | `est_super_admin()` interne | **42501** (pas de droit d'exécution) | 42501 | 42501 | applique + journalise |

La permission exigée pour changer un rôle est calculée par **une seule** fonction,
`permissionPourChangerRole(roleActuel, roleVise)` : dès que la cible est ou devient `super_admin`,
c'est la permission forte qui est exigée.

## Chemin d'interface

`components/BarreNavigation.tsx` ajoute le lien **Administration** → `/admin` *uniquement* quand le
rôle est `admin` ou `super_admin`, **en CUMUL** des liens existants
(`liensNavigationSupplementaires(role)` est concaténé, jamais substitué). Les raccourcis d'espace
existants (Mes favoris, Mon compte) restent intacts.

Dans `/admin` :

- **5 onglets** pour un `admin` : Vue d'ensemble, Comptes, Abonnements, Paiements, Système ;
- **6 onglets** pour un `super_admin` : les mêmes **plus « Rôles »**, inséré avant « Système ».
  L'onglet est monté conditionnellement (`components/admin/GestionRoles.tsx`), les index des cinq
  onglets d'origine sont inchangés pour un administrateur simple — une sonde le vérifie ;
- l'onglet **Système** contient aussi `OrdreChaine` (réordonner les moteurs de traduction,
  persisté en base via `public.definir_ordre_chaine`, sans redéploiement).

## Gestion des rôles (données)

| Compte | Rôle | Motif |
|---|---|---|
| `dossoucarrel@gmail.com` (pseudo « Miaou ») | `super_admin` | le propriétaire : il nomme et révoque les administrateurs |
| `harcker137@gmail.com` (pseudo « Lecteur_omniscient ») | `admin` | accès au tableau de bord d'exploitation, sans gestion des rôles |
| `sante-admin@plume-ombres.local`, `moteur-admin@plume-ombres.local` | `admin` | comptes techniques de supervision |

Migrations : `20261010000001_super_admin.sql` (structure) puis
`20261010000002_attribution_roles.sql` (données, idempotente, retrouve les comptes **par courriel**).
Application : `npx tsx scripts/appliquer-sql.ts supabase/migrations/<fichier>.sql`.

## Durées d'abonnement accordées par l'admin

`lib/admin-abonnements.ts` accepte `vie`, `1_mois`, `3_mois`, `12_mois` ou une date ISO, et
convertit en **jours** pour la RPC `public.attribuer_abonnement(p_user_id uuid, p_duree integer, p_motif text)`
de la branche `w4/paiement` (`vie` = 36500 jours). Révocation :
`public.revoquer_abonnement(p_user_id uuid, p_motif text)`.
Chaque action est journalisée dans `public.admin_actions` (admin, cible, action, durée, quand) —
colonnes `action` ∈ `attribuer | revoquer | nommer_role | retrograder_role` et `role_cible` pour les
deux dernières.
