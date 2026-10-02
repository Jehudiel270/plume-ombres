// ============================================================
// relance-traduction.ts — Reprise des chapitres dont la traduction
// a échoué (P1.3). Un chapitre peut être marqué « erreur » par le
// moteur (segments abandonnés) : on les relit en base pour les
// relancer dans la file de traduction.
//
// Purement fonctionnel (aucun rendu) : réutilisé par la bibliothèque
// ET par l'espace de lecture, et testé dans
// scripts/test-export-livre-epub.ts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chapitre } from './types';

/**
 * Charge les chapitres d'un livre dont le statut est « erreur »,
 * dans l'ordre de lecture. Renvoie un tableau vide s'il n'y en a
 * aucun (jamais d'erreur : un livre sain n'a rien à reprendre).
 */
export async function chargerChapitresEnErreur(
  supabase: SupabaseClient,
  livreId: string
): Promise<Chapitre[]> {
  const { data, error } = await supabase
    .from('chapitres')
    .select('*')
    .eq('livre_id', livreId)
    .eq('statut', 'erreur')
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Chapitres à reprendre illisibles : ${error.message}`);
  }
  return (data ?? []) as Chapitre[];
}
