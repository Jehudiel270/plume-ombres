// ============================================================
// lib/paiement/mode.ts — Mode de paiement pour l'AFFICHAGE (P0.9).
//
// Volontairement SANS dépendance lourde (pas de crypto, pas de
// client Supabase) : importable par les composants serveur qui
// affichent un bandeau sans exposer aucun secret.
// ============================================================

export type ModePaiementAffiche = 'simulation' | 'sandbox' | 'live';

export interface EtatPaiementAffiche {
  mode: ModePaiementAffiche;
  /** 'fedapay' | 'simulation' | 'aucun'. */
  fournisseur: string;
  /** Vrai si un fournisseur est réellement utilisable. */
  configure: boolean;
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
  const explicite = process.env.PAYMENT_SIMULATION?.trim().toLowerCase();
  const simulationOuverte =
    explicite === 'true'
      ? true
      : explicite === 'false'
        ? false
        : process.env.NODE_ENV !== 'production';
  return {
    mode: 'simulation',
    fournisseur: simulationOuverte ? 'simulation' : 'aucun',
    configure: simulationOuverte,
  };
}
