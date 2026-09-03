// ============================================================
// import-livre.ts — Préparation d'un livre importé.
// Lit le fichier brut, découpe en chapitres puis en segments,
// et produit les enregistrements à insérer dans Supabase.
// ============================================================

import { decouperEnChapitres, decouperTexte, type Unite } from './segmenter';

/**
 * Taille maximale d'un segment (paragraphe). Les gros segments réduisent
 * fortement le nombre d'appels (débit). Chaque fournisseur découpe
 * lui-même en fragments si sa limite est plus stricte (ex. MyMemory).
 */
export const MAX_CHARS_SEGMENT = 6000;

export interface SegmentBrut {
  position: number;
  source: string;
  suite: string;
}

export interface ChapitrePret {
  id: string;
  position: number;
  titre: string;
  texte_source: string;
  segments: SegmentBrut[];
}

export interface LivrePret {
  titre: string;
  auteur: string;
  chapitres: ChapitrePret[];
  totalSegments: number;
}

/** Découpe un texte brut en structure prête à l'insertion. */
export function preparerLivre(texteBrut: string, nomFichier: string): LivrePret {
  const chapitresBruts = decouperEnChapitres(texteBrut);

  const chapitres: ChapitrePret[] = chapitresBruts.map((c, index) => {
    const unites: Unite[] = decouperTexte(c.texte, MAX_CHARS_SEGMENT);
    const segments: SegmentBrut[] = unites.map((u, i) => ({
      position: i,
      source: u.source,
      suite: u.suite,
    }));
    return {
      id: crypto.randomUUID(),
      position: index,
      titre: c.titre || `Chapitre ${index + 1}`,
      texte_source: c.texte,
      segments,
    };
  });

  const nomSansExtension = nomFichier.replace(/\.[^.]+$/, '').trim();
  return {
    titre: nomSansExtension || 'Livre sans titre',
    auteur: '',
    chapitres,
    totalSegments: chapitres.reduce((n, c) => n + c.segments.length, 0),
  };
}
