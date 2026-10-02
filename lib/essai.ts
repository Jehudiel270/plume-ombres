// ============================================================
// lib/essai.ts — Essai gratuit 7 jours et anti-abus.
//
// Règles produit :
//  * l'essai est attribué AUTOMATIQUEMENT à la création du compte,
//    sans carte ni numéro : `essai_fin = maintenant + 7 jours` ;
//  * il donne l'accès d'un plan « Passionné », PLAFONNÉ à 3 livres
//    AU TOTAL (`essai_livres_utilises`) — garde-fou de coût ;
//  * anti-abus : UN essai par e-mail ET UN essai par numéro de
//    téléphone Mobile Money. Le numéro est « libéré » dès que le
//    compte a effectué un PREMIER PAIEMENT RÉEL ;
//  * à l'échéance, bascule automatique vers `gratuit` : la
//    bibliothèque et les traductions sont CONSERVÉES.
//
// Ce module est PUR (aucune dépendance réseau) : il sert au serveur,
// au navigateur et aux tests.
// ============================================================

import {
  ESSAI_JOURS,
  ESSAI_LIVRES_MAX,
  essaiEchu,
  essaiLivresRestants,
  type Abonnement,
} from './abonnement';

export { ESSAI_JOURS, ESSAI_LIVRES_MAX };

/** État lisible de l'essai d'un compte. */
export interface EtatEssai {
  /** Vrai si l'essai est en cours. */
  actif: boolean;
  /** Vrai si l'essai a existé et est échu (bascule en gratuit). */
  echu: boolean;
  /** Fin de l'essai (ISO) si connue. */
  fin: string | null;
  /** Jours restants (0 si échu, null si aucun essai). */
  joursRestants: number | null;
  /** Livres déjà consommés pendant l'essai. */
  livresUtilises: number;
  /** Livres encore disponibles dans l'essai. */
  livresRestants: number;
  /** Plafond de livres de l'essai (3). */
  plafondLivres: number;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** État complet de l'essai pour l'affichage et les décisions. */
export function etatEssai(
  abonnement: Abonnement | null | undefined,
  maintenant: Date = new Date()
): EtatEssai {
  const fin = abonnement?.essai_fin ?? null;
  const estEssai = abonnement?.plan === 'essai';
  const livresUtilises = abonnement?.essai_livres_utilises ?? 0;
  if (!estEssai || !fin) {
    return {
      actif: false,
      echu: false,
      fin: null,
      joursRestants: null,
      livresUtilises: 0,
      livresRestants: ESSAI_LIVRES_MAX,
      plafondLivres: ESSAI_LIVRES_MAX,
    };
  }
  const actif =
    abonnement?.statut === 'actif' &&
    new Date(fin).getTime() > maintenant.getTime();
  const joursRestants = actif
    ? Math.max(Math.ceil((new Date(fin).getTime() - maintenant.getTime()) / MS_PAR_JOUR), 0)
    : 0;
  return {
    actif,
    echu: !actif,
    fin,
    joursRestants,
    livresUtilises,
    livresRestants: essaiLivresRestants(abonnement),
    plafondLivres: ESSAI_LIVRES_MAX,
  };
}

/** Message affiché sur /abonnement quand l'essai est en cours. */
export function messageEssaiActif(etat: EtatEssai): string {
  const jours = etat.joursRestants ?? 0;
  const livre = etat.livresUtilises > 1 ? 'livres' : 'livre';
  return (
    `Essai gratuit : ${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''} · ` +
    `${etat.livresUtilises}/${etat.plafondLivres} ${livre} utilisés. ` +
    'Aucune carte n’a été demandée.'
  );
}

/** Message affiché quand l'essai vient de s'achever. */
export const MESSAGE_ESSAI_ECHU =
  'Votre essai gratuit de 7 jours est terminé. Votre bibliothèque et vos ' +
  'traductions sont conservées : vous continuez avec l’offre gratuite ' +
  '(environ un livre par mois). Vous pouvez passer à une offre payante à ' +
  'tout moment pour retrouver un quota élargi.';

/** Message affiché quand le plafond de 3 livres de l'essai est atteint. */
export const MESSAGE_ESSAI_LIVRES_EPUISES =
  'Vous avez utilisé les 3 livres inclus dans l’essai gratuit. ' +
  'Choisissez une offre payante pour continuer à traduire dès maintenant.';

// ------------------------------------------------------------
// Téléphone Mobile Money
// ------------------------------------------------------------

/**
 * Normalise un numéro Mobile Money en chiffres, avec indicatif pays
 * optionnel. « +229 90 00 00 00 » → « 22990000000 ». Renvoie '' si le
 * numéro est inexploitable (moins de 8 chiffres).
 */
export function normaliserTelephone(brut: string | null | undefined): string {
  if (typeof brut !== 'string') return '';
  const chiffres = brut.replace(/\D/g, '');
  return chiffres.length >= 8 ? chiffres : '';
}

/**
 * Deux numéros désignent-ils le même abonné ? On compare sur les 8
 * derniers chiffres, de sorte qu'un même numéro saisi avec ou sans
 * indicatif pays soit reconnu comme identique.
 */
export function memeTelephone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliserTelephone(a ?? '');
  const nb = normaliserTelephone(b ?? '');
  if (!na || !nb) return false;
  return na.slice(-8) === nb.slice(-8);
}

/** Masque un numéro pour l'affichage : « •••••• 00 00 ». */
export function masquerTelephone(brut: string | null | undefined): string {
  const n = normaliserTelephone(brut ?? '');
  if (!n) return '';
  return `•••••• ${n.slice(-4).slice(0, 2)} ${n.slice(-2)}`;
}

/** Code d'erreur machine : essai déjà utilisé avec ce numéro. */
export const CODE_ESSAI_TELEPHONE_UTILISE = 'ESSAI_TELEPHONE_UTILISE';

/** Code d'erreur machine : essai déjà utilisé avec cet e-mail. */
export const CODE_ESSAI_EMAIL_UTILISE = 'ESSAI_EMAIL_UTILISE';

/** Code d'erreur machine : plafond de livres de l'essai atteint. */
export const CODE_ESSAI_LIVRES_EPUISES = 'ESSAI_LIVRES_EPUISES';

/** Vrai si un essai a déjà été consommé pour ce compte. */
export function essaiDejaUtilise(abonnement: Abonnement | null | undefined): boolean {
  return abonnement?.plan === 'essai' || essaiEchu(abonnement);
}
