// ============================================================
// Enchaînement des passages du worker de traduction.
//
// Un passage dure ~45 s (budget de la fonction). Quand il laisse du travail
// derrière lui ET qu'il a réellement avancé, il relance le suivant : le livre
// progresse même si le client a fermé son onglet, sans horloge externe.
//
// La décision est isolée ici, pure, pour être testable sans HTTP ni base.
// ============================================================

/** Profondeur maximale d'une chaîne : au-delà, le cron reprend la main. */
export const PROFONDEUR_MAX_CHAINE = 200;

/** Corps minimal d'une réponse de passage utile à la décision. */
export interface BilanPassage {
  statut?: string;
  lots?: { faits?: number; echoues?: number };
}

/** Profondeur du passage courant, déduite du paramètre `?chaine=`. */
export function profondeurSuivante(brut: string | null | undefined): number {
  const valeur = Number(brut ?? '0');
  if (!Number.isFinite(valeur) || valeur < 0) return 1;
  return Math.floor(valeur) + 1;
}

/**
 * Faut-il relancer un passage ?
 *
 *  • statut `en_cours` uniquement : terminé, en erreur ou bail perdu = stop ;
 *  • au moins un segment réellement traduit : sur un moteur en panne, boucler
 *    ne servirait à rien (le cron retentera plus tard) ;
 *  • profondeur bornée : une chaîne ne peut pas s'emballer.
 */
export function fautIlEnchainer(
  corps: BilanPassage | null | undefined,
  profondeur: number
): boolean {
  if (!corps || corps.statut !== 'en_cours') return false;
  if ((corps.lots?.faits ?? 0) <= 0) return false;
  if (!Number.isFinite(profondeur) || profondeur <= 0) return false;
  return profondeur <= PROFONDEUR_MAX_CHAINE;
}
