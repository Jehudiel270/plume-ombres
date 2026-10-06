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

// ============================================================
// VAGUE W8/W9 — FONCTIONNALITÉS DU PANNEAU ADMIN
//
// Tout ce qui suit alimente les AJOUTS du panneau : recherche/filtre/
// tri/pagination des comptes, export CSV, répartition des abonnements
// et des crédits, détection des anomalies, journal des actions.
//
// Les agrégats abonnements / crédits / paiements viennent de la
// fonction SQL public.admin_stats_abonnements() (SECURITY DEFINER,
// contrôle du rôle à l'intérieur) : RLS interdit en effet à l'admin de
// lire les lignes d'autrui, et ces fonctions ne renvoient QUE des
// NOMBRES et des libellés — jamais un contenu de livre.
// ============================================================

// ------------------------------------------------------------
// Catalogue des plans (lecture publique : plans_abonnement)
// ------------------------------------------------------------

/** Un plan du catalogue, réduit à ce dont l'admin a besoin. */
export interface PlanAdmin {
  code: string;
  nom: string;
}

/** Assainit les lignes de public.plans_abonnement. */
export function normaliserPlans(brut: unknown): PlanAdmin[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((l): PlanAdmin | null => {
      if (typeof l !== 'object' || l === null) return null;
      const o = l as Record<string, unknown>;
      if (typeof o.code !== 'string' || !o.code) return null;
      return { code: o.code, nom: typeof o.nom === 'string' && o.nom ? o.nom : o.code };
    })
    .filter((p): p is PlanAdmin => p !== null);
}

/** Nom lisible d'un code de plan (repli : le code lui-même). */
export function nomPlan(code: string | null, plans: readonly PlanAdmin[]): string {
  if (!code) return '—';
  return plans.find((p) => p.code === code)?.nom ?? code;
}

// ------------------------------------------------------------
// Courriels des comptes (RPC admin_courriels_comptes)
// ------------------------------------------------------------

/** Assainit la RPC admin_courriels_comptes en table id → courriel. */
export function normaliserCourriels(brut: unknown): Record<string, string> {
  const table: Record<string, string> = {};
  if (!Array.isArray(brut)) return table;
  for (const l of brut) {
    if (typeof l !== 'object' || l === null) continue;
    const o = l as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.courriel === 'string') {
      table[o.id] = o.courriel;
    }
  }
  return table;
}

/** Liste les courriels (usage : recherche d'un compte par courriel). */
export async function listerCourrielsAdmin(client: ClientRpc): Promise<{
  courriels: Record<string, string>;
  erreur: string | null;
}> {
  try {
    const { data, error } = await client.rpc('admin_courriels_comptes', {});
    if (error) return { courriels: {}, erreur: error.message };
    return { courriels: normaliserCourriels(data), erreur: null };
  } catch (e) {
    return {
      courriels: {},
      erreur: e instanceof Error ? e.message : 'Erreur inconnue.',
    };
  }
}

// ------------------------------------------------------------
// Journal des paiements (RPC admin_lister_paiements)
// ------------------------------------------------------------

/** Un paiement vu par l'administrateur (aucune coordonnée bancaire). */
export interface PaiementAdmin {
  reference: string;
  pseudo: string;
  plan: string | null;
  montant: number;
  devise: string;
  statut: string;
  fournisseur: string | null;
  operateur: string | null;
  referenceFournisseur: string | null;
  creeLe: string | null;
}

function chaineOuNull(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur ? valeur : null;
}

function normaliserPaiement(brut: unknown): PaiementAdmin | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.reference !== 'string' || !o.reference) return null;
  return {
    reference: o.reference,
    pseudo: typeof o.pseudo === 'string' ? o.pseudo : 'lecteur',
    plan: chaineOuNull(o.plan),
    montant: nombre(o.montant),
    devise: typeof o.devise === 'string' ? o.devise : 'XOF',
    statut: typeof o.statut === 'string' ? o.statut : 'en_attente',
    fournisseur: chaineOuNull(o.fournisseur),
    operateur: chaineOuNull(o.operateur),
    referenceFournisseur: chaineOuNull(o.reference_fournisseur),
    creeLe: typeof o.cree_le === 'string' ? o.cree_le : null,
  };
}

