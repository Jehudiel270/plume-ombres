// ============================================================
// lib/paiement/simulation.ts — Fournisseur de paiement SIMULÉ (P0.9).
//
// Aucune clé, aucun compte, aucun engagement financier : l'URL de
// paiement renvoyée est une page LOCALE (/paiement/simulation) qui
// rejoue le webhook en succès ou en échec.
//
// Garde-fou : la simulation n'est ouverte qu'en développement/test.
// En production elle doit être explicitement autorisée
// (PAYMENT_SIMULATION=true), sinon aucun fournisseur `simulation`
// n'est considéré comme configuré.
// ============================================================

import type {
  DemandePaiement,
  EvenementPaiement,
  ModePaiement,
  ResultatPaiement,
  StatutPaiement,
  VerificationPaiement,
} from './types';

/** Vrai si la simulation est autorisée dans cet environnement. */
export function simulationAutorisee(): boolean {
  const explicite = process.env.PAYMENT_SIMULATION?.trim().toLowerCase();
  if (explicite === 'true') return true;
  if (explicite === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** Identifie une transaction simulée par sa référence interne. */
export const PREFIXE_SIMULATION = 'SIM-';

export class SimulationFournisseur {
  readonly id = 'simulation';
  readonly nom = 'Simulation (aucun débit)';
  readonly mode: ModePaiement = 'simulation';
  private readonly baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  estConfigure(): boolean {
    return simulationAutorisee();
  }

  async creerPaiement(demande: DemandePaiement): Promise<ResultatPaiement> {
    const url = `${this.baseUrl}/paiement/simulation?reference=${encodeURIComponent(
      demande.reference
    )}`;
    return {
      url,
      referenceFournisseur: `${PREFIXE_SIMULATION}${demande.reference}`,
      fournisseur: this.id,
    };
  }

  async verifierPaiement(reference: string): Promise<VerificationPaiement> {
    // La décision vient de la page /paiement/simulation (webhook
    // simulé, authentifié par la session du compte). Ici, rien à
    // interroger : on reste en attente.
    return { statut: 'en_attente', brut: { reference, simulation: true } };
  }

  /** En simulation, la « signature » est l'absence de secret. */
  verifierSignature(): boolean {
    return simulationAutorisee();
  }

  extraireEvenement(corps: unknown): EvenementPaiement | null {
    if (!corps || typeof corps !== 'object') return null;
    const c = corps as Record<string, unknown>;
    const referenceInterne =
      typeof c.reference === 'string' ? c.reference.trim() : '';
    if (!referenceInterne) return null;
    return {
      referenceInterne,
      referenceFournisseur: `${PREFIXE_SIMULATION}${referenceInterne}`,
      statut: normaliserSimulation(c.statut),
      montant: typeof c.montant === 'number' ? c.montant : undefined,
      operateur:
        typeof c.operateur === 'string' ? c.operateur : 'simulation',
      brut: corps,
    };
  }
}

/** Normalise le statut d'un webhook simulé vers nos 3 valeurs. */
export function normaliserSimulation(brut: unknown): StatutPaiement {
  const v = String(brut ?? '').trim().toLowerCase();
  if (['reussi', 'succes', 'success', 'approved', 'true', '1'].includes(v)) {
    return 'reussi';
  }
  if (['echoue', 'echec', 'failed', 'declined', 'false', '0'].includes(v)) {
    return 'echoue';
  }
  return 'en_attente';
}
