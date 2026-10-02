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
//     INTERDITE, refusée pour TOUS les rôles, y compris admin).
// ============================================================

/** Rôles connus. Le rôle par défaut est `utilisateur`. */
export type Role = 'utilisateur' | 'admin';

/** Liste exhaustive des rôles (ordre d'affichage). */
export const ROLES: readonly Role[] = ['utilisateur', 'admin'];

/** Rôle attribué à tout compte sans rôle explicite. */
export const ROLE_PAR_DEFAUT: Role = 'utilisateur';

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
  | 'admin.abonnements.lire'
  | 'admin.abonnements.attribuer'
  | 'admin.abonnements.revoquer'
  // Contenu des livres APPARTENANT À UN AUTRE COMPTE : interdit à
  // tout le monde, admins compris. Explicite pour qu'un test le
  // vérifie, et pour qu'un futur « super-admin » ne l'hérite pas
  // silencieusement.
  | 'contenu.tiers.lire';

/** Toutes les permissions (ordre stable). */
export const PERMISSIONS: readonly Permission[] = [
  'espace.mes_livres',
  'admin.tableau_de_bord.voir',
  'admin.stats.voir',
  'admin.comptes.lister',
  'admin.abonnements.lire',
  'admin.abonnements.attribuer',
  'admin.abonnements.revoquer',
  'contenu.tiers.lire',
];

/**
 * Permissions INTERDITES à tout rôle, y compris admin. Une interdiction
 * l'emporte toujours sur une éventuelle autorisation.
 */
export const PERMISSIONS_INTERDITES: readonly Permission[] = ['contenu.tiers.lire'];

/**
 * Matrice rôles × permissions : liste EXPLICITE des permissions
 * accordées. Tout ce qui n'y figure pas est refusé.
 */
const PERMISSIONS_ACCORDEES: Record<Role, readonly Permission[]> = {
  utilisateur: ['espace.mes_livres'],
  admin: [
    'espace.mes_livres',
    'admin.tableau_de_bord.voir',
    'admin.stats.voir',
    'admin.comptes.lister',
    'admin.abonnements.lire',
    'admin.abonnements.attribuer',
    'admin.abonnements.revoquer',
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

/** Vrai si le rôle est administrateur. */
export function estAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
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
 *  * L'admin reçoit le lien vers son tableau de bord ;
 *  * l'utilisateur n'en reçoit aucun.
 * Ces liens s'AJOUTENT aux liens existants (cumul) : l'appelant ne
 * doit jamais s'en servir pour remplacer la navigation de base.
 */
export function liensNavigationSupplementaires(role: Role): LienNavigation[] {
  if (role === 'admin') {
    return [{ href: '/admin', libelle: 'Administration' }];
  }
  return [];
}
