// ============================================================
// lib/paiement/fournisseur.ts — Interface commune + fabrique (P0.9).
//
// Tous les agrégateurs exposent la MÊME interface :
//   estConfigure() · creerPaiement() · verifierPaiement()
// (+ vérification de signature et lecture de webhook, nécessaires au
//  branchement serveur).
//
// La fabrique `fournisseurActif()` lit PAYMENT_PROVIDER et retombe
// sur le PREMIER fournisseur réellement configuré. FedaPay est en
// tête de liste ; simulation vient en dernier recours (dev/test).
// Ajouter un agrégateur = une classe de plus dans `tousLesFournisseurs`.
// ============================================================

import { FedaPayFournisseur } from './fedapay';
import { SimulationFournisseur } from './simulation';
import type {
  DemandePaiement,
  EvenementPaiement,
  EntetesWebhook,
  ModePaiement,
  ResultatPaiement,
  VerificationPaiement,
} from './types';

export interface FournisseurPaiement {
  /** Identifiant machine ('fedapay', 'simulation', …). */
  readonly id: string;
  /** Nom affiché. */
  readonly nom: string;
  /** Mode effectif du fournisseur (simulation/sandbox/live). */
  readonly mode: ModePaiement;
  /** Vrai si le fournisseur est réellement utilisable (clé présente…). */
  estConfigure(): boolean;
  /** Crée un paiement et renvoie l'URL du guichet. */
  creerPaiement(demande: DemandePaiement): Promise<ResultatPaiement>;
  /** Interroge le statut réel d'un paiement chez le fournisseur. */
  verifierPaiement(reference: string): Promise<VerificationPaiement>;
  /** Vérifie la signature du webhook (HMAC). */
  verifierSignature(chargeBrute: string, entetes: EntetesWebhook): boolean;
  /** Extrait { référence interne / fournisseur, statut indicatif } du corps. */
  extraireEvenement(corps: unknown): EvenementPaiement | null;
}

/**
 * Liste ordonnée des fournisseurs candidats. L'ordre = priorité de
 * repli. FedaPay d'abord ; la simulation en dernier recours.
 */
export function tousLesFournisseurs(baseUrl = ''): FournisseurPaiement[] {
  return [new FedaPayFournisseur(), new SimulationFournisseur(baseUrl)];
}

/**
 * Fournisseur actif :
 *  1. PAYMENT_PROVIDER demandé explicitement (id) → celui-là, à
 *     condition qu'il soit configuré (sinon erreur explicite) ;
 *  2. sinon, le PREMIER fournisseur réellement configuré.
 */
export function fournisseurActif(baseUrl = ''): FournisseurPaiement {
  const candidats = tousLesFournisseurs(baseUrl);
  const demande = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();

  if (demande) {
    const choisi = candidats.find((f) => f.id === demande);
    if (!choisi) {
      throw new Error(
        `PAYMENT_PROVIDER="${demande}" inconnu. Fournisseurs disponibles : ` +
          candidats.map((f) => f.id).join(', ') +
          '.'
      );
    }
    if (!choisi.estConfigure()) {
      throw new Error(
        `Fournisseur de paiement « ${demande} » non configuré : renseignez ses ` +
          'variables d’environnement (ex. FEDAPAY_SECRET_KEY) ou choisissez ' +
          '« simulation ».'
      );
    }
    return choisi;
  }

  for (const f of candidats) {
    if (f.estConfigure()) return f;
  }
  throw new Error(
    'Aucun fournisseur de paiement configuré (et simulation désactivée en ' +
      'production). Renseignez FEDAPAY_SECRET_KEY ou PAYMENT_SIMULATION=true.'
  );
}

/** Description du fournisseur actif, sans jamais exposer de secret. */
export function descriptionFournisseurActif(baseUrl = ''): {
  id: string;
  nom: string;
  mode: ModePaiement;
} {
  const f = fournisseurActif(baseUrl);
  return { id: f.id, nom: f.nom, mode: f.mode };
}
