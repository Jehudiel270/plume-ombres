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
import { FournisseurGemini, cleGemini } from './gemini';
import { FournisseurGoogleLibre } from './google';
import type { IdFournisseur } from '@/lib/types';

/** Liste exhaustive des fournisseurs disponibles. */
export function tousLesFournisseurs(): FournisseurTraduction[] {
  return [
    new FournisseurLibreTranslate(),
    new FournisseurMyMemory(),
    new FournisseurGemini(),
    new FournisseurGoogleLibre(),
  ];
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
 * Fournisseur actif (choix par ordre de préférence) :
 * 1. TRANSLATOR_DEFAULT si définie (ex. 'libretranslate', 'gemini',
 *    'mymemory', 'google') ;
 * 2. sinon ou 'auto' : Gemini si une clé GEMINI_API_KEY est présente,
 *    puis Google libre (rapide, sans clé).
 * LibreTranslate reste joignable explicitement pour le mode 100 % local.
 */
export function fournisseurActif(): FournisseurTraduction {
  const explicite = process.env.TRANSLATOR_DEFAULT;
  if (explicite && explicite !== 'auto') {
    return fournisseurParId(explicite as IdFournisseur);
  }
  if (cleGemini()) return fournisseurParId('gemini');
  return fournisseurParId('google');
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
