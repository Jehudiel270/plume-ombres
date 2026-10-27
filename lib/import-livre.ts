// ============================================================
// import-livre.ts — Préparation d'un livre importé.
// Lit le fichier brut, découpe en chapitres puis en segments,
// et produit les enregistrements à insérer dans Supabase.
//
// Stockage : les segments (`source` + `suite`) restent la source de
// vérité de la LECTURE et des métriques (quota, estimation, reprise) ;
// `chapitres.texte_source` est MALGRÉ TOUT réécrit à l'import, parce
// que les exports fidèles (lib/export-fidele.ts, lib/pdf-fidele.ts),
// le glossaire (lib/glossaire.ts) et les repères
// (app/livres/[id]/page.tsx) lisent encore cette colonne. Décision
// P0.10 : on conserve le stockage (cf. ChapitrePret.texte_source).
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
  /**
   * Texte source du chapitre, TEL QU'IMPORTÉ — champ REQUIS : l'omettre
   * fait échouer le typecheck au lieu de vider la colonne en silence.
   *
   * - Lecture et métriques : les `segments` (`source` + `suite`) restent
   *   la source de vérité (concaténation 1:1, cf.
   *   `reconstituerSourceDepuisSegments` dans lib/lecture.ts).
   * - Stockage : `chapitres.texte_source` est malgré tout réécrit ici,
   *   car les exports fidèles (lib/export-fidele.ts, lib/pdf-fidele.ts),
   *   le glossaire (lib/glossaire.ts) et les repères
   *   (app/livres/[id]/page.tsx) lisent encore cette colonne. Décision
   *   P0.10 : on conserve le stockage.
   */
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

  return assemblage(titreDepuisNom(nomFichier), '', chapitresBruts.map((c, index) => ({
    numero: index,
    titre: c.titre || `Chapitre ${index + 1}`,
    texte: c.texte,
  })));
}

/**
 * Prépare un livre dont les chapitres sont déjà connus (ex. EPUB, où
 * la table des matières fournit les titres). Même pipeline de
 * segmentation que `preparerLivre`.
 */
export function preparerLivreDepuisChapitres(
  chapitres: Array<{ titre: string; texte: string }>,
  titre: string,
  auteur: string
): LivrePret {
  return assemblage(
    titre.trim() || 'Livre sans titre',
    auteur.trim(),
    chapitres.map((c, index) => ({
      numero: index,
      titre: c.titre.trim() || `Chapitre ${index + 1}`,
      texte: c.texte,
    }))
  );
}

/** Titre d'un livre déduit du nom de fichier (extension retirée). */
function titreDepuisNom(nomFichier: string): string {
  return nomFichier.replace(/\.[^.]+$/, '').trim() || 'Livre sans titre';
}

/**
 * Noyau commun : des pires (titre, texte) de chapitres → structure
 * insérable (segments découpés par taille max).
 */
function assemblage(
  titre: string,
  auteur: string,
  pires: Array<{ numero: number; titre: string; texte: string }>
): LivrePret {
  const chapitres: ChapitrePret[] = pires.map((c) => {
    const unites: Unite[] = decouperTexte(c.texte, MAX_CHARS_SEGMENT);
    const segments: SegmentBrut[] = unites.map((u, i) => ({
      position: i,
      source: u.source,
      suite: u.suite,
    }));
    return {
      id: crypto.randomUUID(),
      position: c.numero,
      titre: c.titre,
      // Réécrit la colonne lue par les exports fidèles, le glossaire et
      // les repères ; les segments restent la source de vérité de la
      // lecture. Jamais laisser `undefined` : la clé serait omise par
      // JSON et le défaut SQL '' s'appliquerait sans aucune erreur.
      texte_source: c.texte,
      segments,
    };
  });
  return {
    titre,
    auteur,
    chapitres,
    totalSegments: chapitres.reduce((n, c) => n + c.segments.length, 0),
  };
}
