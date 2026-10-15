// ============================================================
// lib/credits-manquants.ts — Complément de crédits AU PRORATA (soupape).
//
// PROBLÈME COMMERCIAL RÉSOLU ICI
// Un lecteur dont le solde restant (quota du mois non consommé +
// crédits prépayés) tombe JUSTE SOUS la taille d'un livre n'a
// aujourd'hui AUCUNE issue proposée : la traduction s'arrête et il
// doit acheter un pack ENTIER — souvent surdimensionné — au prix
// plein. C'est le point de fuite le plus coûteux du parcours livre.
//
// Ce module calcule, de façon PURE (aucun accès réseau, aucun état,
// aucune valeur de prix écrite en dur) :
//   · le DÉFICIT exact     = taille du livre − solde restant ;
//   · le PACK LE PLUS JUSTE = le PLUS PETIT pack qui couvre le déficit
//     (on ne propose jamais un pack plus gros que nécessaire) ;
//   · le COMPLÉMENT AU PRORATA : prix = prix plein × déficit / volume
//     du pack, arrondi COMMERCIALEMENT (grille de 50 F CFA, plancher
//     100 F), toujours ≤ prix plein ;
//   · la RÉDUCTION (prix plein − complément) en F CFA et en % ;
//   · un MESSAGE clair, prêt à afficher côté utilisateur.
//
// Les volumes et les prix viennent du CATALOGUE (base de vérité,
// `packsCredits()`), jamais d'une constante locale : un changement de
// catalogue en base met la proposition à jour sans toucher ce fichier.
// ============================================================

import {
  libelleCaracteres,
  libellePrix,
  type PlanAbonnement,
} from './abonnement';

/** Grille de l'arrondi commercial, en francs CFA. */
export const GRILLE_REMISE_XOF = 50;

/** Plancher du complément : en dessous, le geste n'est plus viable. */
export const PLANCHER_REMISE_XOF = 100;

/** Solde restant d'un compte au moment où il ouvre un livre. */
export interface SoldeTraduction {
  /** Quota mensuel RESTANT (limite effective − caractères déjà consommés). */
  quotaRestant: number;
  /** Crédits prépayés disponibles (caractères). */
  credits: number;
}

/** Arrondi commercial d'un montant : multiple de 50 F, plancher 100 F. */
export function arrondiCommercial(montant: number): number {
  if (!Number.isFinite(montant) || montant <= 0) return PLANCHER_REMISE_XOF;
  const arrondi = Math.round(montant / GRILLE_REMISE_XOF) * GRILLE_REMISE_XOF;
  return Math.max(arrondi, PLANCHER_REMISE_XOF);
}

/** Somme des caractères encore mobilisables (quota + crédits). */
export function soldeRestant(solde: SoldeTraduction): number {
  const q = Number.isFinite(solde.quotaRestant)
    ? Math.max(Math.trunc(solde.quotaRestant), 0)
    : 0;
  const c = Number.isFinite(solde.credits) ? Math.max(Math.trunc(solde.credits), 0) : 0;
  return q + c;
}

export interface ComplementCredits {
  /** Taille du livre, en caractères (0 si inconnue). */
  tailleLivre: number;
  /** Caractères encore mobilisables (quota restant + crédits). */
  soldeRestant: number;
  /** Caractères MANQUANTS pour traduire le livre entier (0 si le solde suffit). */
  deficit: number;
  /** Vrai quand un complément est nécessaire (déficit > 0). */
  necessaire: boolean;
  /** Pack le plus juste : plus petit volume couvrant le déficit, ou le plus gros. */
  pack: PlanAbonnement | null;
  /** Volume du pack retenu (0 si aucun pack disponible). */
  packCaracteres: number;
  /** Vrai si un SEUL pack suffit à couvrir le déficit. */
  couvre: boolean;
  /** Nombre de packs entiers nécessaires si un seul ne suffit pas (1 sinon). */
  packsNecessaires: number;
  /** Prix CATALOGUE du pack (F CFA). */
  prixPleinXof: number;
  /** Complément proposé AU PRORATA, arrondi commercialement (F CFA). */
  prixProrataXof: number;
  /** Réduction commerciale = prix plein − complément (F CFA, ≥ 0). */
  remiseXof: number;
  /** Part de la réduction, en pour cent entier (0 si gratuit). */
  remisePourcent: number;
  /** Message clair, prêt à afficher. */
  message: string;
}

/** Formate un montant en F CFA (« 1 250 F CFA »). */
function fcfa(montant: number): string {
  return `${Math.max(Math.trunc(montant), 0).toLocaleString('fr-FR')} F CFA`;
}

/**
 * Choisit le pack de crédits LE PLUS JUSTE pour couvrir `deficit` :
 * le plus petit dont le volume ≥ déficit. Si aucun pack ne suffit
 * (déficit au-delà du plus gros pack), on renvoie le plus gros et
 * `couvre = false`.
 */
