// ============================================================
// lib/admin-stats.ts — Statistiques d'usage du tableau de bord admin.
//
// RÈGLE DE SÉCURITÉ : l'administrateur ne peut PAS lire le contenu des
// livres d'autrui. Les comptages portant sur livres / chapitres /
// segments passent donc par la fonction SQL AGRÉGÉE public.stats_admin
// (SECURITY DEFINER, contrôle du rôle à l'intérieur), qui ne renvoie
// QUE des NOMBRES — jamais un titre, un texte ou un identifiant de
// contenu. Les profils, eux, sont lisibles par l'admin via la
// politique RLS « profiles_select_admin ».
//
// Le client est injecté sous forme d'un adaptateur .rpc(...), comme
// lib/quota.ts / lib/rate-limit.ts : la logique de mise en forme est
// donc testable sans Supabase.
// ============================================================

import type { ClientRpc } from './rate-limit';

/** Une période (mois civil) et les caractères qui y ont été utilisés. */
export interface PeriodeStats {
  /** « YYYY-MM ». */
  periode: string;
  caracteres: number;
}

/** Toutes les statistiques affichées par le tableau de bord. */
export interface StatsAdmin {
  comptes: number;
  livres: number;
  chapitres: number;
  chapitresTraduits: number;
  segments: number;
  caracteresUtilisesTotal: number;
  caracteresPeriode: number;
  periodeDebut: string;
  periodeFin: string;
  periodes: PeriodeStats[];
  /** null quand le schéma des abonnements n'est pas encore fusionné. */
  abonnementsActifs: number | null;
  paiementsReussis: number | null;
}

/** Résultat de la collecte : statistiques OU message d'indisponibilité. */
export interface ResultatStats {
  stats: StatsAdmin | null;
  erreur: string | null;
}

function nombre(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

/** Assainit le JSON renvoyé par public.stats_admin. */
export function normaliserStats(brut: unknown): StatsAdmin | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = brut as Record<string, unknown>;
  const periodes: PeriodeStats[] = Array.isArray(o.periodes)
    ? o.periodes
        .filter(
          (p): p is { periode: string; caracteres: unknown } =>
            typeof p === 'object' && p !== null && typeof (p as { periode?: unknown }).periode === 'string'
        )
        .map((p) => ({ periode: p.periode, caracteres: nombre(p.caracteres) }))
    : [];

  return {
    comptes: nombre(o.comptes),
    livres: nombre(o.livres),
    chapitres: nombre(o.chapitres),
    chapitresTraduits: nombre(o.chapitres_traduits),
    segments: nombre(o.segments),
    caracteresUtilisesTotal: nombre(o.caracteres_utilises_total),
    caracteresPeriode: nombre(o.caracteres_periode),
    periodeDebut: typeof o.periode_debut === 'string' ? o.periode_debut : '',
    periodeFin: typeof o.periode_fin === 'string' ? o.periode_fin : '',
    periodes,
    abonnementsActifs: nombreOuNull(o.abonnements_actifs),
    paiementsReussis: nombreOuNull(o.paiements_reussis),
  };
}

/**
 * Collecte les statistiques agrégées.
 *
 * @param client adaptateur .rpc(...) (client Supabase serveur)
 * @param debut  premier mois (YYYY-MM-DD) — défaut : 12 mois glissants
 * @param fin    dernier mois (YYYY-MM-DD) — défaut : aujourd'hui
 */
export async function collecterStatsAdmin(
  client: ClientRpc,
  debut?: string,
  fin?: string
): Promise<ResultatStats> {
  const args: Record<string, unknown> = {};
  if (debut) args.p_debut = debut;
  if (fin) args.p_fin = fin;

  try {
    const { data, error } = await client.rpc('stats_admin', args);
    if (error) {
      return { stats: null, erreur: error.message };
    }
    const stats = normaliserStats(data);
    if (!stats) return { stats: null, erreur: 'Réponse de statistiques illisible.' };
    return { stats, erreur: null };
  } catch (e) {
    return { stats: null, erreur: e instanceof Error ? e.message : 'Erreur inconnue.' };
  }
}

/** « 12 345 » (séparateur de milliers français). */
export function formaterNombre(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR');
}

// ------------------------------------------------------------
// Liste des comptes (via public.admin_lister_comptes — aucun contenu)
// ------------------------------------------------------------

/** Un compte vu par un administrateur (jamais de texte de livre). */
export interface CompteAdmin {
  id: string;
  pseudo: string;
  role: string;
  creeLe: string | null;
  abonnementStatut: string | null;
  abonnementPlan: string | null;
  abonnementFin: string | null;
}

/** Assainit une ligne renvoyée par public.admin_lister_comptes. */
function normaliserCompte(brut: unknown): CompteAdmin | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  return {
    id: o.id,
    pseudo: typeof o.pseudo === 'string' ? o.pseudo : 'lecteur',
    role: typeof o.role === 'string' ? o.role : 'utilisateur',
    creeLe: typeof o.cree_le === 'string' ? o.cree_le : null,
    abonnementStatut: typeof o.abonnement_statut === 'string' ? o.abonnement_statut : null,
    abonnementPlan: typeof o.abonnement_plan === 'string' ? o.abonnement_plan : null,
    abonnementFin: typeof o.abonnement_fin === 'string' ? o.abonnement_fin : null,
  };
}

/** Liste les comptes (pseudo, rôle, dates, abonnement). */
export async function listerComptesAdmin(client: ClientRpc): Promise<{
  comptes: CompteAdmin[];
  erreur: string | null;
}> {
  try {
    const { data, error } = await client.rpc('admin_lister_comptes', {});
    if (error) return { comptes: [], erreur: error.message };
    const lignes = Array.isArray(data) ? data : [];
    return {
      comptes: lignes
        .map(normaliserCompte)
        .filter((c): c is CompteAdmin => c !== null),
      erreur: null,
    };
  } catch (e) {
    return { comptes: [], erreur: e instanceof Error ? e.message : 'Erreur inconnue.' };
  }
}

/** Abonnement considéré actif (statut « actif » et fin à venir). */
export function abonnementActif(
  compte: CompteAdmin,
  maintenant: Date = new Date()
): boolean {
  if (compte.abonnementStatut !== 'actif' || !compte.abonnementFin) return false;
  return new Date(compte.abonnementFin).getTime() > maintenant.getTime();
}

/** « 2026-10 » → « oct. 2026 ». */
export function formaterPeriode(periode: string): string {
  const [annee, mois] = periode.split('-');
  const noms = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  const index = Number(mois) - 1;
  if (!annee || Number.isNaN(index) || index < 0 || index > 11) return periode;
  return `${noms[index]} ${annee}`;
}
