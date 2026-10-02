# Matrice rôles × permissions — Plume d'Ombres

> Source de vérité du code : `lib/roles.ts` (matrice pure) appliquée par le garde serveur
> `lib/roles-garde.ts`. Test exécutable : `npx tsx scripts/test-roles-admin.ts`.
> Une permission vit à DEUX endroits : garde serveur **et** chemin d'interface.

## Rôles

| Rôle | Porté par | Défaut |
|---|---|---|
| `utilisateur` | `profiles.role` | oui |
| `admin` | `profiles.role` (ou liste blanche `administrateurs` si la branche paiement est fusionnée) | non |

`public.est_admin()` (SECURITY DEFINER) est la seule lecture du rôle côté base. Un compte
non admin ne peut pas s'octroyer `role = 'admin'` : le déclencheur `proteger_role_profiles`
refuse toute modification de rôle non autorisée, malgré la politique `profiles_update_own`.

## Permissions

| Permission | utilisateur | admin | Où c'est appliqué |
|---|:---:|:---:|---|
| `espace.mes_livres` | ✓ | ✓ | RLS `*_own` (livres/chapitres/segments de SON compte) |
| `admin.tableau_de_bord.voir` | ✗ | ✓ | `app/admin/page.tsx` (garde + routes `/admin`) |
| `admin.stats.voir` | ✗ | ✓ | `public.stats_admin()` (RPC, contrôle interne) |
| `admin.comptes.lister` | ✗ | ✓ | `public.admin_lister_comptes()` (RPC) |
| `admin.abonnements.lire` | ✗ | ✓ | colonne « Abonnement » de `TableauComptes` |
| `admin.abonnements.attribuer` | ✗ | ✓ | `POST /api/admin/abonnement` |
| `admin.abonnements.revoquer` | ✗ | ✓ | `DELETE /api/admin/abonnement` |
| `contenu.tiers.lire` | ✗ | ✗ | **INTERDIT à tout rôle** — aucune politique admin sur `livres`/`chapitres`/`segments` |

`contenu.tiers.lire` est une permission **interdite** : la matrice la refuse pour tous les
rôles, y compris `admin`, et le test l'exécute. Les statistiques passent par des fonctions
**agrégées** qui ne renvoient que des nombres (`stats_admin`, `admin_lister_comptes`).

## Matrice garde × route

| Route / entrée | Permission vérifiée | anonyme | utilisateur | admin |
|---|---|:---:|:---:|:---:|
| `/admin` (page) | `admin.tableau_de_bord.voir` | 401 → `/connexion` | 403 → `/bibliotheque` | 200 |
| `POST /api/admin/abonnement` | `admin.abonnements.attribuer` | 401 | 403 | 200 |
| `DELETE /api/admin/abonnement` | `admin.abonnements.revoquer` | 401 | 403 | 200 |
| `public.stats_admin()` | `est_admin()` interne | 42501 | 42501 | données |
| `public.admin_lister_comptes()` | `est_admin()` interne | 42501 | 42501 | données |

## Chemin d'interface

`components/BarreNavigation.tsx` ajoute le lien **Administration** → `/admin`
*uniquement* quand le rôle est `admin`, **en CUMUL** des liens existants
(`liensNavigationSupplementaires(role)` est concaténé, jamais substitué). Les raccourcis
d'espace existants (Mes favoris, Mon compte) restent intacts.

## Durées d'abonnement accordées par l'admin

`lib/admin-abonnements.ts` accepte `vie`, `1_mois`, `3_mois`, `12_mois` ou une date ISO, et
convertit en **jours** pour la RPC `public.attribuer_abonnement(p_user_id uuid, p_duree integer, p_motif text)`
de la branche `w4/paiement` (`vie` = 36500 jours). Révocation :
`public.revoquer_abonnement(p_user_id uuid, p_motif text)`.
Chaque action est journalisée dans `public.admin_actions` (admin, cible, action, durée, quand).