export function packLePlusJuste(
  deficit: number,
  packs: readonly PlanAbonnement[]
): PlanAbonnement | null {
  const tries = packs
    .filter((p) => typeof p.caracteres === 'number' && p.caracteres > 0)
    .sort((a, b) => (a.caracteres ?? 0) - (b.caracteres ?? 0));
  if (tries.length === 0) return null;
  const couvrant = tries.find((p) => (p.caracteres ?? 0) >= deficit);
  return couvrant ?? tries[tries.length - 1];
}

/**
 * Calcule la proposition de complément pour un livre donné.
 *
 * @param tailleLivre caractères totaux du livre à traduire
 * @param solde       quota restant + crédits du compte
 * @param packs       catalogue des packs de crédits (source de vérité)
 */
export function calculerComplement(
  tailleLivre: number,
  solde: SoldeTraduction,
  packs: readonly PlanAbonnement[]
): ComplementCredits {
  const taille = Number.isFinite(tailleLivre) ? Math.max(Math.trunc(tailleLivre), 0) : 0;
  const dispo = soldeRestant(solde);
  const deficit = Math.max(taille - dispo, 0);
  const necessaire = deficit > 0;

  const pack = necessaire ? packLePlusJuste(deficit, packs) : null;
  const packCaracteres = pack?.caracteres ?? 0;
  const prixPleinXof = pack?.prixXof ?? 0;
  const couvre = pack !== null && packCaracteres >= deficit;
  const packsNecessaires =
    !necessaire || pack === null
      ? 0
      : couvre
        ? 1
        : Math.ceil(deficit / Math.max(packCaracteres, 1));

  // Complément AU PRORATA : on ne paie que la part réellement manquante.
  // La remise commerciale ne s'applique que si un SEUL pack suffit
  // (sinon la base de calcul n'est plus un simple prorata).
  let prixProrataXof = 0;
  if (necessaire && pack !== null && packCaracteres > 0 && couvre) {
    const brut = (prixPleinXof * deficit) / packCaracteres;
    prixProrataXof = Math.min(arrondiCommercial(brut), prixPleinXof);
  } else if (necessaire && pack !== null) {
    // Plusieurs packs entiers requis : aucun prorata, prix plein × nb.
    prixProrataXof = prixPleinXof * packsNecessaires;
  }
  const remiseXof = Math.max(prixPleinXof - prixProrataXof, 0);
  const remisePourcent =
    prixPleinXof > 0 ? Math.round((remiseXof / prixPleinXof) * 100) : 0;

  return {
    tailleLivre: taille,
    soldeRestant: dispo,
    deficit,
    necessaire,
    pack,
    packCaracteres,
    couvre,
    packsNecessaires,
    prixPleinXof,
    prixProrataXof,
    remiseXof,
    remisePourcent,
    message: construireMessage({
      taille,
      dispo,
      deficit,
      necessaire,
      pack,
      packCaracteres,
      couvre,
      packsNecessaires,
      prixPleinXof,
      prixProrataXof,
      remiseXof,
      remisePourcent,
    }),
  };
}

function construireMessage(c: {
  taille: number;
  dispo: number;
  deficit: number;
  necessaire: boolean;
  pack: PlanAbonnement | null;
  packCaracteres: number;
  couvre: boolean;
  packsNecessaires: number;
  prixPleinXof: number;
  prixProrataXof: number;
  remiseXof: number;
  remisePourcent: number;
}): string {
  if (c.taille <= 0) {
    return 'Taille du livre inconnue : le complément de crédits ne peut pas être calculé.';
  }
  if (!c.necessaire) {
    return (
      `Votre solde couvre ce livre : ${libelleCaracteres(c.taille)} à traduire, ` +
      `${libelleCaracteres(c.dispo)} disponibles.`
    );
  }
  if (c.pack === null || c.packCaracteres <= 0) {
    return (
      `Il vous manque ${libelleCaracteres(c.deficit)} pour traduire ce livre ` +
      `(${libelleCaracteres(c.taille)}), et aucun pack de crédits n’est disponible ` +
      'pour le moment.'
    );
  }
  if (!c.couvre) {
    return (
      `Ce livre fait ${libelleCaracteres(c.taille)} et il vous manque ` +
      `${libelleCaracteres(c.deficit)}. Un seul pack ne suffit pas : prévoyez ` +
      `${c.packsNecessaires} × « ${c.pack.nom} ».`
    );
  }
  const remise =
    c.remiseXof > 0
      ? ` au lieu de ${fcfa(c.prixPleinXof)}, soit ${fcfa(c.remiseXof)} de moins ` +
        `(−${c.remisePourcent} %).`
      : '.';
  return (
    `Ce livre fait ${libelleCaracteres(c.taille)} et il vous manque ` +
    `${libelleCaracteres(c.deficit)}. Le « ${c.pack.nom} » ` +
    `(${libelleCaracteres(c.packCaracteres)}) le couvre : le complément au ` +
    `prorata vous revient à ${fcfa(c.prixProrataXof)}${remise}`
  );
}

/** Libellé du prix plein du pack proposé (« 500 F CFA »). */
export function libellePrixPlein(c: ComplementCredits): string {
  return c.pack ? libellePrix(c.pack) : '';
}
