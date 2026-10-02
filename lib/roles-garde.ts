// ============================================================
// lib/roles-garde.ts — GARDE SERVEUR réutilisable.
//
// Point d'entrée UNIQUE pour vérifier une permission côté serveur.
// La décision est prise par la fonction PURE lib/roles.deciderAcces,
// la même qu'exécute le test « matrice garde × route » : il n'y a
// donc pas deux logiques à maintenir.
//
// Usage pages   : await exigerPermission('admin.stats.voir', '/admin')
// Usage routes  : const d = await verifierPermission(...); si
//                 d.statut !== 200 → répondre 401/403.
// ============================================================

import { redirect } from 'next/navigation';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';
import {
  deciderAcces,
  normaliserRole,
  type Permission,
  type Role,
  type StatutAcces,
} from '@/lib/roles';

/** Identité + rôle de l'appelant. `role` vaut null si non connecté. */
export interface ContexteRole {
  utilisateurId: string | null;
  role: Role | null;
}

/** Lit le rôle du compte connecté (via profiles.role, RLS « own »). */
export async function contexteRole(): Promise<ContexteRole> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) return { utilisateurId: null, role: null };

  const supabase = await creerClientServeur();
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', utilisateur.id)
    .maybeSingle();

  return {
    utilisateurId: utilisateur.id,
    role: normaliserRole((data as { role?: string } | null)?.role),
  };
}

/** Résultat complet d'une vérification de permission. */
export interface DecisionPermission extends ContexteRole {
  permission: Permission;
  statut: StatutAcces;
}

/** Vérifie une permission SANS rediriger (pages et routes). */
export async function verifierPermission(
  permission: Permission
): Promise<DecisionPermission> {
  const contexte = await contexteRole();
  return {
    ...contexte,
    permission,
    statut: deciderAcces(contexte.role, permission),
  };
}

/** Contexte d'un appelant autorisé. */
export interface ContexteAutorise {
  utilisateurId: string;
  role: Role;
}

/**
 * Garde des PAGES : redirige vers /connexion si non connecté, vers la
 * bibliothèque si connecté sans la permission. Retourne le contexte
 * autorisé sinon.
 */
export async function exigerPermission(
  permission: Permission,
  suivant: string
): Promise<ContexteAutorise> {
  const decision = await verifierPermission(permission);

  if (decision.statut === 401 || !decision.utilisateurId) {
    redirect(`/connexion?suivant=${encodeURIComponent(suivant)}`);
  }
  if (decision.statut === 403 || !decision.role) {
    redirect(`/bibliotheque?refus=${encodeURIComponent(permission)}`);
  }

  return { utilisateurId: decision.utilisateurId, role: decision.role };
}
