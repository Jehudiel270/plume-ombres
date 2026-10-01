'use client';

// ============================================================
// useExports.ts — État et logique d'export du livre : chapitre
// (.md), livre (.md), Word (.docx), impression PDF, PDF traduit
// re-paginé, PDF fidèle. Extrait d'EspaceLivre : le composant ne
// garde que l'orchestration, l'état d'export vit ici.
// ============================================================

import { useCallback, useState, type RefObject } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chapitre, Livre } from '@/lib/types';
import type { ChapitreLeger, ExportFidele, GenPdf } from './partages';

/** Télécharge une chaîne de texte dans un fichier. */
function telecharger(contenu: string, nomFichier: string, type: string) {
  const blob = new Blob([contenu], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

/** Télécharge un Blob déjà construit. */
function telechargerBlob(blob: Blob, nomFichier: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

export function useExports({
  supabaseRef,
  livre,
  chapitreComplet,
  chapitres,
  setMessageLangue,
}: {
  supabaseRef: RefObject<SupabaseClient>;
  livre: Livre;
  chapitreComplet: Chapitre | null;
  chapitres: ChapitreLeger[];
  setMessageLangue: (message: string | null) => void;
}) {
  const [exportEnCours, setExportEnCours] = useState(false);
  const [genPdf, setGenPdf] = useState<GenPdf | null>(null);
  const [exportFidele, setExportFidele] = useState<ExportFidele | null>(null);

  const exporterChapitre = useCallback(async () => {
    if (!chapitreComplet) return;
    const texte = chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    const titre = chapitreComplet.titre.replace(/[^\wÀ-ÿ -]+/g, '').trim();
    telecharger(
      `# ${chapitreComplet.titre}\n\n${texte.trimEnd()}\n`,
      `${livre.titre} — ${titre}.md`,
      'text/markdown'
    );
  }, [chapitreComplet, livre.titre]);

  /** Récupère tous les chapitres du livre (texte traduit si dispo). */
  const chargerChapitresExport = useCallback(async () => {
    const { data: tous } = await supabaseRef.current
      .from('chapitres')
      .select('position, titre, texte_source, texte_traduit, statut')
      .eq('livre_id', livre.id)
      .order('position', { ascending: true });
    const chapitresBruts = (tous ?? []) as Array<{
      titre: string;
      texte_source: string;
      texte_traduit: string | null;
      statut: string;
    }>;
    return chapitresBruts.map((c) => ({
      titre: c.titre,
      texte:
        c.statut === 'traduit' && c.texte_traduit
          ? c.texte_traduit
          : c.texte_source,
    }));
  }, [livre.id, supabaseRef]);

  /** Chapitres complets, tels que le moteur PDF fidèle les attend
   *  (`titre`, `texte_source`, `texte_traduit`) — l'alignement exact
   *  se fait sur `texte_source`, champ donc indispensable. */
  const chargerChapitresFideles = useCallback(async () => {
    const { data: tous } = await supabaseRef.current
      .from('chapitres')
      .select('position, titre, texte_source, texte_traduit')
      .eq('livre_id', livre.id)
      .order('position', { ascending: true });
    return (tous ?? []).map((c: {
      position: number;
      titre: string;
      texte_source: string;
      texte_traduit: string | null;
    }) => ({
      titre: c.titre,
      texte_source: c.texte_source,
      texte_traduit: c.texte_traduit,
    }));
  }, [livre.id, supabaseRef]);

  const exporterLivre = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitresExport = await chargerChapitresExport();
      const contenu = chapitresExport
        .map((c) => `# ${c.titre}\n\n${c.texte.trimEnd()}\n`)
        .join('\n\n---\n\n');
      telecharger(contenu, `${livre.titre} — traduction.md`, 'text/markdown');
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport]);

  /** Export Word (.docx) mis en forme — conserve tout le reste. */
  const exporterLivreDocx = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitresExport = await chargerChapitresExport();
      const { genererDocx } = await import('@/lib/export-docx');
      const blob = await genererDocx(livre.titre, chapitresExport);
      telechargerBlob(blob, `${livre.titre} — traduction.docx`);
    } catch (e) {
      setMessageLangue(
        `Export Word impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport, setMessageLangue]);

  /** Impression / « Enregistrer en PDF » du livre mis en forme. */
  const imprimerLivrePdf = useCallback(async () => {
    const chapitresExport = await chargerChapitresExport();
    const { imprimerLivre } = await import('@/lib/imprimer-pdf');
    imprimerLivre(livre.titre, chapitresExport);
  }, [livre.titre, chargerChapitresExport]);

  /**
   * Télécharge le livre TRADUIT en PDF — même gabarit que l'original
   * (dimensions + marges du fichier source s'il est un PDF), texte
   * justifié, lettrines. La génération tourne 100% dans le navigateur.
   */
  const telechargerPdfTraduit = useCallback(async () => {
    if (livre.fichier_original && genPdf) return; // déjà en cours
    try {
      setGenPdf({ fait: 0, total: 1 });
      const { genererPdfTraduit } = await import('@/lib/pdf-traduit');
      // 1. Géométrie de l'original (PDF uniquement ; A4 sinon).
      const estPdf =
        (livre.nom_fichier ?? '').toLowerCase().endsWith('.pdf') &&
        !!livre.fichier_original;
      let geo;
      if (estPdf) {
        const { data } = await supabaseRef.current.storage
          .from('originaux')
          .download(livre.fichier_original!);
        if (data) {
          const { mesurerOriginalPdf } = await import('@/lib/pdf-navigateur');
          geo = await mesurerOriginalPdf(await data.arrayBuffer());
        }
      }
      if (geo) setGenPdf({ fait: 0, total: 2 });
      // 2. Chapitres traduits en ordre.
      const chapitresExport = await chargerChapitresExport();
      // 3. Génération (barre de progression par chapitre).
      const bytes = await genererPdfTraduit({
        titreLivre: livre.titre,
        auteur: livre.auteur,
        chapitres: chapitresExport,
        geo: geo ?? undefined,
        onChapitre: (traites, total) =>
          setGenPdf({ fait: traites + 1, total }),
      });
      setGenPdf(null);
      const base = (livre.nom_fichier ?? livre.titre).replace(/\.pdf$/i, '');
      telechargerBlob(
        new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        `${base} — traduit.pdf`
      );
    } catch (e) {
      setGenPdf(null);
      setMessageLangue(
        `PDF traduit impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    }
  }, [livre, genPdf, chargerChapitresExport, supabaseRef, setMessageLangue]);

  /** Export « PDF — mise en page d'origine, contenu français ».
   *  Le fichier original est conservé À L'IDENTIQUE (couleur de
   *  page, marges, polices, images, ornement) : seul le corps du
   *  texte est remplacé par le français, coulé dans les mêmes boîtes
   *  aux mêmes positions. Le moteur tourne 100 % dans le navigateur.
   *  Indisponible : sans fichier original, ou chapitre incomplet.
   *  100 % navigateur : fichier original du stockage, géométrie par
   *  analyse complète, recoulement du corps français, assemblage.
   *  Durée réelle : quelques dizaines de secondes pour un livre.
   */
  const telechargerFidele = useCallback(async () => {
    if (exportFidele || exportEnCours || genPdf) return;
    try {
      const incomplets = chapitres.filter((c) => c.statut !== 'traduit');
      if (incomplets.length > 0) {
        setMessageLangue(
          `Traduction incomplète : ${incomplets.length} chapitre(s) non traduit — impossible de garantir un contenu 100 % français.`
        );
        return;
      }
      setExportFidele({ etape: 1, total: 6, libelle: 'Démarrage…' });
      const { exporterPdfFidele } = await import('@/lib/export-fidele');
      // L'alignement exact a besoin des chapitres TELS QUE STOCKÉS
      // (texte_source = sous-texte exact du flux d'import ;
      // texte_traduit = le contenu français). On charge donc tous
      // les chapitres complets — le moteur gère de lui-même le cas
      // « chapitre non traduit » (la source y est coulée telle
      // quelle, sans mot perdu ni dupliqué).
      const tous = await chargerChapitresFideles();
      if (tous.length === 0) {
        throw new Error('Aucun chapitre trouvé dans la base.');
      }
      // Récupère l'original conservé en base (même chemin que le
      // moteur utilise pour la géométrie) — le moteur se charge du
      // reste en local.
      const telechargerOriginalFidele = async (chemin: string) => {
        const { data, error } = await supabaseRef.current.storage
          .from('originaux')
          .download(chemin);
        if (error || !data) {
          throw error ?? new Error('Téléchargement de l’original impossible.');
        }
        return data.arrayBuffer();
      };
      await exporterPdfFidele(
        {
          id: livre.id,
          titre: livre.titre,
          langue_cible: livre.langue_cible,
          fichier_original: livre.fichier_original,
        },
        tous,
        telechargerOriginalFidele,
        (p: { etape: number; total: number; libelle?: string }) =>
          setExportFidele({
            etape: p.etape,
            total: p.total,
            libelle: p.libelle ?? '',
          })
      );
    } catch (e) {
      setMessageLangue(
        `PDF fidèle impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    } finally {
      setExportFidele(null);
    }
  }, [
    livre,
    chapitres,
    exportFidele,
    exportEnCours,
    genPdf,
    chargerChapitresFideles,
    supabaseRef,
    setMessageLangue,
  ]);

  return {
    exportEnCours,
    genPdf,
    exportFidele,
    exporterChapitre,
    exporterLivre,
    exporterLivreDocx,
    imprimerLivrePdf,
    telechargerPdfTraduit,
    telechargerFidele,
  };
}
