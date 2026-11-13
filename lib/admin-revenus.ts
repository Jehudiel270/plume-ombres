// ============================================================
// lib/admin-revenus.ts — Indicateurs de revenus du tableau de bord.
//
// Vague 2 : MRR (revenu mensuel récurrent), actifs par plan, et les
// mouvements mensuels (nouveaux abonnements, sorties, encaissements).
// Les données viennent de la fonction SQL public.admin_stats_revenus
// (SECURITY DEFINER, contrôle du rôle à l'intérieur) qui ne renvoie
// QUE des nombres et des libellés de plan.
//
// Comme lib/admin-stats.ts, le client est injecté sous forme
// d'adaptateur .rpc(...) : la mise en forme est testable sans base.
// ============================================================

import type { ClientRpc } from './rate-limit';

/** Un plan et ses abonnements actifs (avec le prix du plan). */
export interface LignePlanActif {
  plan: string;
  nom: string;
  prixXof: number;
  dureeJours: number;
  actifs: number;
}

/** Les mouvements d'un mois : nouveaux, sorties, encaissements. */
export interface LigneMoisRevenus {
  /** « YYYY-MM ». */
  periode: string;
  nouveaux: number;
  sorties: number;
  encaisse: number;
  paiements: number;
}

/** Indicateurs de revenus affichés dans l'onglet « Abonnements ». */
export interface StatsRevenus {
  /** Revenu mensuel récurrent en XOF (abonnements actifs ramenés au mois). */
  mrrXof: number;
  /** Nombre total d'abonnements actifs (tous plans). */
  actifsTotal: number;
  /** Revenu moyen mensuel par abonné actif ; null si aucun actif. */
  arpuXof: number | null;
  actifsParPlan: LignePlanActif[];
  /** Du plus ancien au plus récent. */
  parMois: LigneMoisRevenus[];
  /** Total encaissé depuis l'origine (paiements réussis). */
  encaisseTotalXof: number;
}

function nombre(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function objet(brut: unknown): Record<string, unknown> {
  return typeof brut === 'object' && brut !== null
    ? (brut as Record<string, unknown>)
    : {};
}

/** Assainit la réponse de public.admin_stats_revenus. */
export function normaliserStatsRevenus(brut: unknown): StatsRevenus | null {
  const racine = objet(brut);
  if (!('mrr_xof' in racine)) return null;

  const actifsParPlan = (Array.isArray(racine.actifs_par_plan) ? racine.actifs_par_plan : [])
    .map((ligne): LignePlanActif | null => {
      const p = objet(ligne);
      if (typeof p.plan !== 'string') return null;
      return {
        plan: p.plan,
        nom: typeof p.nom === 'string' && p.nom ? p.nom : p.plan,
        prixXof: nombre(p.prix_xof),
        dureeJours: nombre(p.duree_jours),
        actifs: nombre(p.actifs),
      };
    })
    .filter((l): l is LignePlanActif => l !== null);

  const parMois = (Array.isArray(racine.par_mois) ? racine.par_mois : [])
    .map((ligne): LigneMoisRevenus | null => {
      const m = objet(ligne);
      if (typeof m.periode !== 'string') return null;
      return {
        periode: m.periode,
        nouveaux: nombre(m.nouveaux),
        sorties: nombre(m.sorties),
        encaisse: nombre(m.encaisse),
        paiements: nombre(m.paiements),
      };
    })
    .filter((l): l is LigneMoisRevenus => l !== null)
    .sort((a, b) => a.periode.localeCompare(b.periode));

  const mrrXof = Math.round(nombre(racine.mrr_xof));
  const actifsTotal = nombre(racine.actifs_total);
  const encaisseTotalXof = Math.round(nombre(racine.encaisse_total_xof));

  return {
    mrrXof,
    actifsTotal,
    arpuXof: actifsTotal > 0 ? Math.round(mrrXof / actifsTotal) : null,
    actifsParPlan,
    parMois,
    encaisseTotalXof,
  };
}

/** Collecte les indicateurs de revenus (6 derniers mois par défaut). */
export async function collecterStatsRevenus(
  client: ClientRpc,
  mois: number = 6
): Promise<{ stats: StatsRevenus | null; erreur: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_stats_revenus', { p_mois: mois });
    if (error) return { stats: null, erreur: error.message };
    const stats = normaliserStatsRevenus(data);
    if (!stats) return { stats: null, erreur: 'Réponse d’agrégats illisible.' };
    return { stats, erreur: null };
  } catch (e) {
    return { stats: null, erreur: e instanceof Error ? e.message : 'Erreur inconnue.' };
  }
}
