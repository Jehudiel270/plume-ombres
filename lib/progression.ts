// ============================================================
// progression.ts — Reprise de lecture (où j'en étais).
//
// Mémore, par livre, le chapitre ouvert et la fraction de page
// lue, pour proposer « Reprendre la lecture » à la prochaine
// visite. Fonctions pures (testables en Node) ; la persistance
// (localStorage) vit dans le composant, la CLÉ est ici.
// ============================================================

export interface ProgressionLecture {
  /** Livre concerné. */
  livreId: string;
  /** Chapitre ouvert (null si inconnu). */
  chapitreId: string | null;
  /** Fraction de la page lue (0 → 1). */
  ratio: number;
  /** Libellé court pour le badge (ex. « Chapitre 12 · La fuite »). */
  libelle: string;
  /** Horodatage ISO du dernier enregistrement. */
  date: string;
}

/** Clef localStorage de la progression (versionnée). */
export const CLEF_PROGRESSION = 'plume.dombres.progression.v1';

/**
 * Assainit une progression lue du stockage : null si le contenu
 * est invalide, sinon une valeur bornée et exploitable.
 */
export function assainirProgression(entree: unknown): ProgressionLecture | null {
  if (typeof entree !== 'object' || entree === null) return null;
  const brut = entree as Record<string, unknown>;
  if (typeof brut.livreId !== 'string' || brut.livreId.length === 0) {
    return null;
  }
  return {
    livreId: brut.livreId,
    chapitreId: typeof brut.chapitreId === 'string' ? brut.chapitreId : null,
    ratio:
      typeof brut.ratio === 'number' && isFinite(brut.ratio)
        ? Math.min(Math.max(brut.ratio, 0), 1)
        : 0,
    libelle: typeof brut.libelle === 'string' ? brut.libelle : '',
    date: typeof brut.date === 'string' ? brut.date : new Date(0).toISOString(),
  };
}

/** Libellé complet du badge de reprise : « Chapitre 12 · 62 % ». */
export function formaterReprise(p: ProgressionLecture): string {
  const pct = Math.round(p.ratio * 100);
  return p.libelle ? `${p.libelle} · ${pct} %` : `Lecture à ${pct} %`;
}