// ============================================================
// lib/abonnement.ts — Modèle d'abonnement : LOGIQUE partagée (P0.9).
//
// SOURCE DE VÉRITÉ = public.plans_abonnement (base de production).
//   * la LECTURE SERVEUR du catalogue (base → PlanAbonnement) et les
//     politiques de vente (plan masqué / legacy / essai / verrouillé)
//     vivent dans lib/plans-catalogue.ts ;
//   * ce fichier ne garde que la LOGIQUE : types, éligibilité
//     (packs, premium), calcul de période, statuts, libellés ;
//   * le catalogue embarqué ci-dessous n'est PAS maintenu à la main :
//     c'est un SNAPSHOT GÉNÉRÉ depuis la base (voir le bandeau
//     « GÉNÉRÉ » plus bas et scripts/_plans-generer-snapshot.mjs).
//     Il sert de valeur par défaut aux fonctions synchrones (affichage
//     navigateur / composants historiques), tandis que les points
//     serveur (route API, tunnel de paiement) lisent la base en direct.
//
// Les prix sont en FRANCS CFA (XOF) : la clientèle visée paie en
// Mobile Money (zone UEMOA). Le mode par défaut reste la SIMULATION.
// ============================================================

import type { IdFournisseur } from './types';

/** Famille d'une offre, reprise de la colonne `categorie` de la base. */
export type CategoriePlan =
  | 'gratuit'
  | 'essai'
  | 'individuel'
  | 'etudiant'
  | 'groupe'
  | 'ecole'
  | 'legacy'
  | 'pack';

/**
 * Code d'un plan. Reflète les lignes de public.plans_abonnement
 * (13 plans) plus les 4 packs de crédits de public.packs_credits.
 */
export type CodePlan =
  | 'gratuit'
  | 'essai' // essai gratuit de 7 jours, attribué automatiquement à l'inscription
  | 'lecteur_mensuel'
  | 'lecteur_annuel'
  | 'passionne_mensuel'
  | 'passionne_annuel'
  | 'illimite_mensuel'
  | 'illimite_annuel'
  | 'etudiant_mensuel'
  | 'groupe_mensuel'
  | 'ecole_annuel'
  | 'premium_mensuel' // LEGACY (masqué, aliasé sur passionne_mensuel) — non vendable
  | 'premium_annuel' // LEGACY — non vendable
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
  /** Prix en francs CFA (0 = gratuit). Porté par la base. */
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
  // ---- Champs de capacité et de vente (colonne de la base) ----
  /** Famille de l'offre (gratuit / individuel / etudiant / legacy…). */
  categorie?: CategoriePlan;
  /** Faux si la ligne est désactivée en base (actif = false). */
  actif?: boolean;
  /** Vrai si l'offre ne doit jamais être proposée publiquement. */
  masque?: boolean;
  /** Code de l'offre de remplacement (plan legacy aliasé). */
  aliasDe?: string | null;
  /** Plafond de livres par mois (garde-fou de coût ; null = non plafonné). */
  livresMois?: number | null;
  /** Traductions menées en parallèle. */
  traductionsSimultanees?: number;
  /** File prioritaire quand la file est chargée. */
  filePrioritaire?: boolean;
  /** Glossaire de personnages (sagas). */
  glossaire?: boolean;
  /** Nombre minimum de personnes (offres groupe / école). */
  minPersonnes?: number;
  /** Vrai si le prix est PAR PERSONNE (groupe / école). */
  parPersonne?: boolean;
  /** Vrai si l'achat exige une vérification de statut (étudiant). */
  verificationRequise?: boolean;
  /** Vrai si l'usage raisonnable s'applique (anti-abus). */
  usageRaisonnable?: boolean;
  /** Prix mensuel équivalent (formules annuelles −20 %). */
  prixMensuelXof?: number | null;
}

/** Code du plan gratuit (par défaut). */
export const CODE_PLAN_GRATUIT: CodePlan = 'gratuit';

/** Code du plan d'ESSAI, attribué automatiquement à l'inscription. */
export const CODE_PLAN_ESSAI: CodePlan = 'essai';

/**
 * Quota de l'essai gratuit, aligné sur public.plans_abonnement (plan
 * « Essai gratuit — 7 jours », 4 000 000 caractères).
 */
export const QUOTA_ESSAI_CARACTERES = 4_000_000;

/** Durée de l'essai gratuit, en jours (plan `essai`). */
export const DUREE_ESSAI_JOURS = 7;

