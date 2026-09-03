// Types partagés de l'application (miroir du schéma Supabase).

export type StatutLivre =
  | 'importe'
  | 'pret'
  | 'en_traduction'
  | 'traduit'
  | 'erreur';

export type StatutChapitre =
  | 'a_traduire'
  | 'en_traduction'
  | 'traduit'
  | 'erreur';

export type StatutSegment =
  | 'en_attente'
  | 'en_cours'
  | 'fait'
  | 'erreur';

export interface Profil {
  id: string;
  pseudo: string;
  created_at: string;
}

export interface Livre {
  id: string;
  proprietaire_id: string;
  titre: string;
  auteur: string | null;
  langue_source: string;
  langue_cible: string;
  nom_fichier: string | null;
  statut: StatutLivre;
  created_at: string;
  updated_at: string;
  // agrégats calculés côté client (facultatif)
  nb_chapitres?: number;
  nb_segments?: number;
  nb_faits?: number;
}

export interface Chapitre {
  id: string;
  livre_id: string;
  position: number;
  titre: string;
  texte_source: string;
  texte_traduit: string | null;
  statut: StatutChapitre;
  updated_at: string;
}

export interface Segment {
  id: number;
  chapitre_id: string;
  position: number;
  source: string;
  suite: string;
  traduit: string | null;
  statut: StatutSegment;
  tentative: number;
  erreur: string | null;
  updated_at: string;
}

/** Identifiant de fournisseur de traduction. */
export type IdFournisseur = 'libretranslate' | 'mymemory';

/** Langues proposées (codes ISO 639-1). */
export type CodeLangue = 'fr' | 'en' | 'es' | 'it' | 'pt' | 'de';

export const LANGUES: Record<CodeLangue, string> = {
  fr: 'Français',
  en: 'Anglais',
  es: 'Espagnol',
  it: 'Italien',
  pt: 'Portugais',
  de: 'Allemand',
};
