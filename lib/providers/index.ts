// ============================================================
// providers/index.ts — Usine à fournisseurs.
//
// Le fournisseur actif est choisi par la variable d'environnement
// TRANSLATOR_DEFAULT ('libretranslate' | 'mymemory').
// Cette logique ne s'exécute que côté serveur (routes API) :
// aucune clé ni URL interne n'est exposée au navigateur.
//
// Une CHAÎNE DE SECOURS automatique est également disponible :
// voir traduireAvecSecours() / ordreSecours() (providers/fallback).
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { cleGemini } from './gemini';
import type { IdFournisseur } from '@/lib/types';

// Ré-export de l'API de la chaîne de secours (index → fallback, sans cycle).
export {
  tousLesFournisseurs,
  fournisseurParId,
  nomFournisseurParId,
  ordreSecours,
  delaiSecoursMs,
  classerEchec,
  moteurUtilise,
  idMoteurUtilise,
  traduireAvecSecours,
  ErreurChaineSecours,
  ORDRE_SECOURS_DEFAUT,
  VAR_ORDRE,
  VAR_DELAI,
  VAR_JOURNAL,
  type CategorieEchec,
  type ResultatTraductionSecours,
} from './fallback';

import { fournisseurParId } from './fallback';

/**
 * Fournisseur actif (choix par ordre de préférence) :
 * 1. TRANSLATOR_DEFAULT si définie (ex. 'libretranslate', 'gemini',
 *    'mymemory', 'google') ;
 * 2. sinon ou 'auto' : Gemini si une clé GEMINI_API_KEY est présente,
 *    puis Google libre (rapide, sans clé).
 * LibreTranslate reste joignable explicitement pour le mode 100 % local.
 *
 * Note : pour une bascule automatique entre moteurs, utiliser
 * traduireAvecSecours() (voir providers/fallback).
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
