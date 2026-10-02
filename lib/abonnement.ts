// ============================================================
// lib/abonnement.ts — Catalogue des offres et modèle d'abonnement.
//
// Source de vérité PARTAGÉE entre le serveur et le navigateur :
//  * la liste des plans (code, prix en FCFA/XOF, durée, quota de
//    caractères, plafond de livres, file prioritaire, parallélisme,
//    glossaire, conditions étudiant / groupe / école) ;
//  * les statuts d'abonnement et leur cycle de vie ;
//  * l'essai gratuit de 7 jours (équivalent « passionné », plafonné à
//    3 livres AU TOTAL) et son anti-abus (1 essai par e-mail ET par
//    numéro Mobile Money) ;
//  * les alias de compatibilité `premium_mensuel` / `premium_annuel`,
//    conservés pour ne rien casser (base, panneau admin, historique) ;
//  * le calcul des périodes et la règle « ce plan est-il encore actif ».
//
// Les prix sont en FRANCS CFA (XOF) : la clientèle visée paie en
// Mobile Money (zone UEMOA). XOF ne comporte PAS de centimes.
//
// IMPORTANT — la traduction tourne EXCLUSIVEMENT sur la chaîne de
// moteurs GRATUITS (auto-hébergé en premier, secours gratuits). Aucun
// moteur payant n'est acheté. Les offres se différencient par le
// VOLUME, la FILE PRIORITAIRE, le PARALLÉLISME, le GLOSSAIRE, les
// EXPORTS et les fonctions de groupe. Le nom d'un moteur ne doit
// JAMAIS apparaître dans l'interface.
// ============================================================

import type { IdFournisseur } from './types';

/** Code d'un plan. Le gratuit porte le code 'gratuit'. */
export type CodePlan =
  | 'gratuit'
  | 'essai'
  | 'lecteur_mensuel'
  | 'lecteur_annuel'
  | 'passionne_mensuel'
  | 'passionne_annuel'
  | 'illimite_mensuel'
  | 'illimite_annuel'
  | 'etudiant_mensuel'
  | 'groupe_mensuel'
  | 'ecole_annuel'
  // Alias de compatibilité (historique) : ne JAMAIS retirer.
  | 'premium_mensuel'
  | 'premium_annuel';

/** Famille d'un plan (sert à l'affichage et aux conditions). */
export type CategoriePlan =
  | 'gratuit'
  | 'essai'
  | 'individuel'
  | 'etudiant'
  | 'groupe'
  | 'ecole'
  | 'legacy';

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
  /** Prix ramené au mois, pour les offres annuelles (facultatif). */
  prixMensuelXof?: number;
  devise: 'XOF';
  /** Durée offerte par un paiement, en jours (0 = gratuit/permanent). */
  dureeJours: number;
  /** Quota mensuel de caractères offert par ce plan. */
  quotaMensuelCaracteres: number;
  /**
   * Moteur recommandé côté serveur. Toujours 'auto' : la chaîne de
   * moteurs GRATUITS (aucun moteur payant). Jamais affiché.
   */
  moteur: IdFournisseur | 'auto';
  avantages: string[];
  ordre: number;
  /** Famille du plan. */
  categorie: CategoriePlan;
  /** Plafond de LIVRES par période (null = pas de plafond de livres). */
  livresMois: number | null;
  /** Nombre de traductions menées EN PARALLÈLE. */
  traductionsSimultanees: number;
  /** Vrai si le plan passe DEVANT quand la file est chargée. */
  filePrioritaire: boolean;
  /** Vrai si le glossaire de personnages est inclus. */
  glossaire: boolean;
  /** Minimum de personnes pour un plan de groupe (1 sinon). */
  minPersonnes: number;
  /** Vrai si le tarif est PAR PERSONNE (groupe, école). */
  parPersonne: boolean;
  /** Vrai si le plan est masqué du catalogue public (essai, alias). */
  masque: boolean;
  /** Code du plan de référence (alias de compatibilité). */
  aliasDe?: CodePlan;
  /** Vrai si l'accès exige une vérification (étudiant). */
  verificationRequise?: boolean;
  /** Vrai si le volume est « illimité » sous usage raisonnable. */
  usageRaisonnable?: boolean;
}

