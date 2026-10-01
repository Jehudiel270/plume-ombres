// ============================================================
// partages.ts — Types et libellés communs aux composants du
// dossier `lecteur/`. Aucun rendu ici : uniquement des types et
// des tables de correspondance (statut → libellé / couleur).
// ============================================================

import type { StatutChapitre } from '@/lib/types';

/** Chapitre « léger » : ce que la liste du sommaire manipule. */
export interface ChapitreLeger {
  id: string;
  position: number;
  titre: string;
  statut: StatutChapitre;
}

/** Compteurs de segments (traduits / en erreur) pour tout le livre. */
export interface Compteurs {
  total: number;
  faits: number;
  erreurs: number;
}

/** Progression locale de l'export PDF re-paginé. */
export type GenPdf = { fait: number; total: number };

/** Progression locale de l'export « PDF fidèle ». */
export type ExportFidele = { etape: number; total: number; libelle: string };

/** État partagé par la barre d'actions et ses boutons d'export. */
export interface EtatExports {
  exportEnCours: boolean;
  genPdf: GenPdf | null;
  exportFidele: ExportFidele | null;
}

export const ETIQUETTE_STATUT_CHAPITRE: Record<StatutChapitre, string> = {
  a_traduire: 'À traduire',
  en_traduction: 'En cours…',
  traduit: 'Traduit',
  erreur: 'À reprendre',
};

export const POINT_STATUT: Record<StatutChapitre, string> = {
  a_traduire: 'bg-encre-500',
  en_traduction: 'bg-grenat-400 animate-pouls-doux',
  traduit: 'bg-emerald-400',
  erreur: 'bg-amber-400',
};