/** Assainit les lignes de public.admin_lister_paiements. */
export function normaliserPaiements(brut: unknown): PaiementAdmin[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map(normaliserPaiement)
    .filter((p): p is PaiementAdmin => p !== null);
}

/** Liste les derniers paiements. */
export async function listerPaiementsAdmin(
  client: ClientRpc,
  limite = 25
): Promise<{ paiements: PaiementAdmin[]; erreur: string | null }> {
  const sur = Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 200) : 25;
  try {
    const { data, error } = await client.rpc('admin_lister_paiements', {
      p_limite: sur,
    });
    if (error) return { paiements: [], erreur: error.message };
    return { paiements: normaliserPaiements(data), erreur: null };
  } catch (e) {
    return {
      paiements: [],
      erreur: e instanceof Error ? e.message : 'Erreur inconnue.',
    };
  }
}

// ------------------------------------------------------------
// Agrégats abonnements / crédits / paiements
// ------------------------------------------------------------

/** Répartition d'un plan : actifs / expirés non résiliés / autres. */
export interface LignePlan {
  plan: string;
  nom: string;
  actifs: number;
  expires: number;
  autres: number;
  total: number;
}

/** Paquet de crédits vendu : quantité, caractères et montant. */
export interface LignePack {
  pack: string;
  nom: string;
  quantite: number;
  caracteres: number;
  montant: number;
}

/** Tous les agrégats de l'écran « abonnements & crédits ». */
export interface StatsAbonnementsAdmin {
  abonnementsTotal: number;
  abonnementsActifs: number;
  abonnementsExpiresNonResilies: number;
  parPlan: LignePlan[];
  parStatut: { statut: string; total: number }[];
  parMois: { periode: string; total: number }[];
  credits: {
    comptesAvecSolde: number;
    soldeTotal: number;
    vendusTotal: number;
    consommesTotal: number;
    montantVendu: number;
    packsVendus: number;
    parPack: LignePack[];
  };
  paiements: {
    total: number;
    montantReussi: number;
    dernier: string | null;
    parStatut: { statut: string; total: number; montant: number }[];
    parFournisseur: { fournisseur: string; total: number }[];
  };
}

function objet(brut: unknown): Record<string, unknown> {
  return typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>) : {};
}

