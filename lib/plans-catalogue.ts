// ============================================================
// lib/plans-catalogue.ts — LECTURE SERVEUR du catalogue + RÈGLES DE VENTE.
//
// La base public.plans_abonnement (et public.packs_credits) est la
// SOURCE DE VÉRITÉ. Ce module :
//   * mappe une ligne de la base → PlanAbonnement (aucune valeur de
//     prix / durée / quota en dur) ;
//   * lit le catalogue via un client Supabase (route API, tunnel) ;
//   * applique les politiques de vente : un code inconnu, inactif,
//     masqué, legacy, aliasé, « essai », hors-ligne (étudiant/groupe/
//     école) ou VERROUILLÉ (Illimité) n'est JAMAIS achetable en ligne.
//
// Aucune dépendance runtime lourde : le type SupabaseClient est importé
// en « type only » (effacé au build), ce qui permet d'importer ce module
// aussi bien depuis les routes Next que depuis un script de preuve.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  definirCatalogue,
  estPackCredits,
  tousLesPlans,
  type CategoriePlan,
  type CodePlan,
  type PlanAbonnement,
} from './abonnement';

// ------------------------------------------------------------
// Forme des lignes de la base (snake_case)
// ------------------------------------------------------------

/** Ligne de public.plans_abonnement. */
export interface LignePlanBase {
  code: string;
  nom: string;
  resume: string | null;
  prix_xof: number;
  devise: string;
  duree_jours: number;
  quota_mensuel_caracteres: number | string;
  moteur: string;
  avantages: unknown;
  ordre: number;
  actif: boolean;
  categorie: string;
  livres_mois: number | null;
  traductions_simultanees: number;
  file_prioritaire: boolean;
  glossaire: boolean;
  min_personnes: number;
  par_personne: boolean;
  masque: boolean;
  alias_de: string | null;
  verification_requise: boolean;
  usage_raisonnable: boolean;
  prix_mensuel_xof: number | null;
}

/** Ligne de public.packs_credits. */
export interface LignePackBase {
  code: string;
  nom: string;
  avantage: string | null;
  caracteres: number | string;
  prix_xof: number;
  devise: string;
  ordre: number;
  actif: boolean;
}

/** Colonnes lues sur public.plans_abonnement. */
export const COLONNES_PLAN =
  'code,nom,resume,prix_xof,devise,duree_jours,quota_mensuel_caracteres,moteur,' +
  'avantages,ordre,actif,categorie,livres_mois,traductions_simultanees,' +
  'file_prioritaire,glossaire,min_personnes,par_personne,masque,alias_de,' +
  'verification_requise,usage_raisonnable,prix_mensuel_xof';

/** Colonnes lues sur public.packs_credits. */
export const COLONNES_PACK =
  'code,nom,avantage,caracteres,prix_xof,devise,ordre,actif';

