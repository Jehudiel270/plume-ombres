// ============================================================
// export-livre-epub.ts — Chaîne complète « livre → EPUB », côté
// navigateur : lecture des chapitres en base (texte traduit si le
// chapitre est traduit, sinon le texte source), génération de
// l'EPUB (lib/export-epub.ts), AUTO-VÉRIFICATION OCF puis
// téléchargement.
//
// C'est le point d'entrée RÉELLEMENT branché à l'interface : le
// bouton « EPUB » de la bibliothèque l'appelle. Il ne dépend
// d'aucun composant du lecteur et reste testable en Node avec un
// client Supabase factice (scripts/test-export-livre-epub.ts).
//
// Choix d'honnêteté : un chapitre dont la traduction n'est pas
// marquée « traduit » est exporté depuis sa SOURCE (jamais une
// traduction partielle avec des trous). Le nombre de chapitres
// restés en source est remonté à l'appelant pour l'afficher.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { genererEpub, verifierOcf, type CouvertureEpub } from './export-epub';
import type { ChapitreExport } from './export-docx';

/** Livre minimal nécessaire à un export EPUB. */
export interface LivrePourEpub {
  id: string;
  titre: string;
  auteur?: string | null;
  /** Langue du texte exporté (français par défaut). */
  langue_cible?: string | null;
}

/** Ligne `chapitres` réduite à ce que l'export consomme. */
export interface ChapitreEpubBrut {
  position: number;
  titre: string;
  texte_source: string | null;
  texte_traduit: string | null;
  statut: string;
}

/** Chapitres prêts pour l'EPUB + combien viennent de la source. */
export interface ChapitresPourEpub {
  chapitres: ChapitreExport[];
  /** Chapitres exportés depuis la SOURCE (non traduits) — 0 = tout FR. */
  sources: number;
}

/**
 * Texte retenu pour un chapitre donné : la traduction seulement si
 * le chapitre est marqué « traduit » ET porte un texte traduit ;
 * sinon le texte source (jamais un assemblage partiel).
 */
export function texteChapitrePourExport(chapitre: ChapitreEpubBrut): string {
  if (chapitre.statut === 'traduit' && chapitre.texte_traduit) {
    return chapitre.texte_traduit;
  }
  return chapitre.texte_source ?? '';
}

/**
 * Charge, dans l'ordre de lecture, les chapitres d'un livre et les
 * prépare pour l'EPUB. Lève une erreur explicite si le livre est vide
 * (mieux vaut refuser un export vide que livrer un livre blanc).
 */
export async function chargerChapitresEpub(
  supabase: SupabaseClient,
  livreId: string
): Promise<ChapitresPourEpub> {
  const { data, error } = await supabase
    .from('chapitres')
    .select('position, titre, texte_source, texte_traduit, statut')
    .eq('livre_id', livreId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Lecture des chapitres impossible : ${error.message}`);
  }

  const bruts = (data ?? []) as ChapitreEpubBrut[];
  if (bruts.length === 0) {
    throw new Error('Export EPUB impossible : ce livre n’a aucun chapitre.');
  }

  return {
    chapitres: bruts.map((c) => ({
      titre: c.titre,
      texte: texteChapitrePourExport(c),
    })),
    sources: bruts.filter((c) => c.statut !== 'traduit' || !c.texte_traduit)
      .length,
  };
}

/** Nom de fichier proposé (titre assaini, extension .epub). */
export function nomFichierEpub(livre: { titre: string }): string {
  const base = (livre.titre || 'livre')
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'livre'} — traduction.epub`;
}

/** Résultat complet d'un export EPUB. */
export interface ResultatEpub {
  octets: Uint8Array;
  nomFichier: string;
  nbChapitres: number;
  /** Chapitres restés en langue source (non traduits). */
  chapitresSources: number;
  /** Contrôle OCF : mimetype premier, non compressé, contenu exact. */
  ocf: { ok: boolean; problemes: string[] };
}

/**
 * Construit les octets de l'EPUB à partir de chapitres DÉJÀ chargés
 * (fonction pure : aucune base de données, aucun DOM). Auto-vérifie
 * la conformité OCF avant de rendre la main.
 */
export async function construireEpubLivre({
  livre,
  chapitres,
  chapitresSources = 0,
  couverture = null,
  date,
}: {
  livre: LivrePourEpub;
  chapitres: ChapitreExport[];
  chapitresSources?: number;
  couverture?: CouvertureEpub | null;
  date?: string;
}): Promise<ResultatEpub> {
  const langue = (livre.langue_cible ?? '').trim() || 'fr';
  const octets = await genererEpub({
    titre: livre.titre,
    auteur: livre.auteur ?? null,
    langue,
    chapitres,
    couverture,
    ...(date ? { date } : {}),
  });

  return {
    octets,
    nomFichier: nomFichierEpub(livre),
    nbChapitres: chapitres.length,
    chapitresSources,
    ocf: verifierOcf(octets),
  };
}

/** Charge puis génère : la chaîne complète appelée par l'interface. */
export async function exporterEpubLivre(
  supabase: SupabaseClient,
  livre: LivrePourEpub,
  options?: { couverture?: CouvertureEpub | null; date?: string }
): Promise<ResultatEpub> {
  const { chapitres, sources } = await chargerChapitresEpub(supabase, livre.id);
  return construireEpubLivre({
    livre,
    chapitres,
    chapitresSources: sources,
    couverture: options?.couverture ?? null,
    ...(options?.date ? { date: options.date } : {}),
  });
}

/**
 * Télécharge un EPUB (navigateur uniquement). No-op hors navigateur
 * pour rester importable depuis un test Node sans casser.
 */
export function telechargerEpub(octets: Uint8Array, nomFichier: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([octets as BlobPart], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}