/** Assainit le JSON de public.admin_stats_abonnements. */
export function normaliserStatsAbonnements(brut: unknown): StatsAbonnementsAdmin | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = objet(brut);
  const credits = objet(o.credits);
  const paiements = objet(o.paiements);

  return {
    abonnementsTotal: nombre(o.abonnements_total),
    abonnementsActifs: nombre(o.abonnements_actifs),
    abonnementsExpiresNonResilies: nombre(o.abonnements_expires_non_resilies),
    parPlan: (Array.isArray(o.par_plan) ? o.par_plan : [])
      .map((l): LignePlan | null => {
        const p = objet(l);
        if (typeof p.plan !== 'string') return null;
        return {
          plan: p.plan,
          nom: typeof p.nom === 'string' ? p.nom : p.plan,
          actifs: nombre(p.actifs),
          expires: nombre(p.expires),
          autres: nombre(p.autres),
          total: nombre(p.total),
        };
      })
      .filter((l): l is LignePlan => l !== null),
    parStatut: (Array.isArray(o.par_statut) ? o.par_statut : [])
      .map((l) => {
        const s = objet(l);
        return typeof s.statut === 'string'
          ? { statut: s.statut, total: nombre(s.total) }
          : null;
      })
      .filter((l): l is { statut: string; total: number } => l !== null),
    parMois: (Array.isArray(o.abonnements_par_mois) ? o.abonnements_par_mois : [])
      .map((l) => {
        const m = objet(l);
        return typeof m.periode === 'string'
          ? { periode: m.periode, total: nombre(m.total) }
          : null;
      })
      .filter((l): l is { periode: string; total: number } => l !== null),
    credits: {
      comptesAvecSolde: nombre(credits.comptes_avec_solde),
      soldeTotal: nombre(credits.solde_total),
      vendusTotal: nombre(credits.vendus_total),
      consommesTotal: nombre(credits.consommes_total),
      montantVendu: nombre(credits.montant_vendu),
      packsVendus: nombre(credits.packs_vendus),
      parPack: (Array.isArray(credits.par_pack) ? credits.par_pack : [])
        .map((l): LignePack | null => {
          const p = objet(l);
          if (typeof p.pack !== 'string') return null;
          return {
            pack: p.pack,
            nom: typeof p.nom === 'string' ? p.nom : p.pack,
            quantite: nombre(p.quantite),
            caracteres: nombre(p.caracteres),
            montant: nombre(p.montant),
          };
        })
        .filter((l): l is LignePack => l !== null),
    },
    paiements: {
      total: nombre(paiements.total),
      montantReussi: nombre(paiements.montant_reussi),
      dernier: typeof paiements.dernier === 'string' ? paiements.dernier : null,
      parStatut: (Array.isArray(paiements.par_statut) ? paiements.par_statut : [])
        .map((l) => {
          const s = objet(l);
          return typeof s.statut === 'string'
            ? { statut: s.statut, total: nombre(s.total), montant: nombre(s.montant) }
            : null;
        })
        .filter(
          (l): l is { statut: string; total: number; montant: number } => l !== null
        ),
      parFournisseur: (Array.isArray(paiements.par_fournisseur)
        ? paiements.par_fournisseur
        : []
      )
        .map((l) => {
          const f = objet(l);
          return typeof f.fournisseur === 'string'
            ? { fournisseur: f.fournisseur, total: nombre(f.total) }
            : null;
        })
        .filter((l): l is { fournisseur: string; total: number } => l !== null),
    },
  };
}

/** Collecte les agrégats abonnements / crédits / paiements. */
export async function collecterStatsAbonnements(client: ClientRpc): Promise<{
  stats: StatsAbonnementsAdmin | null;
  erreur: string | null;
}> {
  try {
    const { data, error } = await client.rpc('admin_stats_abonnements', {});
    if (error) return { stats: null, erreur: error.message };
    const stats = normaliserStatsAbonnements(data);
    if (!stats) return { stats: null, erreur: 'Réponse d’agrégats illisible.' };
    return { stats, erreur: null };
  } catch (e) {
    return { stats: null, erreur: e instanceof Error ? e.message : 'Erreur inconnue.' };
  }
}

// ------------------------------------------------------------
// Journal des actions admin (table admin_actions, RLS est_admin)
// ------------------------------------------------------------

/** Une action administrative journalisée (qui, quoi, quand). */
export interface ActionAdmin {
  id: number;
  adminId: string;
  cibleId: string;
  action: string;
  duree: string | null;
  periodeFin: string | null;
  motif: string | null;
  creeLe: string | null;
}

/** Assainit les lignes de public.admin_actions. */
export function normaliserActions(brut: unknown): ActionAdmin[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((l): ActionAdmin | null => {
      if (typeof l !== 'object' || l === null) return null;
      const o = l as Record<string, unknown>;
      const id = typeof o.id === 'number' ? o.id : Number(o.id);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        adminId: typeof o.admin_id === 'string' ? o.admin_id : '',
        cibleId: typeof o.cible_id === 'string' ? o.cible_id : '',
        action: typeof o.action === 'string' ? o.action : 'action',
        duree: chaineOuNull(o.duree),
        periodeFin: chaineOuNull(o.periode_fin),
        motif: chaineOuNull(o.motif),
        creeLe: chaineOuNull(o.cree_le),
      };
    })
    .filter((a): a is ActionAdmin => a !== null);
}