function nombre(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Mappe une ligne de la base vers le modèle partagé. */
export function planDepuisLigne(l: LignePlanBase): PlanAbonnement {
  return {
    code: l.code as CodePlan,
    nom: l.nom,
    resume: l.resume ?? '',
    prixXof: nombre(l.prix_xof),
    devise: 'XOF',
    dureeJours: nombre(l.duree_jours),
    quotaMensuelCaracteres: nombre(l.quota_mensuel_caracteres),
    moteur: (l.moteur as PlanAbonnement['moteur']) ?? 'auto',
    avantages: Array.isArray(l.avantages) ? (l.avantages as string[]) : [],
    ordre: nombre(l.ordre),
    categorie: (l.categorie as CategoriePlan) ?? 'individuel',
    actif: l.actif !== false,
    masque: l.masque === true,
    aliasDe: l.alias_de ?? null,
    livresMois: l.livres_mois ?? null,
    traductionsSimultanees: nombre(l.traductions_simultanees) || 1,
    filePrioritaire: l.file_prioritaire === true,
    glossaire: l.glossaire === true,
    minPersonnes: nombre(l.min_personnes) || 1,
    parPersonne: l.par_personne === true,
    verificationRequise: l.verification_requise === true,
    usageRaisonnable: l.usage_raisonnable === true,
    prixMensuelXof: l.prix_mensuel_xof ?? null,
  };
}

/** Mappe une ligne de pack vers le modèle partagé (marqueur : `caracteres`). */
export function packDepuisLigne(l: LignePackBase): PlanAbonnement {
  return {
    code: l.code as CodePlan,
    nom: l.nom,
    resume: l.avantage ?? '',
    prixXof: nombre(l.prix_xof),
    devise: 'XOF',
    dureeJours: 0,
    quotaMensuelCaracteres: 0,
    moteur: 'auto',
    caracteres: nombre(l.caracteres),
    avantages: l.avantage ? [l.avantage] : [],
    ordre: nombre(l.ordre),
    categorie: 'pack',
    actif: l.actif !== false,
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
  };
}

export function plansDepuisLignes(lignes: readonly LignePlanBase[]): PlanAbonnement[] {
  return lignes.map(planDepuisLigne);
}

export function packsDepuisLignes(lignes: readonly LignePackBase[]): PlanAbonnement[] {
  return lignes.map(packDepuisLigne);
}

/** Catalogue serveur : plans d'abonnement + packs de crédits. */
export interface CatalogueCatalogue {
  plans: PlanAbonnement[];
  packs: PlanAbonnement[];
  /** Faux si les packs n'ont pas pu être lus (RLS anon par ex.). */
  packsLus: boolean;
}

/** Fusionne plans + packs pour l'affichage / la résolution de code. */
export function catalogueComplet(c: CatalogueCatalogue): PlanAbonnement[] {
  return [...c.plans, ...c.packs];
}

/**
 * Lit le catalogue depuis la base (client Supabase) ET hydrate le
 * catalogue courant de lib/abonnement.ts, pour que les fonctions
 * synchrones d'affichage reflètent la base.
 */
export async function lireCatalogue(
  supabase: SupabaseClient
): Promise<CatalogueCatalogue> {
  const [plansRes, packsRes] = await Promise.all([
    supabase.from('plans_abonnement').select(COLONNES_PLAN).order('ordre'),
    supabase.from('packs_credits').select(COLONNES_PACK).order('ordre'),
  ]);

  if (plansRes.error) {
    throw new Error(`Catalogue (plans_abonnement) : ${plansRes.error.message}`);
  }
  const plans = plansDepuisLignes(
    (plansRes.data ?? []) as unknown as LignePlanBase[]
  );

  // Les packs sont un catalogue SECOND ; une base non migrée ou la RLS
  // anon ne doivent pas casser la lecture des plans d'abonnement.
  let packs: PlanAbonnement[] = [];
  const packsLus = !packsRes.error;
  if (packsLus) {
    packs = packsDepuisLignes((packsRes.data ?? []) as unknown as LignePackBase[]);
  }

  const catalogue: CatalogueCatalogue = { plans, packs, packsLus };
  definirCatalogue(catalogueComplet(catalogue));
  return catalogue;
}

// ------------------------------------------------------------
// Politiques de vente
// ------------------------------------------------------------

/** Codes de l'offre Illimité (vente verrouillée par défaut). */
export const CODES_ILLIMITE: readonly CodePlan[] = [
  'illimite_mensuel',
  'illimite_annuel',
];

/**
 * Vrai si la vente de l'Illimité est VERROUILLÉE. Verrouillée par défaut ;
 * s'ouvre uniquement si la variable d'environnement `PLANS_VENTE_ILLIMITE`
 * vaut exactement 'true' (le jour où LibreTranslate auto-hébergé portera
 * la charge — voir chantier A1→A5). 9 000 F pour 25 M caractères ≈ 10 000 F
 * de coût moteur : vente à perte tant que le moteur privé n'est pas là.
 */
export function illimiteVerrouille(): boolean {
  return process.env.PLANS_VENTE_ILLIMITE !== 'true';
}

/** Vrai si le code est une offre Illimité (mensuel ou annuel). */
export function estCodeIllimite(code: string | null | undefined): boolean {
  return !!code && code.startsWith('illimite');
}

/** Motif de refus d'un achat en ligne. */
export type MotifRefusAchat =
  | 'inconnu'
  | 'inactif'
  | 'masque'
  | 'legacy'
  | 'alias'
  | 'essai'
  | 'hors_ligne'
  | 'gratuit'
  | 'illimite_verrouille';

/** Libellés (journalisation / messages serveur). */
export const LIBELLE_REFUS: Record<MotifRefusAchat, string> = {
  inconnu: 'Code de plan inconnu.',
  inactif: 'Cette offre est désactivée.',
  masque: 'Cette offre n’est pas proposée.',
  legacy: 'Cette offre a été retirée du catalogue.',
  alias: 'Cette offre a été remplacée par une autre.',
  essai: 'L’essai gratuit n’est pas achetable en ligne.',
  hors_ligne: 'Cette offre se contracte hors ligne (établissement / groupe).',
  gratuit: 'Le plan gratuit ne se paie pas.',
  illimite_verrouille:
    'L’offre Illimité n’est pas encore ouverte à la vente.',
};

export interface DiagnosticAchat {
  achetable: boolean;
  motif: MotifRefusAchat | null;
  libelle: string;
}

export interface OptionsAchat {
  /** Surcharge du verrou Illimité (tests). */
  illimiteVerrouille?: boolean;
}

/**
 * Décide si un code est ACHETABLE en ligne, d'après le catalogue et les
 * politiques. C'est la garde du tunnel de paiement.
 */
export function diagnostiquerAchat(
  code: string | null | undefined,
  catalogue: CatalogueCatalogue,
  options: OptionsAchat = {}
): DiagnosticAchat {
  const refus = (motif: MotifRefusAchat): DiagnosticAchat => ({
    achetable: false,
    motif,
    libelle: LIBELLE_REFUS[motif],
  });
  if (!code) return refus('inconnu');

  const pack = catalogue.packs.find((p) => p.code === code);
  if (pack) {
    if (pack.actif === false) return refus('inactif');
    return { achetable: true, motif: null, libelle: 'Pack de crédits.' };
  }

  const plan = catalogue.plans.find((p) => p.code === code);
  if (!plan) return refus('inconnu');
  if (plan.actif === false) return refus('inactif');
  if (plan.categorie === 'essai') return refus('essai');
  if (plan.categorie === 'legacy') return refus('legacy');
  if (plan.aliasDe) return refus('alias');
  if (plan.masque === true) return refus('masque');
  if (
    plan.categorie === 'etudiant' ||
    plan.categorie === 'groupe' ||
    plan.categorie === 'ecole'
  ) {
    return refus('hors_ligne');
  }
  if (plan.prixXof <= 0) return refus('gratuit');
  if (estCodeIllimite(plan.code)) {
    const verrouille = options.illimiteVerrouille ?? illimiteVerrouille();
    if (verrouille) return refus('illimite_verrouille');
  }
  return { achetable: true, motif: null, libelle: 'Offre vendable.' };
}

/** Raccourci booléen de diagnostiquerAchat(). */
export function estAchetableEnLigne(
  code: string | null | undefined,
  catalogue: CatalogueCatalogue,
  options: OptionsAchat = {}
): boolean {
  return diagnostiquerAchat(code, catalogue, options).achetable;
}

// ------------------------------------------------------------
// Garde-fou de coût : plafond de LIVRES (essai = 3 au total)
// ------------------------------------------------------------

export interface DiagnosticLivre {
  autorise: boolean;
  /** Plafond de livres du plan (null = non plafonné). */
  plafond: number | null;
  motif: string | null;
}

/**
 * Autorise (ou refuse) le lancement d'une traduction de livre pour un
 * plan, sachant les livres DÉJÀ traduits sur la période. L'essai porte
 * `livresMois = 3` : les 3 premiers livres passent, le 4ᵉ est refusé,
 * indépendamment du quota en caractères (garde-fou de coût de la base).
 */
export function verifierPlafondLivres(
  plan: PlanAbonnement | null | undefined,
  livresTraduitsPeriode: number
): DiagnosticLivre {
  const plafond =
    typeof plan?.livresMois === 'number' && plan.livresMois > 0
      ? plan.livresMois
      : null;
  const deja = Number.isFinite(livresTraduitsPeriode)
    ? Math.max(Math.trunc(livresTraduitsPeriode), 0)
    : 0;
  if (plafond === null) return { autorise: true, plafond: null, motif: null };
  if (deja >= plafond) {
    return {
      autorise: false,
      plafond,
      motif:
        `Plafond de ${plafond} livres atteint pour cette offre ` +
        `(${deja}/${plafond}).`,
    };
  }
  return { autorise: true, plafond, motif: null };
}

// ------------------------------------------------------------
// Sélection d'affichage (dérivée de la base)
// ------------------------------------------------------------

/** Les 4 offres de la grille publique (Gratuit, Lecteur, Passionné, Illimité). */
export function offresPubliquesDe(
  catalogue: CatalogueCatalogue
): PlanAbonnement[] {
  return tousLesPlans(catalogue.plans).filter(
    (p) =>
      !estPackCredits(p) &&
      p.actif !== false &&
      p.masque !== true &&
      !p.aliasDe &&
      p.categorie !== 'legacy' &&
      p.categorie !== 'essai' &&
      (p.categorie === 'gratuit' || p.categorie === 'individuel') &&
      p.dureeJours < 360
  );
}
