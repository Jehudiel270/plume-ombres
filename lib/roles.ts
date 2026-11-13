// ============================================================
// lib/roles.ts — Rôles et permissions (source de vérité PARTAGÉE).
//
// Une permission vit à DEUX endroits :
//   1. le GARDE SERVEUR (lib/roles-garde.ts) — source de vérité ;
//   2. le CHEMIN D'INTERFACE (lien de navigation, bouton, page).
// Ce module porte la matrice, en PURE (aucune dépendance Next /
// Supabase) pour qu'elle soit exécutable par un test, et pour que la
// décision d'accès soit la MÊME des deux côtés.
//
// Règles de conception :
//   * listes de rôles EXPLICITES, jamais de hiérarchie implicite ;
//   * l'admin n'accède QU'À ce qui lui est nécessaire : aucun rôle
//     ne peut lire le contenu des livres d'autrui (permission
//     INTERDITE, refusée pour TOUS les rôles, y compris admin et
//     super_admin) ;
//   * TROIS rôles depuis la vague « super_admin » :
//       - `utilisateur`     : espace personnel ;
//       - `admin`           : tableau de bord d'exploitation
//                             (comptes, abonnements, paiements) ;
//       - `super_admin`     : tout ce que fait l'admin, PLUS la
//                             nomination et la révocation des rôles.
//     `super_admin` HÉRITE explicitement des permissions d'`admin`
//     (liste recopiée, pas de hiérarchie implicite) et n'hérite
//     JAMAIS d'une permission interdite.
// ============================================================

/** Rôles connus. Le rôle par défaut est `utilisateur`. */
export type Role = 'utilisateur' | 'admin' | 'super_admin';

/** Liste exhaustive des rôles (ordre d'affichage : du plus bas au plus haut). */
export const ROLES: readonly Role[] = ['utilisateur', 'admin', 'super_admin'];

/** Rôle attribué à tout compte sans rôle explicite. */
export const ROLE_PAR_DEFAUT: Role = 'utilisateur';

/** Libellés lisibles des rôles (interface et journaux). */
export const LIBELLES_ROLES: Record<Role, string> = {
  utilisateur: 'Utilisateur',
  admin: 'Administrateur',
  super_admin: 'Super-administrateur',
};

/**
 * Permissions de l'application. Une permission décrit un DROIT,
 * pas un niveau hiérarchique.
 */
export type Permission =
  // Espace personnel (tout compte authentifié, sur SES livres).
  | 'espace.mes_livres'
  // Tableau de bord administrateur.
  | 'admin.tableau_de_bord.voir'
  | 'admin.stats.voir'
  | 'admin.comptes.lister'
  // Suppression DÉFINITIVE d'un compte `utilisateur` (irréversible).
  // Supprimer un compte `admin` ou `super_admin` exige en plus la
  // permission forte `admin.roles.super_admin` : voir
  // permissionPourSupprimerCompte().
  | 'admin.comptes.supprimer'
  | 'admin.abonnements.lire'
  | 'admin.abonnements.attribuer'
  | 'admin.abonnements.revoquer'
  // Gestion des RÔLES (réservée au super-administrateur).
  //  * `admin.roles.attribuer`    : nommer / rétrograder un compte
  //    entre `utilisateur` et `admin` ;
  //  * `admin.roles.super_admin`  : nommer / rétrograder un
  //    `super_admin` (et toucher un compte qui l'est déjà).
  | 'admin.roles.attribuer'
  | 'admin.roles.super_admin'
  // Interrupteurs de fonctionnalités du chantier post-lancement :
  // ouvrir / fermer un module, choisir l'abonnement minimal et le
  // déploiement progressif (page /admin/fonctionnalites).
  | 'admin.fonctionnalites.gerer'
  // Contenu des livres APPARTENANT À UN AUTRE COMPTE : interdit à
  // tout le monde, admins et super-admins compris. Explicite pour
  // qu'un test le vérifie, et pour qu'un « super_admin » ne
  // l'hérite pas silencieusement.
  | 'contenu.tiers.lire';

/** Toutes les permissions (ordre stable). */
export const PERMISSIONS: readonly Permission[] = [
  'espace.mes_livres',
  'admin.tableau_de_bord.voir',
  'admin.stats.voir',
  'admin.comptes.lister',
  'admin.comptes.supprimer',
  'admin.abonnements.lire',
  'admin.abonnements.attribuer',
  'admin.abonnements.revoquer',
  'admin.roles.attribuer',
  'admin.roles.super_admin',
  'admin.fonctionnalites.gerer',
  'contenu.tiers.lire',
];

/**
 * Permissions INTERDITES à tout rôle, y compris admin et super_admin.
 * Une interdiction l'emporte toujours sur une éventuelle autorisation.
 */
export const PERMISSIONS_INTERDITES: readonly Permission[] = ['contenu.tiers.lire'];

