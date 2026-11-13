// ============================================================
// lib/defis.ts — Défis de lecture (F14) : règles pures.
//
// NON MANIPULATEUR par conception : aucun classement, aucune
// punition, aucune relance. Une échéance dépassée n'enlève rien —
// le défi reste visible, simplement « au repos ». La progression
// est CALCULÉE depuis les données réelles du compte (chapitres
// découverts, livres traduits, jours de lecture), jamais saisie à
// la main : impossible de tricher, impossible de régresser.
// ============================================================

export const GENRES_DEFIS = ['chapitres', 'livres', 'jours'] as const;
export type GenreDefi = (typeof GENRES_DEFIS)[number];

export const LIBELLES_GENRE: Record<GenreDefi, string> = {
  chapitres: 'chapitres découverts',
  livres: 'livres terminés',
  jours: 'jours de lecture',
};

export const CIBLE_MIN = 1;
export const CIBLE_MAX = 1000;
export const MAX_DEFIS = 30;

export interface Defi {
  id: string;
  titre: string;
  genre: GenreDefi;
  cible: number;
  livreId: string | null;
  /** Date seule ISO (AAAA-MM-JJ) ou null. */
  echeance: string | null;
  termineLe: string | null;
  creeLe: string;
}

export function estGenreDefi(valeur: unknown): valeur is GenreDefi {
  return (
    typeof valeur === 'string' &&
    (GENRES_DEFIS as readonly string[]).includes(valeur)
  );
}

/** Nettoie un titre saisi : borné, sans espaces superflus. */
export function propreTitre(brut: unknown, maximum = 120): string {
  if (typeof brut !== 'string') return '';
  return brut.trim().replace(/\s+/g, ' ').slice(0, maximum);
}

/** Borne une cible saisie ; NaN/negatif → invalide (null). */
export function borneCible(brut: unknown): number | null {
  const n = Math.round(Number(brut));
  if (!Number.isFinite(n)) return null;
  if (n < CIBLE_MIN || n > CIBLE_MAX) return null;
  return n;
}

/** Une date ISO AAAA-MM-JJ stricte (ou null si vide). */
export function dateSeule(brut: unknown): string | null {
  if (typeof brut !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;
  const d = new Date(`${brut}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : brut;
}

export interface CompteursLecture {
  /** Chapitres découverts (XP posée), éventuellement depuis une date. */
  chapitres: number;
  /** Livres entièrement traduits (ou lus, selon la règle choisie). */
  livres: number;
  /** Jours DISTINCTS où au moins un chapitre a été découvert. */
  jours: number;
}

/** Progression d'un défi : la valeur réelle, plafonnée à la cible. */
export function progressionDefi(defi: Defi, c: CompteursLecture): number {
  const valeur =
    defi.genre === 'chapitres'
      ? c.chapitres
      : defi.genre === 'livres'
        ? c.livres
        : c.jours;
  return Math.max(0, Math.min(defi.cible, valeur));
}

export type EtatDefi = 'en_cours' | 'atteint' | 'au_repos';

/** État AFFICHÉ : atteint, en cours, ou au repos (échéance passée
 *  sans être atteint — reste visible, jamais supprimé ni punitif). */
export function etatDefi(
  defi: Defi,
  c: CompteursLecture,
  aujourdHuiISO: string
): { etat: EtatDefi; valeur: number; part: number } {
  const valeur = progressionDefi(defi, c);
  const part = defi.cible > 0 ? Math.min(1, valeur / defi.cible) : 0;
  if (valeur >= defi.cible) return { etat: 'atteint', valeur, part: 1 };
  if (defi.echeance && defi.echeance < aujourdHuiISO) {
    return { etat: 'au_repos', valeur, part };
  }
  return { etat: 'en_cours', valeur, part };
}

/** Nombre de jours DISTINCTS dans une liste d'horodatages ISO. */
export function joursDistincts(horodatages: readonly string[]): number {
  const jours = new Set<string>();
  for (const h of horodatages) {
    if (typeof h === 'string' && h.length >= 10) jours.add(h.slice(0, 10));
  }
  return jours.size;
}
