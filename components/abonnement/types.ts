// ============================================================
// components/abonnement/types.ts — Contrats d'entrée de la grille (Lot C).
//
// Les composants de la grille ne LISENT AUCUNE valeur de prix, de
// quota ou de durée : tout arrive par props, sous forme d'objets
// DÉJÀ RÉSOLUS par la source de vérité (public.plans_abonnement via
// lib/plans-catalogue.ts, câblé par la page).
//
// Conséquence voulue : ces types sont structurels et volontairement
// PERMISSIFS. Un objet plus riche (colonnes de la base) satisfait ces
// interfaces sans adaptation ; un champ absent désactive simplement
// l'élément d'interface correspondant (pas d'annuel ⇒ pas de variante).
//
// Aucun import de '@/lib/abonnement' : la grille reste découplée du
// module en cours de refonte par un autre agent.
// ============================================================

/** Variante annuelle d'une offre, rattachée à sa carte mensuelle. */
export interface VarianteAnnuelle {
  /** Code du plan annuel (ex. 'lecteur_annuel'). */
  code: string;
  /** Prix annuel, en francs CFA. */
  prixXof: number;
  /** Durée couverte par le paiement, en jours (365 en pratique). */
  dureeJours?: number;
  /**
   * Remise affichée, en pour cent. Si absente, elle est CALCULÉE à
   * partir du prix mensuel et du prix annuel — jamais écrite en dur.
   */
  remisePourcent?: number;
}

/** Une offre PUBLIQUE de la grille (mensuelle ou gratuite). */
export interface OffrePublique {
  /** Code du plan en base (ex. 'lecteur_mensuel'). */
  code: string;
  /** Nom affiché (ex. « Lecteur mensuel »). */
  nom: string;
  /** Phrase de positionnement (facultative). */
  resume?: string;
  /** Prix de la période, en francs CFA (0 = offre gratuite). */
  prixXof: number;
  /** Durée couverte par un paiement, en jours (0 = gratuit/permanent). */
  dureeJours?: number;
  /** Quota mensuel de traduction, en caractères. */
  quotaMensuelCaracteres?: number;
  /**
   * Caractères d'un PACK de crédits. Réservé aux packs, qui ne sont
   * PAS rendus par cette grille — conservé pour compatibilité de type
   * avec le catalogue existant.
   */
  caracteres?: number;
  /** Arguments de vente, une ligne par avantage. */
  avantages?: readonly string[];
  /** Variante annuelle « −X %, N mois offerts », ou rien. */
  annuel?: VarianteAnnuelle | null;
}

/**
 * Une offre d'une catégorie PARTICULIÈRE (étudiant, groupe, école) :
 * affichée, jamais achetée en ligne dans ce lot.
 */
export interface OffreAutre {
  code: string;
  nom: string;
  resume?: string;
  /** Prix de référence, en francs CFA (facultatif : « sur dossier »). */
  prixXof?: number;
  /** Vrai si le prix s'entend PAR PERSONNE. */
  parPersonne?: boolean;
  /** Nombre minimum de participants (groupe, école). */
  minPersonnes?: number;
  /** Durée de la période, en jours (30 = mois, 365 = an). */
  dureeJours?: number;
  /** Vrai si l'offre exige une vérification de statut (étudiant). */
  verificationRequise?: boolean;
  /** Quota mensuel de traduction, en caractères. */
  quotaMensuelCaracteres?: number;
  avantages?: readonly string[];
  /** Mention libre : condition d'accès, canal de mise en relation. */
  note?: string;
}

/**
 * Ce que reçoit `AbonnementTarifs`. Nom de prop `plans` conservé pour
 * la compatibilité de l'appel existant (app/abonnement/page.tsx).
 */
export interface GrilleTarifsProps {
  /** Les offres publiques, dans l'ordre d'affichage. */
  plans: readonly OffrePublique[];
  /** Les offres « autres » (étudiant / groupe / école), non achetables. */
  autresOffres?: readonly OffreAutre[];
  /** Code du plan en vigueur sur le compte (chaîne vide si aucun). */
  planActuel: string;
  /** Vrai si le compte a un abonnement payant actif. */
  premium: boolean;
  /** Vrai si le tunnel de paiement est en simulation (aucun débit). */
  simulation: boolean;
}
