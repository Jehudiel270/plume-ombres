// ============================================================
// lib/paiement/index.ts — Point d'entrée du tunnel de paiement (P0.9).
// ============================================================

export type {
  DemandePaiement,
  EntetesWebhook,
  EvenementPaiement,
  ModePaiement,
  Paiement,
  ResultatPaiement,
  StatutPaiement,
  VerificationPaiement,
} from './types';

export {
  fournisseurActif,
  descriptionFournisseurActif,
  tousLesFournisseurs,
  type FournisseurPaiement,
} from './fournisseur';

export {
  FedaPayFournisseur,
  cleFedapay,
  fedapayConfigure,
  fedapayEnv,
  normaliserStatutFedapay,
} from './fedapay';

export {
  SimulationFournisseur,
  normaliserSimulation,
  simulationAutorisee,
} from './simulation';

export {
  MagasinAbonnementMemoire,
  MagasinAbonnementSupabase,
  MagasinPaiementMemoire,
  MagasinPaiementSupabase,
  type ChampsMajPaiement,
  type DemandeActivation,
  type MagasinAbonnement,
  type MagasinPaiement,
} from './magasin';

export {
  genererReference,
  initierPaiement,
  lireStatutAbonnement,
  traiterEvenement,
  traiterWebhook,
  verifierAuRetour,
  type ContextePaiement,
  type ParamsInitiation,
  type ResultatPaiementInitial,
  type ResultatTraitement,
} from './service';
