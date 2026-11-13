// ============================================================
// lib/parametres.ts — PARAMÈTRES SYSTÈME (côté serveur).
//
// Les paramètres sensibles (clés d'API) vivent dans la table
// `parametres_systeme` (migration 20261113000001) et sont collés par
// l'administrateur dans son panneau (/admin/fonctionnalites).
//
// SÉCURITÉ :
//   * la table n'est lisible que par un administrateur (RLS) — la
//     valeur n'atteint donc JAMAIS le navigateur d'un lecteur ;
//   * `resoudreCleGemini` préfère TOUJOURS la variable
//     d'environnement GEMINI_API_KEY si elle existe (voie officielle
//     pour ouvrir les modules à tous les abonnés), puis retombe sur
//     la clé enregistrée en base (voie d'essai administrateur) ;
//   * la valeur n'est jamais renvoyée en clair à une interface :
//     `masquerCle` n'expose que les 4 premiers et 4 derniers
//     caractères.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Nom du paramètre qui porte la clé du modèle (AI Studio). */
export const CLE_PARAMETRE_GEMINI = 'cle_api_gemini';

/** Bornes de validation d'une clé collée dans le panneau admin. */
export const LONGUEUR_CLE_MIN = 20;
export const LONGUEUR_CLE_MAX = 500;

/**
 * Version affichable d'une clé : `AIza…x9Qz`. Trop courte ou vide →
 * '••••' (on n'affiche jamais ce qui pourrait servir d'indice).
 */
export function masquerCle(cle: string | null | undefined): string | null {
  const propre = (cle ?? '').trim();
  if (propre.length <= 8) return null;
  return `${propre.slice(0, 4)}…${propre.slice(-4)}`;
}

export interface ParametreMeta {
  valeur: string;
  majLe: string | null;
  majPar: string | null;
}

/**
 * Lit un paramètre ET ses métadonnées (appelé côté serveur, session
 * administrateur pour l'écriture ; lecteur simple → null par RLS).
 * Une table absente (migrations non appliquées) ou un accès refusé
 * retournent null : aucun crash, le module répond « non configuré ».
 */
export async function lireParametreMeta(
  client: SupabaseClient,
  cle: string
): Promise<ParametreMeta | null> {
  const { data, error } = await client
    .from('parametres_systeme')
    .select('valeur, maj_le, maj_par')
    .eq('cle', cle)
    .maybeSingle();
  if (error) return null;
  const ligne = data as { valeur?: unknown; maj_le?: unknown; maj_par?: unknown } | null;
  const valeur = typeof ligne?.valeur === 'string' ? ligne.valeur.trim() : '';
  if (!valeur) return null;
  return {
    valeur,
    majLe: typeof ligne?.maj_le === 'string' ? ligne.maj_le : null,
    majPar: typeof ligne?.maj_par === 'string' ? ligne.maj_par : null,
  };
}

/** Lit la seule valeur d'un paramètre (null si absent). */
export async function lireParametreServeur(
  client: SupabaseClient,
  cle: string
): Promise<string | null> {
  return (await lireParametreMeta(client, cle))?.valeur ?? null;
}

/**
 * Clé Gemini EFFECTIVE du serveur :
 *   1. variable d'environnement GEMINI_API_KEY (production) ;
 *   2. paramètre enregistré par l'administrateur (essai, sans
 *      redéploiement) — ne fonctionne que si la session courante est
 *      administrateur (RLS), c'est-à-dire dans une route appelée par
 *      l'admin lui-même ;
 *   3. '' → le module répond « non configuré ».
 */
export async function resoudreCleGemini(
  client?: SupabaseClient
): Promise<string> {
  const env = process.env.GEMINI_API_KEY?.trim();
  if (env) return env;
  if (client) {
    return (await lireParametreServeur(client, CLE_PARAMETRE_GEMINI)) ?? '';
  }
  return '';
}

/** Valide une clé collée dans le panneau : renvoie l'erreur ou null. */
export function validerCleCollee(valeur: unknown): string | null {
  if (typeof valeur !== 'string') {
    return 'La clé doit être un texte.';
  }
  const propre = valeur.trim();
  if (propre.length < LONGUEUR_CLE_MIN) {
    return `La clé est trop courte (au moins ${LONGUEUR_CLE_MIN} caractères).`;
  }
  if (propre.length > LONGUEUR_CLE_MAX) {
    return `La clé est trop longue (au plus ${LONGUEUR_CLE_MAX} caractères).`;
  }
  if (/\s/.test(propre)) {
    return 'Une clé d’API ne contient pas d’espacement : copiez-la sans retour à la ligne.';
  }
  return null;
}
