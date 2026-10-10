// ============================================================
// lib/paiement/service.ts — Orchestration du tunnel de paiement (P0.9).
//
// Dépend uniquement des interfaces (magasins + FournisseurPaiement) :
// le parcours est donc exerçable en mémoire, sans clé ni compte.
//
// Règles :
//  * TRACER AVANT D'APPELER : la ligne `paiements` (en_attente) est
//    écrite AVANT tout appel au fournisseur, sinon une coupure côté
//    client perd la trace ;
//  * webhook : la signature HMAC est vérifiée, PUIS le statut est
//    RE-VÉRIFIÉ auprès de l'API du fournisseur — le corps du webhook
//    n'est jamais la source de vérité (sauf en simulation, qui est
//    un canal interne authentifié) ;
//  * activation idempotente (upsert) ; un échec ne touche PAS
//    l'abonnement.
// ============================================================

import {
  abonnementActif,
  estPackCredits,
  estPlanPremium,
  periodePlan,
  planParCode,
  statutEffectif,
  type Abonnement,
  type CodePlan,
  type StatutAbonnement,
} from '../abonnement';
import type { FournisseurPaiement } from './fournisseur';
import type { EvenementPaiement, MagasinCredits, Paiement } from './types';
import type { MagasinAbonnement, MagasinPaiement } from './magasin';

export interface ContextePaiement {
  magasinPaiement: MagasinPaiement;
  magasinAbonnement: MagasinAbonnement;
  /** Magasin de crédits prépayés (requis pour les packs). */
  magasinCredits?: MagasinCredits;
  fournisseur: FournisseurPaiement;
  /** Base des URL (origine du site), sans slash final. */
  baseUrl?: string;
  /** Horloge injectable (tests déterministes). */
  maintenant?: () => Date;
}

