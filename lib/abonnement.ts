// ============================================================
// lib/abonnement.ts — Modèle d'abonnement (gratuit / premium) (P0.9).
//
// Source de vérité PARTAGÉE entre le serveur et le navigateur :
//  * la liste des plans (code, prix indicatif en XOF, durée, quota
//    offert, moteur recommandé) ;
//  * les statuts d'abonnement et leur cycle de vie ;
//  * le calcul des périodes et la règle « ce plan est-il encore actif » ;
//  * l'avantage Premium réellement appliqué ailleurs :
//      - quota plus élevé (porté en base par public.reserver_quota,
//        qui lit le quota du plan via public.limite_abonnement) ;
//      - moteur supérieur recommandé (moteurPourPlan) — exposé ici et
//        affiché dans l'interface ; son câblage dans /api/translate
//        est documenté dans le rapport (route interdite à ce lot).
//
// Les prix sont en FRANCS CFA (XOF) : la clientèle visée paie en
// Mobile Money (zone UEMOA). Ce sont des montants INDICATIFS, à
// arrêter (juriste + comptable) avant l'ouverture réelle du paiement.
// Le mode par défaut reste la SIMULATION : aucun prélèvement.
// ============================================================

import type { IdFournisseur } from './types';

/** Code d'un plan. Le gratuit porte le code 'gratuit'. */
export type CodePlan =
  | 'gratuit'
  | 'premium_mensuel'
  | 'premium_annuel'
  | 'credits_250' // packs de crédits PRÉPAYÉS (pay-as-you-go)
  | 'credits_600'
  | 'credits_1800'
  | 'credits_4000';

/** Cycle de vie d'un abonnement. */
export type StatutAbonnement =
  | 'inactif' // aucun abonnement connu
  | 'en_attente' // paiement initié, pas encore confirmé
  | 'actif'
  | 'expire' // la période est écoulée
  | 'resilie' // arrêté par le propriétaire ou un administrateur
  | 'echec'; // le dernier paiement a échoué

export interface PlanAbonnement {
  code: CodePlan;
  nom: string;
  resume: string;
  /** Prix en francs CFA (0 = gratuit). */
  prixXof: number;
  devise: 'XOF';
  /** Durée offerte par un paiement, en jours (0 = gratuit/permanent). */
  dureeJours: number;
  /** Quota mensuel de caractères offert par ce plan. */
  quotaMensuelCaracteres: number;
  /** Moteur de traduction recommandé ('auto' = selon les clés présentes). */
  moteur: IdFournisseur | 'auto';
  /**
   * Caractères offerts par un PACK DE CRÉDITS prépayés. Absent (ou 0)
   * pour les plans d'abonnement : c'est le marqueur d'un pack.
   */
  caracteres?: number;
  avantages: string[];
  ordre: number;
}

/** Code du plan gratuit (par défaut). */
export const CODE_PLAN_GRATUIT: CodePlan = 'gratuit';

/** Plan utilisé pour les attributions administrateur. */
export const CODE_PLAN_PREMIUM: CodePlan = 'premium_mensuel';

/**
 * Plafond par défaut du plan gratuit (caractères/mois) — aligné sur la
 * règle « un livre complet par mois » annoncée publiquement.
 */
export const QUOTA_GRATUIT_CARACTERES = 400_000;

/** Plafond Premium (caractères/mois) — l'avantage « quota plus élevé ». */
export const QUOTA_PREMIUM_CARACTERES = 3_000_000;

/**
 * Catalogue des plans. L'ORDRE est l'ordre d'affichage.
 * Montants en XOF, INDICATIFS (aucun engagement tant que le paiement
 * réel n'est pas ouvert).
 */
