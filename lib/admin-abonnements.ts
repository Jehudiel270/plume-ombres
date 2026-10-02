// ============================================================
// lib/admin-abonnements.ts — Choix de durée d'un abonnement accordé
// par un administrateur (P0.9 / W4e).
//
// L'interface propose : à vie, 1 mois, 3 mois, 12 mois, ou jusqu'à
// une date précise. On traduit ce choix en NOMBRE DE JOURS pour la
// RPC public.attribuer_abonnement.
//
// ⚠ CONTRAT RPC (branche `w4/paiement`, à fusionner) — RÉEL :
//     attribuer_abonnement(p_user_id uuid, p_duree integer, p_motif text)
//     revoquer_abonnement(p_user_id uuid, p_motif text)
//   (le p_duree est un NOMBRE DE JOURS, « à vie » = JOURS_VIE).
//   Le lot W4e accepte, côté requête HTTP, la forme lisible
//   ('vie', '1_mois', '3_mois', '12_mois' ou une date ISO) et la
//   convertit ici : seule cette conversion dépend du format de la RPC.
// ============================================================

/** Durées nommées proposées à l'administrateur. */
export type DureeAdmin = 'vie' | '1_mois' | '3_mois' | '12_mois';

/** Durées nommées, dans l'ordre d'affichage. */
export const DUREES_ADMIN: readonly DureeAdmin[] = ['1_mois', '3_mois', '12_mois', 'vie'];

/** « À vie » : ~100 ans en jours (aucun plan « vie » en base). */
export const JOURS_VIE = 36500;

/** Nombre de jours par durée nommée. */
export const JOURS_PAR_DUREE: Record<DureeAdmin, number> = {
  '1_mois': 30,
  '3_mois': 90,
  '12_mois': 365,
  vie: JOURS_VIE,
};

/** Vrai si la chaîne est une durée nommée connue. */
export function estDureeAdmin(valeur: unknown): valeur is DureeAdmin {
  return typeof valeur === 'string' && (DUREES_ADMIN as readonly string[]).includes(valeur);
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Date ISO (YYYY-MM-DD) valide ? */
export function estDateIso(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const date = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && valeur === date.toISOString().slice(0, 10);
}

/** Fin = maintenant + `jours` (bornée, jamais nulle). */
export function dateFinDepuisJours(jours: number, maintenant: Date = new Date()): Date {
  const sur = Math.max(Math.trunc(jours), 1);
  return new Date(maintenant.getTime() + sur * MS_PAR_JOUR);
}

/**
 * Jours restants jusqu'à `dateFin` (au moins 1). Une date passée
 * accorde 1 jour plutôt qu'un abonnement déjà expiré.
 */
export function joursDepuisDate(dateFin: string, maintenant: Date = new Date()): number {
  const fin = new Date(`${dateFin}T23:59:59Z`);
  const jours = Math.ceil((fin.getTime() - maintenant.getTime()) / MS_PAR_JOUR);
  return Math.max(jours, 1);
}

/** Résolution d'une durée reçue par l'API. */
export interface DureeResolue {
  /** Nombre de jours transmis à la RPC. */
  jours: number;
  /** Libellé lisible (« 3 mois », « jusqu'au 31/12/2026 »). */
  libelle: string;
  /** Fin escomptée (ISO), pour l'affichage et le journal. */
  periodeFin: string;
}

/**
 * Résout la durée demandée : une durée nommée ('vie', '1_mois',
 * '3_mois', '12_mois') OU une date de fin ISO ('2030-01-01').
 * Renvoie null si la valeur n'est ni l'une ni l'autre.
 */
export function resoudreDuree(
  duree: unknown,
  maintenant: Date = new Date()
): DureeResolue | null {
  if (estDureeAdmin(duree)) {
    const jours = JOURS_PAR_DUREE[duree];
    return {
      jours,
      libelle: libelleDuree(duree),
      periodeFin: dateFinDepuisJours(jours, maintenant).toISOString(),
    };
  }
  if (estDateIso(duree)) {
    const jours = joursDepuisDate(duree, maintenant);
    return {
      jours,
      libelle: `jusqu’au ${duree.split('-').reverse().join('/')}`,
      periodeFin: new Date(`${duree}T23:59:59Z`).toISOString(),
    };
  }
  return null;
}

/** Libellé lisible d'une durée nommée (ou de la valeur brute). */
export function libelleDuree(duree: string): string {
  switch (duree) {
    case 'vie':
      return 'à vie';
    case '1_mois':
      return '1 mois';
    case '3_mois':
      return '3 mois';
    case '12_mois':
      return '12 mois';
    default:
      return duree;
  }
}
