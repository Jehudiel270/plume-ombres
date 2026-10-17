// ============================================================
// types/traduction-lot.d.ts — PONT TEMPORAIRE (17/10/2026).
//
// `lib/traduction/lot.ts` est écrit par l'agent A (branche
// `trad/serveur-lot`) sur la MÊME base. Tant que les deux branches ne
// sont pas fusionnées, l'import `@/lib/traduction/lot` n'a pas de
// fichier à résoudre : cette déclaration ambiante fournit UNIQUEMENT la
// signature imposée par docs/CHANTIER-TRADUCTION-2026-10-17.md.
//
// À SUPPRIMER dès que lib/traduction/lot.ts est présent sur la branche
// (il fait foi ; ce fichier ne contient aucun code de traitement).
// ============================================================

declare module '@/lib/traduction/lot' {
  /** Un segment à traduire, tel qu'envoyé par lot. */
  export interface SegmentLot {
    id: string;
    texte: string;
    contexte?: string;
  }

  /** Une traduction réussie. */
  export interface ResultatSegmentLot {
    id: string;
    traduit: string;
    /** Identifiant technique du moteur (jamais montré à l'utilisateur). */
    fournisseur: string;
    essais: number;
  }

  /** Un segment qui a échoué (raison machine + message utilisateur). */
  export interface EchecSegmentLot {
    id: string;
    raison: string;
    message: string;
  }

  export interface ResultatLotSegments {
    resultats: ResultatSegmentLot[];
    echecs: EchecSegmentLot[];
  }

  export interface OptionsLotSegments {
    source: string;
    cible: string;
    glossaire?: Array<{ source: string; traduction: string }>;
    concurrence?: number;
  }

  export function traiterLotSegments(
    segments: SegmentLot[],
    options: OptionsLotSegments
  ): Promise<ResultatLotSegments>;
}
