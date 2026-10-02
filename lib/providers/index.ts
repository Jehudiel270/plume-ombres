// ============================================================
// providers/index.ts — Usine à fournisseurs.
//
// Le fournisseur actif est choisi par la variable d'environnement
// TRANSLATOR_DEFAULT ('libretranslate' | 'gemini' | 'google' |
// 'mymemory'). Cette logique ne s'exécute que côté serveur (routes
// API) : aucune clé ni URL interne n'est exposée au navigateur.
//
// EN PRODUCTION, c'est la CHAÎNE DE SECOURS qui traduit (voir
// traduireAvecSecours) : LibreTranslate auto-hébergé → Gemini →
// Google non officiel → MyMemory. Le moteur Google non officiel
// n'est JAMAIS choisi par défaut, et le mode « privé strict »
// (TRANSLATOR_PRIVE_STRICT) réduit la chaîne à la file auto-hébergée.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { appliquerGlossaire } from '@/lib/glossaire';
import type { IdFournisseur } from '@/lib/types';

export type { FournisseurTraduction, OptionsTraduction } from './types';
export { composerInstructionSysteme } from '@/lib/glossaire';

// Ré-export de l'API de la chaîne de secours (index → fallback, sans cycle).
export {
  tousLesFournisseurs,
  fournisseurParId,
  nomFournisseurParId,
  fournisseurEstPrive,
  descriptionMoteur,
  ordreSecours,
  moteursAutorises,
  modePriveStrict,
  delaiSecoursMs,
  essaisSecours,
  classerEchec,
  moteurUtilise,
  idMoteurUtilise,
  dernierMoteurPrive,
  traduireAvecSecours,
  ErreurChaineSecours,
  ORDRE_SECOURS_DEFAUT,
  IDS_PRIVES,
  MAX_ESSAIS_PAR_MOTEUR,
  VAR_ORDRE,
  VAR_DELAI,
  VAR_JOURNAL,
  VAR_PRIVE_STRICT,
  VAR_ESSAIS,
  type CategorieEchec,
  type ResultatTraductionSecours,
} from './fallback';

import { fournisseurParId, modePriveStrict, ordreSecours } from './fallback';

/**
 * Fournisseur actif (choix par ordre de préférence) :
 * 1. MODE PRIVÉ STRICT : la file auto-hébergée, et rien d'autre ;
 * 2. TRANSLATOR_DEFAULT si définie et non 'auto' ;
 * 3. sinon : le PREMIER moteur de la chaîne ordonnée (auto-hébergé
 *    par défaut). Le moteur Google non officiel n'est jamais un
 *    défaut : il ne peut être choisi qu'explicitement.
 *
 * Note : pour une bascule automatique entre moteurs, la route API
 * utilise traduireAvecSecours() (voir providers/fallback).
 */
export function fournisseurActif(): FournisseurTraduction {
  if (modePriveStrict()) return fournisseurParId('libretranslate');

  const explicite = process.env.TRANSLATOR_DEFAULT?.trim().toLowerCase();
  if (explicite && explicite !== 'auto') {
    return fournisseurParId(explicite as IdFournisseur);
  }
  return fournisseurParId(ordreSecours()[0]);
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
