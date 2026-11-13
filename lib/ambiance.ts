// ============================================================
// lib/ambiance.ts — Fiches d'ambiance (F5) : règles pures.
//
// L'ambiance complète les avertissements de contenu existants
// (socle) : genres, tropes, intensité 1 → 5. Listes posées par le
// propriétaire du livre, plafonnées ici (pures, testées).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_GENRES = 5;
export const MAX_TROPES = 8;
export const MAX_MOT = 40;

export const INTENSITES = [1, 2, 3, 4, 5] as const;
export type Intensite = (typeof INTENSITES)[number];

export function estIntensite(valeur: unknown): valeur is Intensite {
  return (
    typeof valeur === 'number' &&
    Number.isInteger(valeur) &&
    (INTENSITES as readonly number[]).includes(valeur)
  );
}

export function libelleIntensite(intensite: Intensite): string {
  switch (intensite) {
    case 1:
      return 'Discret';
    case 2:
      return 'Voilé';
    case 3:
      return 'Affirmé';
    case 4:
      return 'Sombre';
    default:
      return 'Très sombre';
  }
}

/** Analyse une ligne « gothique, ennemis à amants » : plafonnée, propre. */
export function analyserListe(ligne: string, maximum: number): string[] {
  return ligne
    .split(',')
    .map((t) => t.trim().slice(0, MAX_MOT))
    .filter(Boolean)
    .slice(0, maximum);
}

export interface FicheAmbiance {
  livre_id: string;
  genres: string[];
  tropes: string[];
  intensite: Intensite;
}

/** Charge (ou initialise) les fiches des livres du compte. */
export async function chargerAmbiances(
  client: SupabaseClient
): Promise<Map<string, FicheAmbiance>> {
  const { data, error } = await client
    .from('ambiance_livres')
    .select('livre_id, genres, tropes, intensite')
    .limit(200);
  if (error) throw new Error(error.message);
  const fiches = new Map<string, FicheAmbiance>();
  for (const ligne of (data ?? []) as Array<{
    livre_id: string;
    genres: string[] | null;
    tropes: string[] | null;
    intensite: number;
  }>) {
    fiches.set(ligne.livre_id, {
      livre_id: ligne.livre_id,
      genres: ligne.genres ?? [],
      tropes: ligne.tropes ?? [],
      intensite: estIntensite(ligne.intensite) ? ligne.intensite : 3,
    });
  }
  return fiches;
}

/** Crée ou met à jour la fiche d'un livre (upsert, RLS « own »). */
export async function enregistrerAmbiance(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    genres: string[];
    tropes: string[];
    intensite: Intensite;
  }
): Promise<void> {
  const { error } = await client
    .from('ambiance_livres')
    .upsert({
      livre_id: donnees.livreId,
      genres: donnees.genres,
      tropes: donnees.tropes,
      intensite: donnees.intensite,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
