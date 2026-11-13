// ============================================================
// lib/cles-api-fournisseurs.ts — Catalogue des fournisseurs de
// clés d'API. Fichier PUR (aucune dépendance serveur) : il est
// importé à la fois par lib/cles-api.ts (serveur) et par les
// écrans d'administration (client).
// ============================================================

export type FournisseurCle =
  | 'gemini'
  | 'deepseek'
  | 'openai'
  | 'openrouter'
  | 'mistral'
  | 'autre';

export interface MetaFournisseur {
  id: FournisseurCle;
  libelle: string;
  /** Indice de format affiché dans le champ de saisie. */
  indice: string;
  /** Où cette clé est utilisée aujourd'hui. */
  usage: string;
}

export const FOURNISSEURS: readonly MetaFournisseur[] = [
  {
    id: 'gemini',
    libelle: 'Gemini (Google AI Studio)',
    indice: 'AIza…',
    usage: 'Aide à la lecture (F6/F10) et moteur de traduction.',
  },
  {
    id: 'deepseek',
    libelle: 'DeepSeek',
    indice: 'sk-…',
    usage: 'Enregistrée pour les prochains moteurs d’IA.',
  },
  {
    id: 'openai',
    libelle: 'OpenAI',
    indice: 'sk-…',
    usage: 'Enregistrée pour les prochains moteurs d’IA.',
  },
  {
    id: 'openrouter',
    libelle: 'OpenRouter',
    indice: 'sk-or-…',
    usage: 'Enregistrée pour les prochains moteurs d’IA.',
  },
  {
    id: 'mistral',
    libelle: 'Mistral AI',
    indice: '…',
    usage: 'Enregistrée pour les prochains moteurs d’IA.',
  },
  {
    id: 'autre',
    libelle: 'Autre fournisseur',
    indice: 'clé…',
    usage: 'Stockée, prête pour un futur module.',
  },
];

export function metaFournisseur(id: string): MetaFournisseur {
  return (
    FOURNISSEURS.find((f) => f.id === id) ??
    FOURNISSEURS[FOURNISSEURS.length - 1]!
  );
}

export function estFournisseurConnu(valeur: unknown): valeur is FournisseurCle {
  return (
    typeof valeur === 'string' && FOURNISSEURS.some((f) => f.id === valeur)
  );
}