/** Code du plan gratuit (par défaut). */
export const CODE_PLAN_GRATUIT: CodePlan = 'gratuit';

/** Code du plan d'essai (attribué automatiquement à l'inscription). */
export const CODE_PLAN_ESSAI: CodePlan = 'essai';

/** Plan utilisé pour les attributions administrateur (legacy). */
export const CODE_PLAN_PREMIUM: CodePlan = 'premium_mensuel';

/**
 * Plafond par défaut du plan gratuit (caractères/mois) — aligné sur la
 * règle « un livre complet par mois » annoncée publiquement.
 */
export const QUOTA_GRATUIT_CARACTERES = 400_000;

/** Plafond du plan « Lecteur » (3 livres/mois). */
export const QUOTA_LECTEUR_CARACTERES = 1_200_000;

/** Plafond du plan « Passionné » (10 livres/mois) — alias essai. */
export const QUOTA_PASSIONNE_CARACTERES = 4_000_000;

/** Plafond « usage raisonnable » du plan illimité (fair-use). */
export const QUOTA_ILLIMITE_CARACTERES = 25_000_000;

/**
 * Plafond des plans historiques `premium_mensuel` / `premium_annuel`
 * (conservé à l'identique pour ne rien casser : historique, admin).
 */
export const QUOTA_PREMIUM_CARACTERES = 3_000_000;

/** Durée de l'essai gratuit (jours). */
export const ESSAI_JOURS = 7;

/** Nombre de LIVRES maximum inclus dans l'essai, au total. */
export const ESSAI_LIVRES_MAX = 3;

/** Mention « usage raisonnable » affichée sur le plan illimité. */
export const MENTION_USAGE_RAISONNABLE =
  'Volume illimité, sous usage raisonnable (jusqu’à 25 000 000 caractères par mois)';

/** Formulation générique du moteur — JAMAIS de nom de fournisseur. */
export const MENTION_MOTEUR = 'Moteur privé auto-hébergé, sans moteur payant';

/**
 * Catalogue des plans. L'ORDRE est l'ordre d'affichage.
 * Montants en FRANCS CFA (XOF), entiers (pas de centimes).
 */