/**
 * Plan utilisé pour les attributions administrateur — le code LEGACY
 * `premium_mensuel` reste la clé écrite par public.attribuer_abonnement
 * (SQL de la base) et par le panneau admin (hors périmètre de ce lot).
 */
export const CODE_PLAN_PREMIUM: CodePlan = 'premium_mensuel';

/**
 * Plafond par défaut du plan gratuit (caractères/mois) — aligné sur la
 * règle « un livre complet par mois » annoncée publiquement.
 */
export const QUOTA_GRATUIT_CARACTERES = 400_000;

/**
 * Plafond historique « Premium » (caractères/mois) — ANCIEN plan
 * `premium_mensuel`, conservé pour compatibilité des scripts ; la
 * grille publique s'appuie désormais sur les quotas lus en base.
 */
export const QUOTA_PREMIUM_CARACTERES = 3_000_000;

// ============================================================
// SNAPSHOT GÉNÉRÉ DU CATALOGUE — NE PAS ÉDITER À LA MAIN.
//
// Produit par `node scripts/_plans-generer-snapshot.mjs` à partir de
// public.plans_abonnement + public.packs_credits. Régénérer après tout
// changement du catalogue en base. Une vérification
// (scripts/_plans-preuve-1-catalogue.ts) compare ce snapshot à la base.
// ============================================================
// <GENERE-DEBUT>
export const PLANS_GENERES: readonly PlanAbonnement[] = [
  {
    code: "gratuit",
    nom: "Gratuit",
    resume: "Pour lire et traduire un livre par mois, sans carte.",
    prixXof: 0,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 400000,
    moteur: "auto",
    avantages: ["Environ un livre complet par mois (400 000 caractères)","Import .txt, .md, .pdf (texte) et .epub","Traduction vers le français, lecture complète et reprise","Favoris, recherche et exports Markdown, Word et PDF"],
    ordre: 0,
    categorie: "gratuit",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "essai",
    nom: "Essai gratuit — 7 jours",
    resume: "Tout le confort du plan Passionné pendant 7 jours, plafonné à 3 livres au total.",
    prixXof: 0,
    devise: 'XOF',
    dureeJours: 7,
    quotaMensuelCaracteres: 4000000,
    moteur: "auto",
    avantages: ["7 jours offerts, sans carte ni numéro obligatoire","Même confort que le plan Passionné","Plafonné à 3 livres au total (garde-fou de coût)"],
    ordre: 1,
    categorie: "essai",
    actif: true,
    masque: true,
    aliasDe: null,
    livresMois: 3,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "lecteur_mensuel",
    nom: "Lecteur — mensuel",
    resume: "3 livres par mois, confort de lecture et exports.",
    prixXof: 1500,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 1200000,
    moteur: "auto",
    avantages: ["3 livres traduits par mois","Confort de lecture complet (polices, thème, reprise)","Exports Markdown, Word et PDF","File normale"],
    ordre: 2,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "lecteur_annuel",
    nom: "Lecteur — annuel",
    resume: "3 livres par mois, payés à l’année (−20 %).",
    prixXof: 14400,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: 1200000,
    moteur: "auto",
    avantages: ["Tous les avantages du plan Lecteur mensuel","14 400 F CFA l’année (au lieu de 18 000)","Soit 1 200 F CFA par mois"],
    ordre: 3,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: 1200,
  },
  {
    code: "passionne_mensuel",
    nom: "Passionné — mensuel",
    resume: "10 livres par mois, glossaire de personnages et file prioritaire.",
    prixXof: 3500,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 4000000,
    moteur: "auto",
    avantages: ["10 livres traduits par mois","2 traductions menées en parallèle","File prioritaire quand la file est chargée","Glossaire de personnages pour les sagas"],
    ordre: 4,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "passionne_annuel",
    nom: "Passionné — annuel",
    resume: "10 livres par mois, payés à l’année (−20 %).",
    prixXof: 33600,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: 4000000,
    moteur: "auto",
    avantages: ["Tous les avantages du plan Passionné mensuel","33 600 F CFA l’année (au lieu de 42 000)","Soit 2 800 F CFA par mois"],
    ordre: 5,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: 2800,
  },
  {
    code: "illimite_mensuel",
    nom: "Illimité — mensuel",
    resume: "Volume illimité sous usage raisonnable, 3 traductions en parallèle et file prioritaire.",
    prixXof: 9000,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 25000000,
    moteur: "auto",
    avantages: ["Volume illimité, sous usage raisonnable (jusqu’à 25 000 000 caractères par mois)","3 traductions menées en parallèle","File prioritaire quand la file est chargée","Glossaire de personnages"],
    ordre: 6,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: true,
    prixMensuelXof: null,
  },
  {
    code: "illimite_annuel",
    nom: "Illimité — annuel",
    resume: "Volume illimité sous usage raisonnable, payé à l’année.",
    prixXof: 90000,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: 25000000,
    moteur: "auto",
    avantages: ["Tous les avantages du plan Illimité mensuel","90 000 F CFA l’année","Soit 7 500 F CFA par mois"],
    ordre: 7,
    categorie: "individuel",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: true,
    prixMensuelXof: 7500,
  },
  {
    code: "etudiant_mensuel",
    nom: "Étudiant — mensuel",
    resume: "3 livres par mois à tarif réduit — sur justificatif.",
    prixXof: 1200,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 1200000,
    moteur: "auto",
    avantages: ["3 livres traduits par mois","Confort de lecture complet et exports","Tarif étudiant : vérification du statut requise"],
    ordre: 8,
    categorie: "etudiant",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 3,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: true,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "groupe_mensuel",
    nom: "Groupe — mensuel",
    resume: "2 400 F CFA par personne et par mois, 3 personnes minimum.",
    prixXof: 2400,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 1200000,
    moteur: "auto",
    avantages: ["2 400 F CFA par personne et par mois","3 personnes minimum (un seul payeur)","3 livres par mois et par personne","Glossaire partagé et file prioritaire"],
    ordre: 9,
    categorie: "groupe",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 3,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 3,
    parPersonne: true,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "ecole_annuel",
    nom: "École — annuel",
    resume: "1 800 F CFA par personne et par mois, facturé à l’année (11 personnes minimum).",
    prixXof: 21600,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: 4000000,
    moteur: "auto",
    avantages: ["1 800 F CFA par personne et par mois","Facturé annuellement : 21 600 F CFA par personne et par an","11 personnes minimum (un seul payeur)","10 livres par mois et par personne, 3 traductions en parallèle"],
    ordre: 10,
    categorie: "ecole",
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: 10,
    traductionsSimultanees: 3,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 11,
    parPersonne: true,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: 1800,
  },
  {
    code: "premium_mensuel",
    nom: "Premium — mensuel (historique)",
    resume: "Offre historique conservée : même accès qu’un plan Passionné.",
    prixXof: 3000,
    devise: 'XOF',
    dureeJours: 30,
    quotaMensuelCaracteres: 3000000,
    moteur: "auto",
    avantages: ["Conservé pour l’historique et le panneau d’administration","Accès équivalent à un plan Passionné"],
    ordre: 90,
    categorie: "legacy",
    actif: true,
    masque: true,
    aliasDe: "passionne_mensuel",
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "premium_annuel",
    nom: "Premium — annuel (historique)",
    resume: "Offre historique conservée : même accès qu’un plan Passionné annuel.",
    prixXof: 30000,
    devise: 'XOF',
    dureeJours: 365,
    quotaMensuelCaracteres: 3000000,
    moteur: "auto",
    avantages: ["Conservé pour l’historique et le panneau d’administration","Accès équivalent à un plan Passionné annuel"],
    ordre: 91,
    categorie: "legacy",
    actif: true,
    masque: true,
    aliasDe: "passionne_annuel",
    livresMois: 10,
    traductionsSimultanees: 2,
    filePrioritaire: true,
    glossaire: true,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "credits_250",
    nom: "Pack Découverte",
    resume: "Un premier roman traduit, sans engagement.",
    prixXof: 500,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 250000,
    avantages: ["Un premier roman traduit, sans engagement."],
    ordre: 10,
    categorie: 'pack',
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "credits_600",
    nom: "Pack Lecteur",
    resume: "Deux à trois romans — le meilleur rapport qualité/prix.",
    prixXof: 1000,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 600000,
    avantages: ["Deux à trois romans — le meilleur rapport qualité/prix."],
    ordre: 11,
    categorie: 'pack',
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "credits_1800",
    nom: "Pack Bibliothèque",
    resume: "Une saga complète, chapitre après chapitre.",
    prixXof: 2500,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 1800000,
    avantages: ["Une saga complète, chapitre après chapitre."],
    ordre: 12,
    categorie: 'pack',
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
  {
    code: "credits_4000",
    nom: "Pack Collection",
    resume: "Pour les gros lecteurs : jamais à court de caractères.",
    prixXof: 5000,
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: 4000000,
    avantages: ["Pour les gros lecteurs : jamais à court de caractères."],
    ordre: 13,
    categorie: 'pack',
    actif: true,
    masque: false,
    aliasDe: null,
    livresMois: null,
    traductionsSimultanees: 1,
    filePrioritaire: false,
    glossaire: false,
    minPersonnes: 1,
    parPersonne: false,
    verificationRequise: false,
    usageRaisonnable: false,
    prixMensuelXof: null,
  },
];
// <GENERE-FIN>

// ============================================================
// Catalogue courant (mémoire du serveur / valeur par défaut).
// Le serveur peut l'hydrater depuis la base via definirCatalogue().
// ============================================================
let CATALOGUE: readonly PlanAbonnement[] = PLANS_GENERES;

/** Remplace le catalogue courant (ex. après lecture de la base). */
export function definirCatalogue(plans: readonly PlanAbonnement[]): void {
  CATALOGUE = plans;
}

/** Catalogue courant (snapshot généré par défaut). */
export function catalogueCourant(): readonly PlanAbonnement[] {
  return CATALOGUE;
}

/** Tous les plans, triés par ordre d'affichage. */
export function tousLesPlans(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return [...source].sort((a, b) => a.ordre - b.ordre);
}

/** Les plans payants (souscriptibles par Mobile Money), packs compris. */
export function plansPayants(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return tousLesPlans(source).filter((p) => p.prixXof > 0);
}

/** Les plans d'ABONNEMENT (hors packs de crédits), triés. */
export function plansAbonnement(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return tousLesPlans(source).filter((p) => !estPackCredits(p));
}

/**
 * Vrai si l'offre fait partie de la GRILLE PUBLIQUE (les 4 offres
 * mensuelles vendables : Gratuit, Lecteur, Passionné, Illimité).
 * Écarte l'essai, les plans masqués/legacy, les annuelles (variantes de
 * la carte du mensuel) et les offres étudiant/groupe/école.
 */
export function estOffrePublique(plan: PlanAbonnement | null | undefined): boolean {
  if (!plan || estPackCredits(plan)) return false;
  if (plan.actif === false) return false;
  if (plan.masque === true) return false;
  if (plan.aliasDe) return false;
  if (plan.categorie === 'legacy' || plan.categorie === 'essai') return false;
  return (
    (plan.categorie === 'gratuit' || plan.categorie === 'individuel') &&
    plan.dureeJours < 360
  );
}

/** Les offres de la grille publique, triées. */
export function offresPubliques(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return tousLesPlans(source).filter(estOffrePublique);
}

/** Les « autres offres » (étudiant / groupe / école) : non vendables en ligne. */
export function autresOffres(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return tousLesPlans(source).filter(
    (p) =>
      !estPackCredits(p) &&
      p.actif !== false &&
      p.masque !== true &&
      !p.aliasDe &&
      p.categorie !== 'legacy' &&
      (p.categorie === 'etudiant' ||
        p.categorie === 'groupe' ||
        p.categorie === 'ecole')
  );
}

/**
 * Variante annuelle d'une offre mensuelle (variante −20 %), ou null.
 * La correspondance se fait sur le code : `lecteur_mensuel` →
 * `lecteur_annuel`.
 */
export function annuellePour(
  mensuel: PlanAbonnement | null | undefined,
  source: readonly PlanAbonnement[] = CATALOGUE
): PlanAbonnement | null {
  if (!mensuel) return null;
  const base = mensuel.code.replace(/_mensuel$/, '');
  if (base === mensuel.code) return null;
  return tousLesPlans(source).find((p) => p.code === `${base}_annuel`) ?? null;
}

/**
 * Plans à MONTRER dans la grille « changer d'offre » — désormais la
 * grille publique (les 4 offres). L'essai est attribué automatiquement,
 * les annuelles sont des variantes, les offres étudiant/groupe/école
 * vivent dans « autres offres ».
 */
export function plansAbonnementAffiches(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return offresPubliques(source);
}

/** Vrai si le plan est l'essai gratuit attribué à l'inscription. */
export function estPlanEssai(
  plan: PlanAbonnement | null | undefined
): boolean {
  return !!plan && plan.code === CODE_PLAN_ESSAI;
}

/** Les PACKS DE CRÉDITS prépayés, triés par ordre d'affichage. */
export function packsCredits(
  source: readonly PlanAbonnement[] = CATALOGUE
): readonly PlanAbonnement[] {
  return tousLesPlans(source).filter((p) => estPackCredits(p));
}

/**
 * Retrouve un plan (ou un pack) par son code, ou null. Résout TOUS les
 * codes connus, y compris l'essai et les lignes legacy : c'est la
 * fonction d'AFFICHAGE (offre en cours, historique).
 */
export function planParCode(
  code: string | null | undefined,
  source: readonly PlanAbonnement[] = CATALOGUE
): PlanAbonnement | null {
  if (!code) return null;
  return source.find((p) => p.code === code) ?? null;
}

/** Vrai si la chaîne est un code de plan connu (offre OU pack). */
export function estCodePlan(valeur: unknown): valeur is CodePlan {
  return typeof valeur === 'string' && CATALOGUE.some((p) => p.code === valeur);
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
 * n'ouvrent aucun droit récurrent. (Sert aussi à l'AFFICHAGE du badge
 * « Premium » : on ne le restreint pas aux seules offres vendables.)
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

/**
 * Code du plan RÉELLEMENT EN VIGUEUR, ou null si l'abonnement n'est pas
 * actif (expiré, résilié, en attente, échec…). À utiliser PARTOUT où une
 * décision dépend de l'offre (quota effectif, avantages) : une offre
 * échue ne doit JAMAIS accorder ses avantages, même si la ligne stockée
 * porte encore `statut = 'actif'` (défense en profondeur ; le cron de
 * réconciliation peut avoir du retard, la base peut être restaurée).
 */
export function planEnVigueur(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): CodePlan | null {
  if (!abonnement) return null;
  if (statutEffectif(abonnement, maintenant) !== 'actif') return null;
  return abonnement.plan;
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
 * on prend le PLUS GRAND des deux. C'est le miroir EXACT de
 * public.limite_abonnement (SQL) : `greatest(coalesce(p_limite,0), quota)`.
 */
export function quotaPourPlan(
  plan: PlanAbonnement | null | undefined,
  quotaBase: number
): number {
  const base =
    Number.isFinite(quotaBase) && quotaBase > 0
      ? quotaBase
      : QUOTA_GRATUIT_CARACTERES;
  if (!plan) return base;
  const quotaPlan = Number.isFinite(plan.quotaMensuelCaracteres)
    ? Math.max(Math.trunc(plan.quotaMensuelCaracteres), 0)
    : 0;
  return Math.max(base, quotaPlan);
}

/** Plafond de LIVRES par mois d'un plan (null = non plafonné). */
export function livresParMois(plan: PlanAbonnement | null | undefined): number | null {
  const n = plan?.livresMois;
  return typeof n === 'number' && n > 0 ? n : null;
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

/**
 * « 600 000 caractères » — volume de traduction, lisible.
 * Sert aux packs de crédits (le chiffre est l'argument de vente).
 */
export function libelleCaracteres(n: number): string {
  const valeur = Number.isFinite(n) ? Math.max(Math.trunc(n), 0) : 0;
  return `${valeur.toLocaleString('fr-FR')} caractères`;
}

/** Forme compacte : « 1,8 M caractères », « 250 k caractères ». */
export function libelleCaracteresCourt(n: number): string {
  const valeur = Number.isFinite(n) ? Math.max(Math.trunc(n), 0) : 0;
  if (valeur >= 1_000_000) {
    const m = valeur / 1_000_000;
    const arrondi = Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ',');
    return `${arrondi} M caractères`;
  }
  if (valeur >= 1_000) {
    const k = Math.round(valeur / 1_000);
    return `${k.toLocaleString('fr-FR')} k caractères`;
  }
  return libelleCaracteres(valeur);
}

/**
 * Estimation en « romans », pour donner une échelle concrète à un pack.
 * Repère affiché partout ailleurs : ~600 000 caractères par roman.
 * Renvoie null sous un demi-roman (on préfère alors ne rien promettre).
 */
export function estimationRomans(caracteres: number): number | null {
  if (!Number.isFinite(caracteres) || caracteres <= 0) return null;
  const romans = caracteres / 600_000;
  if (romans < 0.5) return null;
  return Math.max(1, Math.round(romans));
}

/** « ≈ 3 romans » / « ≈ 1 roman » (chaîne vide si non estimable). */
export function libelleEstimationRomans(caracteres: number): string {
  const romans = estimationRomans(caracteres);
  if (romans === null) return '';
  return `≈ ${romans.toLocaleString('fr-FR')} roman${romans > 1 ? 's' : ''}`;
}
