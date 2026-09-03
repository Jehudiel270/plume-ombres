// ============================================================
// providers/types.ts — Interface commune des fournisseurs.
// Aucun composant ne doit dépendre d'un fournisseur précis :
// tout passe par l'interface FournisseurTraduction.
// ============================================================

import type { IdFournisseur } from '@/lib/types';

export interface OptionsTraduction {
  source: string;
  cible: string;
  /** Signal d'annulation (fetch AbortSignal). */
  signal?: AbortSignal;
}

export interface FournisseurTraduction {
  readonly id: IdFournisseur;
  /** Nom affiché dans l'interface. */
  readonly nom: string;
  /** Nombre maximal de caractères accepté par requête. */
  readonly maxCharsParRequete: number;
  /** Délai minimum entre deux requêtes (ms) — respect des quotas. */
  readonly delaiEntreRequetes: number;
  /** Qualité indicative, pour l'affichage. */
  readonly qualite: 'basse' | 'moyenne' | 'haute';

  /** Traduit un texte court (≤ maxCharsParRequete). */
  traduire(texte: string, options: OptionsTraduction): Promise<string>;
}