// ------------------------------------------------------------
// Anomalies de compte (dérivées de la liste réelle des comptes)
// ------------------------------------------------------------

/** Codes d'anomalie détectables sans accès à un contenu de livre. */
export type CodeAnomalie =
  | 'abonnement_expire_non_resilie'
  | 'abonnement_sans_fin'
  | 'plan_inconnu';

/** Libellés lisibles des anomalies. */
export const LIBELLES_ANOMALIE: Record<CodeAnomalie, string> = {
  abonnement_expire_non_resilie: 'Abonnement expiré, statut encore « actif »',
  abonnement_sans_fin: 'Abonnement « actif » sans date de fin',
  plan_inconnu: 'Plan absent du catalogue',
};

/**
 * Anomalies d'un compte. Les plans servent à repérer un code de plan
 * qui n'existe plus au catalogue ; sans catalogue, ce contrôle est
 * simplement ignoré.
 */
export function detecterAnomalies(
  compte: CompteAdmin,
  plans: readonly PlanAdmin[] = [],
  maintenant: Date = new Date()
): CodeAnomalie[] {
  const codes: CodeAnomalie[] = [];
  const statut = compte.abonnementStatut;
  if (statut === 'actif' && !compte.abonnementFin) {
    codes.push('abonnement_sans_fin');
  }
  if (
    statut === 'actif' &&
    compte.abonnementFin &&
    new Date(compte.abonnementFin).getTime() <= maintenant.getTime()
  ) {
    codes.push('abonnement_expire_non_resilie');
  }
  if (
    compte.abonnementPlan &&
    plans.length > 0 &&
    !plans.some((p) => p.code === compte.abonnementPlan)
  ) {
    codes.push('plan_inconnu');
  }
  return codes;
}

/** Un compte et ses codes d'anomalie. */
export interface AnomalieCompte {
  compte: CompteAdmin;
  codes: CodeAnomalie[];
}

/** Tous les comptes porteurs d'au moins une anomalie. */
export function comptesEnAnomalie(
  comptes: readonly CompteAdmin[],
  plans: readonly PlanAdmin[] = [],
  maintenant: Date = new Date()
): AnomalieCompte[] {
  return comptes
    .map((compte) => ({ compte, codes: detecterAnomalies(compte, plans, maintenant) }))
    .filter((a) => a.codes.length > 0);
}

// ------------------------------------------------------------
// Export CSV (comptes, stats, abonnements, anomalies, paiements)
// ------------------------------------------------------------

/**
 * Échappe une cellule CSV. Séparateur « ; » (défaut du tableur
 * français) : on entoure de guillemets dès qu'une cellule contient un
 * point-virgule, un guillemet, un saut de ligne ou une virgule.
 */
export function echapperCsv(valeur: unknown): string {
  const s = valeur === null || valeur === undefined ? '' : String(valeur);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Une colonne d'export : clef technique + en-tête lisible. */
export interface ColonneCsv {
  cle: string;
  libelle: string;
}

/** Sérialise des lignes en CSV (séparateur « ; », en-tête inclus). */
export function versCsv(
  colonnes: readonly ColonneCsv[],
  lignes: readonly Record<string, unknown>[]
): string {
  const entete = colonnes.map((c) => echapperCsv(c.libelle)).join(';');
  const corps = lignes.map((l) =>
    colonnes.map((c) => echapperCsv(l[c.cle])).join(';')
  );
  return [entete, ...corps].join('\r\n');
}
// ------------------------------------------------------------
// Mise en forme partagée par le panneau et les exports
// ------------------------------------------------------------

/** « 3 500 F CFA » (devise littérale si inconnue). */
export function formaterMontant(montant: number, devise = 'XOF'): string {
  const unite = devise === 'XOF' ? 'F CFA' : devise;
  return `${formaterNombre(montant)} ${unite}`;
}

/** « 06/10/2026 14:32 » (ou « — »). */
export function formaterDateHeure(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** « 06/10/2026 » (ou « — »). */
export function formaterDateCourte(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}