export const PLANS: readonly PlanAbonnement[] = [
  {
    code: 'gratuit',
    nom: 'Gratuit',
    resume: 'Offre de lancement : import, traduction, lecture et exports.',
    prixXof: 0,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: QUOTA_GRATUIT_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Import .txt, .md, .pdf (texte) et .epub',
      'Découpage en chapitres et traduction vers le français',
      'Lecture complète, reprise, favoris, recherche',
      'Exports Markdown, Word et PDF',
    ],
    ordre: 0,
  },
  {
    code: 'premium_mensuel',
    nom: 'Premium — mensuel',
    resume: 'Pour traduire plusieurs livres par mois, sans plafond gênant.',
    prixXof: 3000,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_PREMIUM_CARACTERES,
    moteur: 'gemini',
    avantages: [
      'Quota de traduction élargi (plusieurs livres par mois)',
      'Qualité littéraire supérieure (moteur payant)',
      'Traductions en parallèle et file prioritaire',
      'Glossaire de personnages pour les sagas',
    ],
    ordre: 1,
  },
  {
    code: 'premium_annuel',
    nom: 'Premium — annuel',
    resume: 'Deux mois offerts par rapport au mensuel.',
    prixXof: 30000,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_PREMIUM_CARACTERES,
    moteur: 'gemini',
    avantages: [
      'Tous les avantages du Premium mensuel',
      'Deux mois offerts sur l’année',
      'Même quota élargi, mois après mois',
    ],
    ordre: 2,
  },
  // ---- Packs de CRÉDITS prépayés (pay-as-you-go, SANS abonnement) ----
  {
    code: 'credits_250',
    nom: 'Pack Découverte',
    resume: '250 000 caractères, sans abonnement ni prélèvement mensuel.',
    prixXof: 500,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 250_000,
    avantages: [
      '250 000 caractères — environ un roman',
      'Crédits valables sans limite de temps',
      'Aucun abonnement, aucun prélèvement mensuel',
    ],
    ordre: 10,
  },
  {
    code: 'credits_600',
    nom: 'Pack Lecteur',
    resume: '600 000 caractères : deux à trois romans, au meilleur prix.',
    prixXof: 1000,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 600_000,
    avantages: [
      '600 000 caractères — deux à trois romans',
      'Le meilleur rapport qualité/prix',
      'Aucun abonnement, aucun prélèvement mensuel',
    ],
    ordre: 11,
  },
  {
    code: 'credits_1800',
    nom: 'Pack Bibliothèque',
    resume: '1 800 000 caractères pour une saga complète.',
    prixXof: 2500,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 1_800_000,
    avantages: [
      '1 800 000 caractères — une saga complète',
      'Idéal pour les séries au long cours',
      'Aucun abonnement, aucun prélèvement mensuel',
    ],
    ordre: 12,
  },
  {
    code: 'credits_4000',
    nom: 'Pack Collection',
    resume: '4 000 000 caractères : jamais à court, sans engagement.',
    prixXof: 5000,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 4_000_000,
    avantages: [
      '4 000 000 caractères — plusieurs sagas',
      'Pour les gros lecteurs, sans engagement',
      'Aucun abonnement, aucun prélèvement mensuel',
    ],
    ordre: 13,
  },
];

/** Tous les plans, triés par ordre d'affichage. */
export function tousLesPlans(): readonly PlanAbonnement[] {
  return [...PLANS].sort((a, b) => a.ordre - b.ordre);
}

/** Les plans payants (souscriptibles par Mobile Money), packs compris. */
export function plansPayants(): readonly PlanAbonnement[] {
  return tousLesPlans().filter((p) => p.prixXof > 0);
}

/** Les plans d'ABONNEMENT (hors packs de crédits), triés. */
export function plansAbonnement(): readonly PlanAbonnement[] {
  return tousLesPlans().filter((p) => !estPackCredits(p));
}

/** Les PACKS DE CRÉDITS prépayés, triés par ordre d'affichage. */
export function packsCredits(): readonly PlanAbonnement[] {
  return tousLesPlans().filter((p) => estPackCredits(p));
}

/** Retrouve un plan par son code, ou null. */
export function planParCode(code: string | null | undefined): PlanAbonnement | null {
  if (!code) return null;
  return PLANS.find((p) => p.code === code) ?? null;
}

/** Vrai si la chaîne est un code de plan connu. */
export function estCodePlan(valeur: unknown): valeur is CodePlan {
  return typeof valeur === 'string' && PLANS.some((p) => p.code === valeur);
}

/**
 * Vrai si le plan est un PACK DE CRÉDITS prépayés (et non un
 * abonnement). Marqueur : un nombre de caractères strictement positif.
 */
export function estPackCredits(plan: PlanAbonnement | null | undefined): boolean {
  return (
    !!plan &&
    typeof plan.caracteres === 'number' &&
    plan.caracteres > 0
  );
}

/** Vrai si le code correspond à un pack de crédits. */
export function estCodeCredits(valeur: unknown): boolean {
  return estPackCredits(planParCode(typeof valeur === 'string' ? valeur : null));
}

/** Nombre de caractères offerts par un pack (0 pour un abonnement). */
export function caracteresPack(plan: PlanAbonnement | null | undefined): number {
  return estPackCredits(plan) ? (plan as PlanAbonnement).caracteres ?? 0 : 0;
}

/**
 * Vrai si le plan est un ABONNEMENT payant (donc Premium). Les packs
 * de crédits sont payants mais ne sont PAS un abonnement : ils
 * n'ouvrent aucun droit récurrent.
 */
export function estPlanPremium(plan: PlanAbonnement | null | undefined): boolean {
  return !!plan && plan.prixXof > 0 && !estPackCredits(plan);
}

/** Vrai si le code correspond à un plan Premium. */
export function estCodePremium(valeur: unknown): boolean {
  return estPlanPremium(planParCode(typeof valeur === 'string' ? valeur : null));
}

