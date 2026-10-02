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
import { appliquerGlossaire } from '@/lib/glossaire';
import type { IdFournisseur } from '@/lib/types';

export type { FournisseurTraduction, OptionsTraduction } from './types';
export { composerInstructionSysteme } from '@/lib/glossaire';

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
 *
 * P1.1 — signature INCHANGÉE. De façon additive :
 *  • `options.directives` est transmis tel quel au fournisseur, qui
 *    l'injecte dans son prompt s'il en accepte un (Gemini) ;
 *  • `options.glossaire` est IMPOSÉ après coup sur la traduction
 *    renvoyée (les moteurs sans prompt ne lisent pas de directives).
 */
export async function traduireAvec(
  fournisseur: FournisseurTraduction,
  texte: string,
  options: OptionsTraduction
): Promise<string> {
  const brut = await fournisseur.traduire(texte, options);
  if (!options.glossaire || options.glossaire.length === 0) return brut;
  return appliquerGlossaire(brut, options.glossaire).texte;
}
