// ============================================================
// lib/confort-lecture.ts — Confort de lecture (socle, gratuit).
//
// Helpers PURS du défilement automatique et de la vitesse : toute
// la décision (valeur bornée, pas suivant, fin de page) est testable
// sans DOM. Le composant (ConfortLecture.tsx) ne fait que l'appliquer.
// ============================================================

/** Vitesse du défilement automatique, en pixels par seconde. */
export const VITESSE_MIN = 20;
export const VITESSE_MAX = 300;
export const VITESSE_DEFAUT = 60;

/**
 * Borne la valeur (entrée utilisateur, localStorage…) dans
 * [VITESSE_MIN, VITESSE_MAX]. Toute valeur invalide → défaut.
 */
export function vitesseDefilement(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n) || n <= 0) return VITESSE_DEFAUT;
  return Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, Math.round(n)));
}

/**
 * Pas suivant du défilement : position + déplacement, borné au fond
 * de la page. Renvoie null quand le bas est atteint (le composant
 * met alors le défilement en pause — lecture « mains libres »).
 *
 * @param position    scrollTop actuel du conteneur
 * @param delta       déplacement demandé (px, positif)
 * @param hauteur     scrollHeight du conteneur
 * @param visible     clientHeight du conteneur
 */
export function prochainPas(
  position: number,
  delta: number,
  hauteur: number,
  visible: number
): number | null {
  if (!Number.isFinite(position) || !Number.isFinite(hauteur)) return null;
  if (hauteur <= 0 || visible <= 0) return null;
  const fond = hauteur - visible;
  if (fond <= 0) return null; // rien à faire défiler
  if (position >= fond - 1) return null; // déjà au bout
  return Math.min(fond, position + Math.max(0, delta));
}
