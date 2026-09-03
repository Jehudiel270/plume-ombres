// ============================================================
// providers/index.ts — Usine à fournisseurs.
//
// Le fournisseur actif est choisi par la variable d'environnement
// TRANSLATOR_DEFAULT ('libretranslate' | 'mymemory').
// Cette logique ne s'exécute que côté serveur (routes API) :
// aucune clé ni URL interne n'est exposée au navigateur.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { FournisseurLibreTranslate } from './libretranslate';
import { FournisseurMyMemory } from './mymemory';
import type { IdFournisseur } from '@/lib/types';

/** Liste exhaustive des fournisseurs disponibles. */
export function tousLesFournisseurs(): FournisseurTraduction[] {
  return [new FournisseurLibreTranslate(), new FournisseurMyMemory()];
}

/** Fournisseur demandé par son identifiant. */
export function fournisseurParId(id: string): FournisseurTraduction {
  const fournisseur = tousLesFournisseurs().find((f) => f.id === id);
  if (!fournisseur) {
    throw new Error(`Fournisseur de traduction inconnu : ${id}`);
  }
  return fournisseur;
}

/**
 * Fournisseur actif : celui de TRANSLATOR_DEFAULT, ou LibreTranslate
 * par défaut si la variable n'est pas définie.
 */
export function fournisseurActif(): FournisseurTraduction {
  const id = process.env.TRANSLATOR_DEFAULT ?? 'libretranslate';
  return fournisseurParId(id as IdFournisseur);
}

/**
 * Traduit un texte en le découpant au besoin (le fournisseur choisi
 * est déjà sélectionné côté serveur par la route API).
 */
export async function traduireAvec(
  fournisseur: FournisseurTraduction,
  texte: string,
  options: OptionsTraduction
): Promise<string> {
  return fournisseur.traduire(texte, options);
}