export const PLANS: readonly PlanAbonnement[] = [
  {
    code: 'gratuit',
    nom: 'Gratuit',
    resume: 'Pour lire et traduire un livre par mois, sans carte.',
    prixXof: 0,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: QUOTA_GRATUIT_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Environ un livre complet par mois (400 000 caractères)',
      'Import .txt, .md, .pdf (texte) et .epub',
      'Traduction vers le français, lecture complète et reprise',
      'Favoris, recherche et exports Markdown, Word et PDF',
    ],
    ordre: 0,
    categorie: 'gratuit',
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
  },
  {
    code: 'essai',
    nom: 'Essai gratuit — 7 jours',
    resume:
      'Tout le confort du plan Passionné pendant 7 jours, plafonné à 3 livres au total.',
    prixXof: 0,
    devise: 'XOF',
    dureeJours: ESSAI_JOURS,
    quotaMensuelCaracteres: QUOTA_PASSIONNE_CARACTERES,
    moteur: 'auto',
    avantages: [
      '7 jours offerts, sans carte ni numéro obligatoire',
      'Même confort que le plan Passionné',
      'Plafonné à 3 livres au total (garde-fou de coût)',
    ],
    ordre: 1,
    categorie: 'essai',
    livresMois: ESSAI_LIVRES_MAX,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: true,
  },
  {
    code: 'lecteur_mensuel',
    nom: 'Lecteur — mensuel',
    resume: '3 livres par mois, confort de lecture et exports.',
    prixXof: 1500,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_LECTEUR_CARACTERES,
    moteur: 'auto',
    avantages: [
      '3 livres traduits par mois',
      'Confort de lecture complet (polices, thème, reprise)',
      'Exports Markdown, Word et PDF',
      'File normale',
    ],
    ordre: 2,
    categorie: 'individuel',
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
  },
  {
    code: 'lecteur_annuel',
    nom: 'Lecteur — annuel',
    resume: '3 livres par mois, payés à l’année (−20 %).',
    prixXof: 14400,
    prixMensuelXof: 1200,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_LECTEUR_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Tous les avantages du plan Lecteur mensuel',
      '14 400 F CFA l’année (au lieu de 18 000)',
      'Soit 1 200 F CFA par mois',
    ],
    ordre: 3,
    categorie: 'individuel',
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
  },
  {
    code: 'passionne_mensuel',
    nom: 'Passionné — mensuel',
    resume: '10 livres par mois, glossaire de personnages et file prioritaire.',
    prixXof: 3500,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_PASSIONNE_CARACTERES,
    moteur: 'auto',
    avantages: [
      '10 livres traduits par mois',
      '2 traductions menées en parallèle',
      'File prioritaire quand la file est chargée',
      'Glossaire de personnages pour les sagas',
    ],
    ordre: 4,
    categorie: 'individuel',
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
  },
  {
    code: 'passionne_annuel',
    nom: 'Passionné — annuel',
    resume: '10 livres par mois, payés à l’année (−20 %).',
    prixXof: 33600,
    prixMensuelXof: 2800,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_PASSIONNE_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Tous les avantages du plan Passionné mensuel',
      '33 600 F CFA l’année (au lieu de 42 000)',
      'Soit 2 800 F CFA par mois',
    ],
    ordre: 5,
    categorie: 'individuel',
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
  },
  {
    code: 'illimite_mensuel',
    nom: 'Illimité — mensuel',
    resume:
      'Volume illimité sous usage raisonnable, 3 traductions en parallèle et file prioritaire.',
    prixXof: 9000,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_ILLIMITE_CARACTERES,
    moteur: 'auto',
    avantages: [
      MENTION_USAGE_RAISONNABLE,
      '3 traductions menées en parallèle',
      'File prioritaire quand la file est chargée',
      'Glossaire de personnages',
    ],
    ordre: 6,
    categorie: 'individuel',
    livresMois: null,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
    usageRaisonnable: true,
  },
  {
    code: 'illimite_annuel',
    nom: 'Illimité — annuel',
    resume: 'Volume illimité sous usage raisonnable, payé à l’année.',
    prixXof: 90000,
    prixMensuelXof: 7500,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_ILLIMITE_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Tous les avantages du plan Illimité mensuel',
      '90 000 F CFA l’année',
      'Soit 7 500 F CFA par mois',
    ],
    ordre: 7,
    categorie: 'individuel',
    livresMois: null,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
    usageRaisonnable: true,
  },
  {
    code: 'etudiant_mensuel',
    nom: 'Étudiant — mensuel',
    resume: '3 livres par mois à tarif réduit — sur justificatif.',
    prixXof: 1200,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_LECTEUR_CARACTERES,
    moteur: 'auto',
    avantages: [
      '3 livres traduits par mois',
      'Confort de lecture complet et exports',
      'Tarif étudiant : vérification du statut requise',
    ],
    ordre: 8,
    categorie: 'etudiant',
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    masque: false,
    verificationRequise: true,
  },
  {
    code: 'groupe_mensuel',
    nom: 'Groupe — mensuel',
    resume: '2 400 F CFA par personne et par mois, 3 personnes minimum.',
    prixXof: 2400,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_LECTEUR_CARACTERES,
    moteur: 'auto',
    avantages: [
      '2 400 F CFA par personne et par mois',
      '3 personnes minimum (un seul payeur)',
      '3 livres par mois et par personne',
      'Glossaire partagé et file prioritaire',
    ],
    ordre: 9,
    categorie: 'groupe',
    livresMois: 3,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 3,
    parPersonne: true,
    masque: false,
  },
  {
    code: 'ecole_annuel',
    nom: 'École — annuel',
    resume:
      '1 800 F CFA par personne et par mois, facturé à l’année (11 personnes minimum).',
    prixXof: 21600,
    prixMensuelXof: 1800,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_PASSIONNE_CARACTERES,
    moteur: 'auto',
    avantages: [
      '1 800 F CFA par personne et par mois',
      'Facturé annuellement : 21 600 F CFA par personne et par an',
      '11 personnes minimum (un seul payeur)',
      '10 livres par mois et par personne, 3 traductions en parallèle',
    ],
    ordre: 10,
    categorie: 'ecole',
    livresMois: 10,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 11,
    parPersonne: true,
    masque: false,
  },
  // ---- Alias de compatibilité (historiques, masqués) ----
  {
    code: 'premium_mensuel',
    nom: 'Premium — mensuel (historique)',
    resume: 'Offre historique conservée : même accès qu’un plan Passionné.',
    prixXof: 3000,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: QUOTA_PREMIUM_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Conservé pour l’historique et le panneau d’administration',
      'Accès équivalent à un plan Passionné',
    ],
    ordre: 90,
    categorie: 'legacy',
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: true,
    aliasDe: 'passionne_mensuel',
  },
  {
    code: 'premium_annuel',
    nom: 'Premium — annuel (historique)',
    resume: 'Offre historique conservée : même accès qu’un plan Passionné annuel.',
    prixXof: 30000,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: QUOTA_PREMIUM_CARACTERES,
    moteur: 'auto',
    avantages: [
      'Conservé pour l’historique et le panneau d’administration',
      'Accès équivalent à un plan Passionné annuel',
    ],
    ordre: 91,
    categorie: 'legacy',
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    masque: true,
    aliasDe: 'passionne_annuel',
  },
];

