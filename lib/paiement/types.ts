// ============================================================
// lib/paiement/types.ts — Contrats du tunnel de paiement (P0.9).
//
// Le cœur du tunnel ne dépend d'AUCUN agrégateur : il parle à
// l'interface FournisseurPaiement (voir fournisseur.ts).
//
// FedaPay est le premier fournisseur ; le mode SIMULATION (aucune
// clé) reste le défaut et sert à tout tester sans engagement.
// ============================================================

import type { CodePlan } from '../abonnement';

/**
 * Mode d'exécution.
 *  * 'simulation' : fournisseur factice, aucune clé, aucun débit ;
 *  * 'sandbox'    : FedaPay bac à sable (clé sandbox) ;
 *  * 'live'       : FedaPay réel (clé live).
 */
export type ModePaiement = 'simulation' | 'sandbox' | 'live';

/** Statut normalisé d'un paiement (3 valeurs, tous fournisseurs). */
export type StatutPaiement = 'en_attente' | 'reussi' | 'echoue';

/** Un paiement persisté (trace locale). */
export interface Paiement {
  /** Référence INTERNE (clé primaire) : PLU-<temps>-<aléa>. */
  reference: string;
  /** Identifiant côté fournisseur (ex. id de transaction FedaPay). */
  reference_fournisseur: string | null;
  proprietaire_id: string;
  plan: CodePlan;
  /** Montant en unité entière de la devise (XOF : pas de centimes). */
  montant: number;
  devise: string;
  telephone: string;
  statut: StatutPaiement;
  fournisseur: string;
  /** URL de redirection vers le guichet du fournisseur. */
  url_paiement: string | null;
  operateur: string | null;
  created_at: string;
  updated_at: string;
}

/** Demande de création de paiement passée au fournisseur. */
export interface DemandePaiement {
  /** Référence interne (métadonnée renvoyée par le webhook). */
  reference: string;
  plan: CodePlan;
  montant: number;
  devise: string;
  telephone: string;
  /** Code pays ISO 3166-1 alpha-2 (ex. « bj »), pour le numéro. */
  pays?: string;
  prenom?: string;
  nom?: string;
  email?: string;
  description: string;
  urlRetour: string;
  urlNotification: string;
}

/** Résultat de la création d'un paiement chez un fournisseur. */
export interface ResultatPaiement {
  /** URL du guichet où envoyer le client. */
  url: string;
  /** Identifiant de transaction chez le fournisseur (si connu). */
  referenceFournisseur: string | null;
  fournisseur: string;
}

/** Résultat d'une vérification de statut auprès du fournisseur. */
export interface VerificationPaiement {
  statut: StatutPaiement;
  montant?: number;
  brut?: unknown;
}

/** Événement normalisé extrait d'un webhook. */
export interface EvenementPaiement {
  /** Référence interne (si le fournisseur la renvoie) — sinon null. */
  referenceInterne: string | null;
  /** Référence chez le fournisseur — sert à RE-VÉRIFIER le statut. */
  referenceFournisseur?: string | null;
  statut: StatutPaiement;
  montant?: number;
  operateur?: string;
  brut?: unknown;
}

/** En-têtes d'une requête entrante (webhook), abstraits du framework. */
export interface EntetesWebhook {
  get(nom: string): string | null;
}