// ------------------------------------------------------------
// Périodes
// ------------------------------------------------------------

export interface PeriodeAbonnement {
  debut: string; // ISO 8601 (timestamptz)
  fin: string; // ISO 8601 (timestamptz)
}

/** Fin = début + dureeJours jours (bornée, jamais dans le passé). */
export function periodeDepuis(
  dureeJours: number,
  debut: Date = new Date()
): PeriodeAbonnement {
  const jours = Math.max(Math.trunc(dureeJours), 1);
  const fin = new Date(debut.getTime() + jours * 24 * 60 * 60 * 1000);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

/** Période d'un plan payant (durée du plan) à partir de `debut`. */
export function periodePlan(
  plan: PlanAbonnement,
  debut: Date = new Date()
): PeriodeAbonnement {
  return periodeDepuis(plan.dureeJours, debut);
}

// ------------------------------------------------------------
// Abonnement (état courant + historisation)
// ------------------------------------------------------------

export interface Abonnement {
  proprietaire_id: string;
  plan: CodePlan;
  statut: StatutAbonnement;
  periode_debut: string | null;
  periode_fin: string | null;
  paiement_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvenementAbonnement {
  id: number;
  proprietaire_id: string;
  plan: CodePlan;
  statut: StatutAbonnement;
  periode_debut: string | null;
  periode_fin: string | null;
  paiement_reference: string | null;
  motif: string | null;
  cree_le: string;
}

/**
 * Abonnement « effectif » : un abonnement `actif` dont la période n'est
 * pas terminée. Un statut `actif` périmé est traité comme expiré.
 */
export function abonnementActif(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): boolean {
  if (!abonnement || abonnement.statut !== 'actif') return false;
  if (!abonnement.periode_fin) return false;
  return new Date(abonnement.periode_fin).getTime() > maintenant.getTime();
}

/** Statut effectif (un `actif` périmé devient `expire`). */
export function statutEffectif(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): StatutAbonnement {
  if (!abonnement) return 'inactif';
  if (abonnement.statut === 'actif' && !abonnementActif(abonnement, maintenant)) {
    return 'expire';
  }
  return abonnement.statut;
}

/** Abonnement neutre (plan gratuit) pour un compte sans historique. */
export function abonnementGratuit(
  proprietaireId: string,
  maintenant: Date = new Date()
): Abonnement {
  const iso = maintenant.toISOString();
  return {
    proprietaire_id: proprietaireId,
    plan: CODE_PLAN_GRATUIT,
    statut: 'inactif',
    periode_debut: null,
    periode_fin: null,
    paiement_reference: null,
    created_at: iso,
    updated_at: iso,
  };
}

// ------------------------------------------------------------
// Avantages Premium (là où c'est déjà prévu)
// ------------------------------------------------------------

/**
 * Quota mensuel effectif pour un plan, sachant un plafond de base
 * (celui de l'environnement). On ne réduit JAMAIS le plafond de base :
 * un plan gratuit garde `quotaBase`, un plan Premium prend le plus
 * grand des deux. C'est la règle miroir de public.limite_abonnement.
 */
export function quotaPourPlan(
  plan: PlanAbonnement | null | undefined,
  quotaBase: number
): number {
  const base = Number.isFinite(quotaBase) && quotaBase > 0 ? quotaBase : QUOTA_GRATUIT_CARACTERES;
  if (!plan || !estPlanPremium(plan)) return base;
  return Math.max(base, plan.quotaMensuelCaracteres);
}

/** Moteur recommandé pour un plan ('auto' = selon les clés présentes). */
export function moteurPourPlan(
  plan: PlanAbonnement | null | undefined
): IdFournisseur | 'auto' {
  return plan?.moteur ?? 'auto';
}

/** Libellé court d'un statut, pour l'affichage. */
export function libelleStatut(statut: StatutAbonnement): string {
  const libelles: Record<StatutAbonnement, string> = {
    inactif: 'Sans abonnement',
    en_attente: 'Paiement en attente',
    actif: 'Actif',
    expire: 'Expiré',
    resilie: 'Résilié',
    echec: 'Paiement échoué',
  };
  return libelles[statut] ?? statut;
}

/** « 3 000 F CFA » / « Gratuit ». */
export function libellePrix(plan: PlanAbonnement): string {
  if (plan.prixXof <= 0) return 'Gratuit';
  return `${plan.prixXof.toLocaleString('fr-FR')} F CFA`;
}

/** Périodicité lisible : « / mois », « / an », ''. */
export function libellePeriodicite(plan: PlanAbonnement): string {
  if (plan.dureeJours <= 0) return '';
  if (plan.dureeJours >= 360) return '/ an';
  if (plan.dureeJours >= 28) return '/ mois';
  return `pour ${plan.dureeJours} jours`;
}
