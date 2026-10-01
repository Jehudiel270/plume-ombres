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
  /** Chemin du fichier original stocké (bucket « originaux »), si conservé. */
  fichier_original: string | null;
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

/**
 * Un segment est « complet » (aucun trou) si sa traduction cible est
 * non vide. Cas particulier assumé : une source vide n'a rien à
 * traduire — un `traduit` vide y est légitime et ne bloque pas le
 * chapitre.
 */
export function segmentComplet(segment: Segment): boolean {
  if (segment.statut !== 'fait') return false;
  if ((segment.traduit ?? '').trim().length > 0) return true;
  return segment.source.trim().length === 0;
}

/**
 * Garde-fou : un chapitre n'est « entièrement traduit » que si TOUS ses
 * segments sont complets (texte cible non vide). Empêche de marquer un
 * chapitre « traduit » en laissant un trou (segment resté `en_cours`,
 * échec silencieux, traduction vide).
 */
export function chapitreEntierementTraduit(segments: Segment[]): boolean {
  return segments.every(segmentComplet);
}

/** Identifiant de fournisseur de traduction. */
export type IdFournisseur =
  | 'libretranslate'
  | 'mymemory'
  | 'gemini'
  | 'google';

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