/** Référence interne lisible et unique : PLU-<temps>-<aléa>. */
export function genererReference(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PLU-${t}-${r}`;
}

export interface ParamsInitiation {
  proprietaireId: string;
  plan: CodePlan;
  telephone: string;
  pays?: string;
  prenom?: string;
  nom?: string;
  email?: string;
}

export interface ResultatPaiementInitial {
  paiement: Paiement;
  url: string;
  fournisseur: string;
}

/**
 * Initie un paiement :
 *  1. trace locale `en_attente` (référence interne) ;
 *  2. appel du fournisseur ;
 *  3. mise à jour de la trace (URL, référence fournisseur).
 */
export async function initierPaiement(
  ctx: ContextePaiement,
  params: ParamsInitiation
): Promise<ResultatPaiementInitial> {
  const plan = planParCode(params.plan);
  if (!plan) throw new Error(`Plan inconnu : ${params.plan}`);
  if (!estPlanPremium(plan) && !estPackCredits(plan)) {
    throw new Error('Le plan gratuit ne nécessite aucun paiement.');
  }
  const telephone = params.telephone.replace(/[^\d+]/g, '');
  if (telephone.replace(/\D/g, '').length < 8) {
    throw new Error('Numéro Mobile Money invalide.');
  }

  const reference = genererReference();
  const maintenant = (ctx.maintenant?.() ?? new Date()).toISOString();
  const base = (ctx.baseUrl ?? '').replace(/\/$/, '');

  const paiement: Paiement = {
    reference,
    reference_fournisseur: null,
    proprietaire_id: params.proprietaireId,
    plan: plan.code,
    montant: plan.prixXof,
    devise: plan.devise,
    telephone,
    statut: 'en_attente',
    fournisseur: ctx.fournisseur.id,
    url_paiement: null,
    operateur: null,
    created_at: maintenant,
    updated_at: maintenant,
  };
  // 1. TRACE AVANT L'APPEL.
  await ctx.magasinPaiement.creer(paiement);

  // 2. Appel du fournisseur.
  const resultat = await ctx.fournisseur.creerPaiement({
    reference,
    plan: plan.code,
    montant: plan.prixXof,
    devise: plan.devise,
    telephone,
    pays: params.pays,
    prenom: params.prenom,
    nom: params.nom,
    email: params.email,
    description: `${
      estPackCredits(plan) ? 'Crédits de traduction' : 'Abonnement'
    } Plume d’Ombres — ${plan.nom}`,
    urlRetour: `${base}/paiement/succes?reference=${encodeURIComponent(reference)}`,
    urlNotification: `${base}/api/paiement/webhook`,
  });

  // 3. Mise à jour de la trace.
  const maj = await ctx.magasinPaiement.majStatut(reference, 'en_attente', {
    url_paiement: resultat.url,
    fournisseur: resultat.fournisseur,
    reference_fournisseur: resultat.referenceFournisseur,
  });

  return {
    paiement: maj ?? paiement,
    url: resultat.url,
    fournisseur: resultat.fournisseur,
  };
}

export interface ResultatTraitement {
  paiement: Paiement | null;
  abonnement: Abonnement | null;
  /** Vrai si le paiement était déjà traité (webhook rejoué). */
  dejaTraite: boolean;
  /** Vrai si un abonnement a été (ré)activé par cet événement. */
  applique: boolean;
  statutAbonnement: StatutAbonnement;
}

/**
 * Applique un statut de paiement (déjà autoritatif) à la trace locale,
 * et active l'abonnement en cas de succès. Idempotent.
 */
export async function traiterEvenement(
  ctx: ContextePaiement,
  evenement: EvenementPaiement
): Promise<ResultatTraitement> {
  // Réconciliation : on retrouve le paiement par NOTRE référence interne
  // (merchant_reference renvoyé par le webhook). Repli de COMPATIBILITÉ
  // pour les transactions créées AVANT la correction (aucune référence
  // interne dans le corps) : recherche par identifiant fournisseur.
  let paiement = evenement.referenceInterne
    ? await ctx.magasinPaiement.lire(evenement.referenceInterne)
    : null;
  if (!paiement && evenement.referenceFournisseur) {
    paiement = await ctx.magasinPaiement.lireParReferenceFournisseur(
      evenement.referenceFournisseur
    );
  }
  if (!paiement) {
    throw new Error(
      `Paiement inconnu (référence interne : ${
        evenement.referenceInterne ?? 'absente'
      }${
        evenement.referenceFournisseur
          ? `, référence fournisseur : ${evenement.referenceFournisseur}`
          : ''
      }).`
    );
  }

  const abonnementCourant = await ctx.magasinAbonnement.lire(
    paiement.proprietaire_id
  );
  const maintenant = ctx.maintenant?.() ?? new Date();

  // Idempotence : un paiement déjà réussi n'est jamais retraité.
  if (paiement.statut === 'reussi') {
    return {
      paiement,
      abonnement: abonnementCourant,
      dejaTraite: true,
      applique: false,
      statutAbonnement: statutEffectif(abonnementCourant, maintenant),
    };
  }

  if (evenement.statut === 'reussi') {
    // Garde-fou d'intégrité : montant identique.
    if (
      typeof evenement.montant === 'number' &&
      evenement.montant !== paiement.montant
    ) {
      throw new Error(
        `Montant incohérent pour ${paiement.reference} : ` +
          `${evenement.montant} ≠ ${paiement.montant}.`
      );
    }
    const plan = planParCode(paiement.plan);
    if (!plan) {
      throw new Error(`Plan inconnu pour le paiement ${paiement.reference}.`);
    }

    // ---- PACK DE CRÉDITS PRÉPAYÉS (pay-as-you-go) ----
    // On crédite le compte (idempotent) et on NE TOUCHE PAS à
    // l'abonnement : le compte garde son plan courant.
    if (estPackCredits(plan)) {
      if (!ctx.magasinCredits) {
        throw new Error(
          'Tunnel incomplet : magasin de crédits absent pour un paiement de pack.'
        );
      }
      await ctx.magasinCredits.crediter({
        proprietaireId: paiement.proprietaire_id,
        pack: plan.code,
        referencePaiement: paiement.reference,
        montant: paiement.montant,
      });
      const majCredit = await ctx.magasinPaiement.majStatut(
        paiement.reference,
        'reussi',
        { operateur: evenement.operateur ?? undefined }
      );
      return {
        paiement: majCredit ?? paiement,
        abonnement: abonnementCourant,
        dejaTraite: false,
        applique: true,
        statutAbonnement: statutEffectif(abonnementCourant, maintenant),
      };
    }

    if (!estPlanPremium(plan)) {
      throw new Error(`Plan non premium pour le paiement ${paiement.reference}.`);
    }
    const periode = periodePlan(plan, maintenant);
    const abonnement = await ctx.magasinAbonnement.activer({
      proprietaireId: paiement.proprietaire_id,
      plan: plan.code,
      paiementReference: paiement.reference,
      periodeDebut: periode.debut,
      periodeFin: periode.fin,
      motif: 'paiement confirmé',
    });
    const maj = await ctx.magasinPaiement.majStatut(paiement.reference, 'reussi', {
      operateur: evenement.operateur ?? undefined,
    });
    return {
      paiement: maj ?? paiement,
      abonnement,
      dejaTraite: false,
      applique: true,
      statutAbonnement: 'actif',
    };
  }

  // Échec : on marque le paiement, l'abonnement reste INCHANGÉ.
  const maj = await ctx.magasinPaiement.majStatut(paiement.reference, 'echoue', {
    operateur: evenement.operateur ?? undefined,
  });
  return {
    paiement: maj ?? paiement,
    abonnement: abonnementCourant,
    dejaTraite: false,
    applique: false,
    statutAbonnement: statutEffectif(abonnementCourant, maintenant),
  };
}

/**
 * Traite un webhook de fournisseur. En mode réel, le statut du corps
 * est INDICATIF : on RE-VÉRIFIE le statut auprès de l'API avant toute
 * activation. En simulation, le canal est interne et authentifié :
 * le statut soumis fait foi.
 */
export async function traiterWebhook(
  ctx: ContextePaiement,
  evenement: EvenementPaiement
): Promise<ResultatTraitement> {
  if (ctx.fournisseur.mode === 'simulation') {
    return traiterEvenement(ctx, evenement);
  }

  const reference =
    evenement.referenceFournisseur ??
    (evenement.referenceInterne
      ? (await ctx.magasinPaiement.lire(evenement.referenceInterne))
          ?.reference_fournisseur ?? null
      : null);
  if (!reference) {
    throw new Error('Webhook sans référence fournisseur : impossible de revérifier.');
  }

  const verif = await ctx.fournisseur.verifierPaiement(reference);
  // Le statut autoritatif est celui de l'API, jamais celui du corps.
  return traiterEvenement(ctx, {
    ...evenement,
    statut: verif.statut,
    montant: verif.montant ?? evenement.montant,
  });
}

/**
 * « Vérifier au retour » : relit l'état auprès du fournisseur quand un
 * webhook tarde. Sans effet si le paiement est déjà terminé.
 */
export async function verifierAuRetour(
  ctx: ContextePaiement,
  referenceInterne: string
): Promise<ResultatTraitement> {
  const paiement = await ctx.magasinPaiement.lire(referenceInterne);
  if (!paiement) throw new Error(`Paiement introuvable : ${referenceInterne}.`);

  const abonnementCourant = await ctx.magasinAbonnement.lire(
    paiement.proprietaire_id
  );
  const maintenant = ctx.maintenant?.() ?? new Date();

  if (paiement.statut !== 'en_attente') {
    return {
      paiement,
      abonnement: abonnementCourant,
      dejaTraite: true,
      applique: false,
      statutAbonnement: statutEffectif(abonnementCourant, maintenant),
    };
  }
  if (ctx.fournisseur.mode === 'simulation' || !paiement.reference_fournisseur) {
    // Simulation : rien à interroger, la page locale pilote le résultat.
    return {
      paiement,
      abonnement: abonnementCourant,
      dejaTraite: false,
      applique: false,
      statutAbonnement: statutEffectif(abonnementCourant, maintenant),
    };
  }

  const verif = await ctx.fournisseur.verifierPaiement(
    paiement.reference_fournisseur
  );
  if (verif.statut === 'en_attente') {
    return {
      paiement,
      abonnement: abonnementCourant,
      dejaTraite: false,
      applique: false,
      statutAbonnement: statutEffectif(abonnementCourant, maintenant),
    };
  }
  return traiterEvenement(ctx, {
    referenceInterne,
    referenceFournisseur: paiement.reference_fournisseur,
    statut: verif.statut,
    montant: verif.montant,
  });
}

/** Relit l'abonnement effectif d'un compte (sans écriture). */
export async function lireStatutAbonnement(
  ctx: Pick<ContextePaiement, 'magasinAbonnement' | 'maintenant'>,
  proprietaireId: string
): Promise<{
  abonnement: Abonnement | null;
  statut: StatutAbonnement;
  premium: boolean;
}> {
  const maintenant = ctx.maintenant?.() ?? new Date();
  const abonnement = await ctx.magasinAbonnement.lire(proprietaireId);
  const statut = statutEffectif(abonnement, maintenant);
  return {
    abonnement,
    statut,
    premium: statut === 'actif' && abonnementActif(abonnement, maintenant),
  };
}
