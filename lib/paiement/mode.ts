// ============================================================
// lib/paiement/mode.ts — Mode de paiement pour l'AFFICHAGE.
//
// Volontairement SANS dépendance lourde (pas de crypto, pas de
// client Supabase) : importable par les composants serveur qui
// affichent un bandeau sans exposer aucun secret.
//
// L'application ne doit JAMAIS planter faute de clés : sans clé
// FedaPay et sans simulation autorisée, on affiche un état propre
// « paiement non configuré ».
// ============================================================

export type ModePaiementAffiche =
  | 'simulation'
  | 'sandbox'
  | 'live'
  | 'non_configure';

export interface EtatPaiementAffiche {
  mode: ModePaiementAffiche;
  /** 'fedapay' | 'simulation' | 'aucun'. */
  fournisseur: string;
  /** Vrai si un fournisseur est réellement utilisable. */
  configure: boolean;
}

/** Vrai si la simulation est ouverte dans cet environnement. */
function simulationOuverte(): boolean {
  const explicite = process.env.PAYMENT_SIMULATION?.trim().toLowerCase();
  if (explicite === 'true') return true;
  if (explicite === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** Décrit le mode de paiement courant, sans jamais exposer de clé. */
export function modePaiementAffiche(): EtatPaiementAffiche {
  const cleFeda = process.env.FEDAPAY_SECRET_KEY?.trim();
  if (cleFeda) {
    return {
      mode: process.env.FEDAPAY_ENV?.trim().toLowerCase() === 'live'
        ? 'live'
        : 'sandbox',
      fournisseur: 'fedapay',
      configure: true,
    };
  }
  if (simulationOuverte()) {
    return { mode: 'simulation', fournisseur: 'simulation', configure: true };
  }
  // Aucune clé, simulation fermée : état propre « non configuré ».
  return { mode: 'non_configure', fournisseur: 'aucun', configure: false };
}