/** Tous les plans, triés par ordre d'affichage. */
export function tousLesPlans(): readonly PlanAbonnement[] {
  return [...PLANS].sort((a, b) => a.ordre - b.ordre);
}

/** Catalogue PUBLIC (hors essai interne et alias historiques). */
export function plansPublics(): readonly PlanAbonnement[] {
  return tousLesPlans().filter((p) => !p.masque);
}

/** Les plans payants (souscriptibles par Mobile Money). */
export function plansPayants(): readonly PlanAbonnement[] {
  return plansPublics().filter((p) => p.prixXof > 0);
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

/** Vrai si le plan est payant (donc achetable). */
export function estPlanPremium(plan: PlanAbonnement | null | undefined): boolean {
  return !!plan && plan.prixXof > 0;
}

/** Alias explicite : un plan payant (souscription possible). */
export const estPlanPayant = estPlanPremium;

/**
 * Vrai si le plan DONNE un accès supérieur au gratuit (quota élargi) :
 * c'est le cas des plans payants ET de l'essai.
 */
export function accesPremium(plan: PlanAbonnement | null | undefined): boolean {
  if (!plan) return false;
  return plan.code !== CODE_PLAN_GRATUIT;
}

/** Vrai si le code correspond à un plan payant. */
export function estCodePremium(valeur: unknown): boolean {
  return estPlanPremium(planParCode(typeof valeur === 'string' ? valeur : null));
}

/** Vrai si le code est un alias historique. */
export function estAliasHistorique(valeur: unknown): boolean {
  const plan = planParCode(typeof valeur === 'string' ? valeur : null);
  return !!plan?.aliasDe;
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

/** Période de l'essai gratuit (ESSAI_JOURS jours). */
export function periodeEssai(debut: Date = new Date()): PeriodeAbonnement {
  return periodeDepuis(ESSAI_JOURS, debut);
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
  /** Fin de l'essai gratuit (NULL hors essai). */
  essai_fin?: string | null;
  /** Livres consommés pendant l'essai (plafond ESSAI_LIVRES_MAX). */
  essai_livres_utilises?: number;
  /** Vrai si le statut étudiant a été vérifié (plan étudiant). */
  verification_etudiant?: boolean;
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
    essai_fin: null,
    essai_livres_utilises: 0,
  };
}

// ------------------------------------------------------------
// Essai gratuit (7 jours, 3 livres)
// ------------------------------------------------------------

/** Vrai si l'essai est EN COURS (plan essai, statut actif, non échu). */
export function essaiActif(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): boolean {
  if (!abonnement) return false;
  if (abonnement.plan !== CODE_PLAN_ESSAI) return false;
  if (abonnement.statut !== 'actif') return false;
  const fin = abonnement.essai_fin ?? abonnement.periode_fin;
  if (!fin) return false;
  return new Date(fin).getTime() > maintenant.getTime();
}

/** Vrai si l'essai existe mais est ÉCHU (donc « basculé en gratuit »). */
export function essaiEchu(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): boolean {
  if (!abonnement || abonnement.plan !== CODE_PLAN_ESSAI) return false;
  const fin = abonnement.essai_fin ?? abonnement.periode_fin;
  if (!fin) return false;
  return new Date(fin).getTime() <= maintenant.getTime();
}

/** Livres restants dans l'essai (jamais négatif). */
export function essaiLivresRestants(
  abonnement: Abonnement | null | undefined
): number {
  const utilises = abonnement?.essai_livres_utilises ?? 0;
  return Math.max(ESSAI_LIVRES_MAX - utilises, 0);
}

/**
 * Code de plan EFFECTIF d'un compte : l'essai prime tant qu'il court,
 * et un abonnement échu (essai compris) retombe sur `gratuit` — la
 * bibliothèque et les traductions, elles, ne sont jamais touchées.
 */
export function planEffectifCode(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): CodePlan {
  if (essaiActif(abonnement, maintenant)) return CODE_PLAN_ESSAI;
  if (!abonnement) return CODE_PLAN_GRATUIT;
  const statut = statutEffectif(abonnement, maintenant);
  if (statut !== 'actif') return CODE_PLAN_GRATUIT;
  const plan = planParCode(abonnement.plan);
  return plan ? plan.code : CODE_PLAN_GRATUIT;
}

/** Plan EFFECTIF (objet) d'un compte. */
export function planEffectif(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): PlanAbonnement {
  return (
    planParCode(planEffectifCode(abonnement, maintenant)) ??
    planParCode(CODE_PLAN_GRATUIT)!
  );
}

// ------------------------------------------------------------
// Avantages (quota de caractères)
// ------------------------------------------------------------

/**
 * Quota mensuel effectif pour un plan, sachant un plafond de base
 * (celui de l'environnement). On ne réduit JAMAIS le plafond de base.
 * C'est la règle miroir de public.limite_abonnement.
 */
export function quotaPourPlan(
  plan: PlanAbonnement | null | undefined,
  quotaBase: number
): number {
  const base =
    Number.isFinite(quotaBase) && quotaBase > 0 ? quotaBase : QUOTA_GRATUIT_CARACTERES;
  const planQuota = plan?.quotaMensuelCaracteres ?? 0;
  return Math.max(base, planQuota);
}

/**
 * Moteur recommandé pour un plan — TOUJOURS 'auto' (chaîne de moteurs
 * gratuits). Jamais affiché dans l'interface.
 */
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

/**
 * Libellé de prix COMPLET : « 2 400 F CFA / personne / mois »,
 * « 21 600 F CFA / personne / an (1 800 F CFA par mois) », etc.
 */
export function libellePrixDetaille(plan: PlanAbonnement): string {
  if (plan.prixXof <= 0) return 'Gratuit';
  const prix = libellePrix(plan);
  const parPersonne = plan.parPersonne ? ' / personne' : '';
  const period = libellePeriodicite(plan);
  const base = `${prix}${parPersonne}${period ? ` ${period}` : ''}`;
  if (plan.dureeJours >= 360 && plan.prixMensuelXof) {
    return `${base} (soit ${plan.prixMensuelXof.toLocaleString('fr-FR')} F CFA / mois)`;
  }
  return base;
}

/**
 * Conditions à afficher sous un plan (étudiant, groupe, école,
 * usage raisonnable). Renvoie [] si aucune condition particulière.
 */
export function conditionsPlan(plan: PlanAbonnement): string[] {
  const conditions: string[] = [];
  if (plan.verificationRequise) {
    conditions.push('Vérification du statut étudiant requise (justificatif).');
  }
  if (plan.minPersonnes > 1) {
    conditions.push(`${plan.minPersonnes} personnes minimum, un seul payeur.`);
  }
  if (plan.usageRaisonnable) {
    conditions.push(MENTION_USAGE_RAISONNABLE + '.');
  }
  return conditions;
}
