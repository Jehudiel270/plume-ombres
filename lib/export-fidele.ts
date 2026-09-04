// ============================================================
// export-fidele.ts — Côté NAVIGATEUR du système pdf-fidele.
//
// Bouton « PDF — mise en page d'origine, contenu français » :
//   1. télécharge l'original conservé en base (bucket Supabase,
//      même chemin que le téléchargement simple) ;
//   2. scanne la mise en page d'origine (pdf.js — même passage
//      que l'import : textesPages est le flux exact de la base) ;
//   3. appelle le moteur `genererPdfFidele` (pdf-lib, 100 %
//      local : aucun octet envoyé sur le serveur) ;
//   4. déclenche le téléchargement du résultat.
//
// Le PDF produit : chaque page d'origine reste à l'identique
// (images, ornement, filigranes), le corps anglais est masqué et
// remplacé par le français, paginé sur les lignes d'origine.
// ============================================================

import * as pdfjs from 'pdfjs-dist';
import {
  genererPdfFidele,
  scannerPagesFideles,
  type ChapitreFidele,
  type DocPdfJs,
  type PageSourceFidele,
} from './pdf-fidele';
import type { Livre } from './types';

export interface ProgresFidele {
  etape: number;
  total: number;
  libelle?: string;
}

/**
 * Télécharge le PDF « mise en page d'origine, contenu français ».
 * Lance seulement le téléchargement si tout s'est bien passé.
 * @param livre      livre complet (fichier_original en base requis).
 * @param chapitres  chapitres TELS QUE STOCKÉS (titre, texte_source,
 *                   texte_traduit) — l'alignement exact se fait sur
 *                   `texte_source` (sous-texte exact du flux d'import) ;
 *                   le français est projeté page par page sur ces
 *                   bornes exactes (aucun mot perdu ni dupliqué).
 * @param telecharger récupère l'original du stockage (bouton « Original »)
 *                   en retournant l'ArrayBuffer du fichier.
 * @param onProgres  (etape, total, libellé) — 6 étapes.
 */
export async function exporterPdfFidele(
  livre: Pick<Livre, 'id' | 'titre' | 'langue_cible' | 'fichier_original'>,
  chapitres: ChapitreFidele[],
  telecharger: (chemin: string) => Promise<ArrayBuffer>,
  onProgres: (p: ProgresFidele) => void
): Promise<void> {
  onProgres({ etape: 1, total: 6 });
  if (!livre.fichier_original) {
    throw new Error(
      'Ce livre n’a pas de fichier original à conserver en base.'
    );
  }

  // 1. Original conservé (même téléchargement que « Original »).
  const donnees = new Uint8Array(await telecharger(livre.fichier_original));

  // Garde-fou : le moteur « mise en page d'origine » est réservé aux
  // originaux PDF (c'est la mise en page d'origine qui est conservée).
  // Un .txt/.epub importé est conservé tel quel en base : on refuse
  // proprement au lieu d'échouer dans pdf-lib avec un binaire message
  // (« No PDF header found »), et on renvoie vers l'alternative.
  if (!estPdfValide(donnees)) {
    throw new Error(
      'l’original conservé n’est pas un PDF (import .txt/.epub/.md) — ' +
        'la mise en page d’origine n’existe pas ; utilisez « PDF traduit (re-paginé) » ou « Imprimer en PDF »'
    );
  }

  // 2. Scan de la mise en page d'origine (toutes les pages,
  //    worker pdf.js dédié — UI fluide).
  //    Copie dédiée ET OBLIGATOIRE : pdf.js transfère son buffer au
  //    worker (ArrayBuffer détaché côté main). Partager `donnees`
  //    condamnerait l'étape 3 (pdf-lib) sur un buffer vide →
  //    « No PDF header found (offset=0) » en production.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const tache = pdfjs.getDocument({ data: donnees.slice() });
  const docJs = (await tache.promise) as unknown as DocPdfJs;
  let scan: { pages: PageSourceFidele[]; textes: string[] };
  try {
    scan = await scannerPagesFideles(docJs, (p, tot) => {
      onProgres({
        etape: 2,
        total: 6,
        libelle: `Scan original… page ${p}/${tot}`,
      });
    });
  } finally {
    await docJs.destroy?.();
  }

  // Garde-fou défensif : si le buffer a néanmoins été détaché
  // (byteLength 0), on échoue avec un message clair et non binaire.
  if (donnees.byteLength === 0) {
    throw new Error('le fichier original a été libéré (buffer détaché) — réessayez');
  }

  // 3. Génératif PDF fidèle (tout est local ; chaque page est
  //    mesurée : corps, interligne, zone d'origine conservés).
  const resultat = await genererPdfFidele({
    octets: donnees,
    pages: scan.pages,
    textesPages: scan.textes,
    chapitres: chapitres.filter((c) => c.texte_source.trim() !== ''),
      onProgres: (etape, total, libelle) => {
        // Étapes moteur (1..4) → étapes globales (3..5).
        onProgres({
          etape: 1 + etape,
          total: 6,
          libelle: libelle,
        });
      },
    });

  // 4. Téléchargement.
  onProgres({ etape: 6, total: 6, libelle: 'Téléchargement…' });
  telechargerBlob(
    resultat.octets,
    slugTitre(livre.titre) + '-fidelle.pdf'
  );
}

function telechargerBlob(octets: Uint8Array, nom: string): void {
  const url = URL.createObjectURL(
    new Blob([octets.slice().buffer as ArrayBuffer], {
      type: 'application/pdf',
    })
  );
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function slugTitre(titre: string): string {
  return (
    titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'livre'
  );
}

/**
 * Un fichier commence-t-il bien par l'en-tête PDF `%PDF-` ?
 * (Spécification PDF : l'en-tête figure dans les premiers octets ;
 *  on scanne les 10 Ko pour tolérer les préambules parasites.)
 * Faux pour .txt / .epub (zip) / .md — ou un PDF tronqué.
 */
export function estPdfValide(octets: Uint8Array): boolean {
  if (octets.length < 1024) return false;
  const debut = octets.subarray(0, Math.min(octets.length, 10 * 1024));
  const enTete = new TextDecoder('latin1').decode(debut);
  const position = enTete.indexOf('%PDF-');
  return position >= 0 && position < 1024;
}