/** Permissions d'exploitation : celles d'`admin`, recopiées (pas de hiérarchie implicite). */
const PERMISSIONS_ADMIN: readonly Permission[] = [
  'espace.mes_livres',
  'admin.tableau_de_bord.voir',
  'admin.stats.voir',
  'admin.comptes.lister',
  'admin.comptes.supprimer',
  'admin.abonnements.lire',
  'admin.abonnements.attribuer',
  'admin.abonnements.revoquer',
  'admin.fonctionnalites.gerer',
];

/**
 * Matrice rôles × permissions : liste EXPLICITE des permissions
 * accordées. Tout ce qui n'y figure pas est refusé.
 */
const PERMISSIONS_ACCORDEES: Record<Role, readonly Permission[]> = {
  utilisateur: ['espace.mes_livres'],
  admin: PERMISSIONS_ADMIN,
  super_admin: [
    ...PERMISSIONS_ADMIN,
    'admin.roles.attribuer',
    'admin.roles.super_admin',
  ],
};

/** Vrai si `valeur` est un rôle connu. */
export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}

/** Ramène une valeur quelconque à un rôle connu (défaut : utilisateur). */
export function normaliserRole(valeur: unknown): Role {
  return estRole(valeur) ? valeur : ROLE_PAR_DEFAUT;
}

/** Permissions accordées à un rôle (jamais les interdites). */
export function permissionsDe(role: Role): readonly Permission[] {
  return PERMISSIONS_ACCORDEES[role] ?? [];
}

/**
 * Vrai si le rôle est administrateur — `admin` OU `super_admin`.
 * C'est la porte d'entrée du tableau de bord : un super-admin est un
 * admin qui a, en plus, la gestion des rôles.
 */
export function estAdmin(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Vrai si le rôle est super-administrateur (gestion des rôles). */
export function estSuperAdmin(role: Role | null | undefined): boolean {
  return role === 'super_admin';
}

/** Vrai si le rôle peut nommer ou révoquer d'autres rôles. */
export function peutGererLesRoles(role: Role | null | undefined): boolean {
  return estSuperAdmin(role);
}

/**
 * Permission EXIGÉE pour changer un rôle, selon le rôle ACTUEL de la
 * cible et le rôle VISÉ. Source unique, partagée par la route serveur,
 * l'interface et le test :
 *   * la cible est déjà super-admin, ou le devient → la permission
 *     forte `admin.roles.super_admin` ;
 *   * sinon → `admin.roles.attribuer`.
 * Un simple `admin` ne possède NI l'une NI l'autre : il ne peut donc
 * jamais modifier un rôle, y compris le sien.
 */
export function permissionPourChangerRole(roleActuel: Role, roleVise: Role): Permission {
  return roleActuel === 'super_admin' || roleVise === 'super_admin'
    ? 'admin.roles.super_admin'
    : 'admin.roles.attribuer';
}

/**
 * Permission EXIGÉE pour SUPPRIMER un compte, selon le rôle de la cible :
 *   * cible administrateur (`admin` / `super_admin`) → la permission
 *     forte `admin.roles.super_admin` (un simple admin ne décapite pas
 *     la hiérarchie dont il dépend) ;
 *   * cible `utilisateur` → `admin.comptes.supprimer`.
 * Même logique que permissionPourChangerRole : une seule source, lue
 * par la route serveur, l'interface et le test.
 */
export function permissionPourSupprimerCompte(roleCible: Role): Permission {
  return roleCible === 'admin' || roleCible === 'super_admin'
    ? 'admin.roles.super_admin'
    : 'admin.comptes.supprimer';
}

/**
 * Vrai si `role` possède `permission`. Une permission INTERDITE est
 * refusée à tout le monde, même si elle figurait par erreur dans une
 * liste accordée.
 */
export function aLaPermission(role: Role, permission: Permission): boolean {
  if (PERMISSIONS_INTERDITES.includes(permission)) return false;
  return permissionsDe(role).includes(permission);
}

/** Statut HTTP d'une tentative d'accès (200 / 401 / 403). */
export type StatutAcces = 200 | 401 | 403;

/**
 * Décision d'accès PURE, utilisée par le garde serveur ET par le test :
 *   * non connecté (role null) → 401 ;
 *   * connecté sans la permission → 403 ;
 *   * permission accordée → 200.
 */
export function deciderAcces(role: Role | null, permission: Permission): StatutAcces {
  if (role === null) return 401;
  return aLaPermission(role, permission) ? 200 : 403;
}

/** Lien de navigation supplémentaire selon le rôle. */
export interface LienNavigation {
  href: string;
  libelle: string;
}

/**
 * Liens de navigation SUPPLÉMENTAIRES apportés par un rôle.
 *  * L'admin ET le super-admin reçoivent le lien vers le tableau de
 *    bord ; le panneau « Rôles » n'apparaît qu'au super-admin, à
 *    l'intérieur de ce tableau de bord ;
 *  * l'utilisateur n'en reçoit aucun.
 * Ces liens s'AJOUTENT aux liens existants (cumul) : l'appelant ne
 * doit jamais s'en servir pour remplacer la navigation de base.
 */
export function liensNavigationSupplementaires(role: Role): LienNavigation[] {
  if (estAdmin(role)) {
    return [{ href: '/admin', libelle: 'Administration' }];
  }
  return [];
}
