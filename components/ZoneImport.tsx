'use client';

// ============================================================
// ZoneImport.tsx — Import d'un livre (.txt / .md / .pdf / .epub).
// - .txt / .md : lus tels quels (UTF-8).
// - .pdf       : texte extrait dans le navigateur (pdf.js).
// - .epub      : zip dézippé localement (jszip) — chapitres lu de
//   la spine (ordre de lecture), titre/auteur de l'OPF.
// Tous les formats passent par le même pipeline
// (chapitres → segments → Supabase) ; RLS : l'utilisateur connecté
// est le propriétaire.
// ============================================================

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { preparerLivre, preparerLivreDepuisChapitres } from '@/lib/import-livre';
import { resumerGeo, type GeometrieStockee } from '@/lib/geo-pdf';
import { memoriserOriginal } from '@/lib/original-en-memoire';
import type { CodeLangue } from '@/lib/types';
import { LANGUES } from '@/lib/types';

const CODES = Object.keys(LANGUES) as CodeLangue[];
const TAILLE_LOT = 400; // lignes insérées par requête
const EXTENSIONS = /\.(txt|md|markdown|pdf|epub)$/i;

export default function ZoneImport() {
  const routeur = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [source, setSource] = useState<CodeLangue>('en');
  const [cible, setCible] = useState<CodeLangue>('fr');

  /** Lit le fichier et en tire un texte brut selon son format. */
  async function lireTexte(fichier: File): Promise<string> {
    const estPdf = /\.pdf$/i.test(fichier.name);

    if (!estPdf) {
      const texte = await fichier.text(); // UTF-8 (BOM retiré automatiquement)
      if (texte.trim().length === 0) {
        throw new Error('Le fichier est vide.');
      }
      return texte;
    }

    // PDF : extraction locale par pdf.js (chargé à la demande).
    setEtape('Extraction du PDF (page 0/?)…');
    const { extraireTextePdfNavigateur } = await import('@/lib/pdf-navigateur');
    const texte = await extraireTextePdfNavigateur(
      await fichier.arrayBuffer(),
      (page, total) => {
        setEtape(`Extraction du PDF… page ${page}/${total}`);
      }
    );
    if (texte.trim().length < 200) {
      throw new Error(
        "Le texte du PDF semble vide ou illisible (PDF scanné ?). Format conseillé : .txt/.md."
      );
    }
    return texte;
  }

  async function importerFichier(fichier: File) {
    if (!EXTENSIONS.test(fichier.name)) {
      setErreur(
        'Format non supporté : choisis un fichier .txt, .md, .pdf ou .epub.'
      );
      return;
    }
    setErreur(null);
    setEnCours(true);

    try {
      // 1. Lire les chapitres selon le format du fichier.
      let livre: ReturnType<typeof preparerLivre>;

      if (/\.(epub)$/i.test(fichier.name)) {
        // EPUB : dézippage local (jszip), chapitres lus dans l'ordre
        // de lecture (spine) — rien n'est envoyé à un serveur tiers.
        setEtape('Ouverture de l’EPUB…');
        // Chargé à la demande : jszip (~40 Ko gzip) ne sert qu'ici et
        // n'a pas à peser sur le bundle de la bibliothèque.
        const { lireEpub } = await import('@/lib/import-epub');
        const octets = await fichier.arrayBuffer();
        const contenu = await lireEpub(octets);
        if (contenu.chapitres.length === 0) {
          throw new Error('Aucun texte exploitable dans cet EPUB.');
        }
        setEtape('Découpage en segments…');
        livre = preparerLivreDepuisChapitres(
          contenu.chapitres,
          contenu.titre,
          contenu.auteur
        );
      } else {
        const texte = await lireTexte(fichier);
        setEtape('Découpage du texte…');
        livre = preparerLivre(texte, fichier.name);
      }

      // 1b. PDF : mesurer la mise en page (fichier ENCORE EN MÉMOIRE) et
      // la réduire aux 3 nombres stockés en base — le binaire n'est plus
      // nécessaire ensuite. Rien n'est envoyé sur le serveur ; l'original
      // n'est gardé qu'en mémoire pour la session d'import en cours.
      const estPdf = /\.pdf$/i.test(fichier.name);
      let geo: GeometrieStockee | null = null;
      let octetsPdf: Uint8Array | null = null;
      if (estPdf) {
        setEtape('Mesure de la mise en page du PDF…');
        const { mesurerOriginalPdf } = await import('@/lib/pdf-navigateur');
        octetsPdf = new Uint8Array(await fichier.arrayBuffer());
        // pdf.js détache son buffer : on lui passe une copie.
        geo = resumerGeo(await mesurerOriginalPdf(octetsPdf.slice()));
      }
      const supabase = creerClientNavigateur();

      // 2. Création du livre.
      setEtape('Création du livre…');
      const { data: livreInsere, error: errLivre } = await supabase
        .from('livres')
        .insert({
          titre: livre.titre,
          auteur: livre.auteur || null,
          langue_source: source,
          langue_cible: cible,
          nom_fichier: fichier.name,
          statut: 'importe',
        })
        .select('id')
        .single();
      if (errLivre || !livreInsere) {
        throw new Error(errLivre?.message ?? 'Impossible de créer le livre.');
      }

      // 2b. Plus AUCUN téléversement du fichier original : le texte est
      // déjà intégralement en base (chapitres.texte_source +
      // segments.source) et la géométrie tient en 3 nombres. Le binaire
      // n'est gardé qu'EN MÉMOIRE, le temps de la session d'import, pour
      // l'export « PDF — mise en page d'origine » (fichier en mémoire).
      if (octetsPdf) memoriserOriginal(livreInsere.id, octetsPdf);

      // 3. Insertion des chapitres puis des segments (par lots).
      for (const chapitre of livre.chapitres) {
        setEtape(
          `Insertion « ${chapitre.titre} » (${chapitre.segments.length} segments)…`
        );
        const { error: errChap } = await supabase.from('chapitres').insert({
          id: chapitre.id,
          livre_id: livreInsere.id,
          position: chapitre.position,
          titre: chapitre.titre,
          texte_source: chapitre.texte_source,
          statut: 'a_traduire',
        });
        if (errChap) throw new Error(errChap.message);

        for (let i = 0; i < chapitre.segments.length; i += TAILLE_LOT) {
          const lot = chapitre.segments
            .slice(i, i + TAILLE_LOT)
            .map((s) => ({
              chapitre_id: chapitre.id,
              position: s.position,
              source: s.source,
              suite: s.suite,
            }));
          const { error: errSeg } = await supabase.from('segments').insert(lot);
          if (errSeg) throw new Error(errSeg.message);
        }
      }

      // 4. Le livre est prêt à être traduit. La géométrie est enregistrée
      // en 3 nombres (import PDF) ; plus aucun original côté serveur.
      await supabase
        .from('livres')
        .update({
          statut: 'pret',
          ...(geo
            ? {
                pdf_largeur: geo.largeur,
                pdf_hauteur: geo.hauteur,
                pdf_marge: geo.margeEnBloc,
              }
            : {}),
        })
        .eq('id', livreInsere.id);

      setEtape(null);
      routeur.push(`/livres/${livreInsere.id}`);
      routeur.refresh();
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Erreur inattendue à l’import.'
      );
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="velours p-5 sm:p-6 animate-fondu-monte">
      <h2 className="font-display text-lg text-encre-100 mb-4">
        Importer un livre
      </h2>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
              Langue source
            </label>
            <select
              className="select-sombre w-full"
              value={source}
              onChange={(e) => setSource(e.target.value as CodeLangue)}
            >
              {CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUES[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
              Langue cible
            </label>
            <select
              className="select-sombre w-full"
              value={cible}
              onChange={(e) => setCible(e.target.value as CodeLangue)}
            >
              {CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUES[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-encre-500 md:max-w-60 leading-snug">
          Fichiers <code className="text-grenat-300">.txt</code>,{' '}
          <code className="text-grenat-300">.md</code>,{' '}
          <code className="text-grenat-300">.pdf</code> ou{' '}
          <code className="text-grenat-300">.epub</code> — chapitres détectés
          automatiquement, PDF/EPUB extraits localement (rien n’est envoyé).
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.epub"
        className="hidden"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) importerFichier(fichier);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        disabled={enCours}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          const fichier = e.dataTransfer.files?.[0];
          if (fichier) importerFichier(fichier);
        }}
        className={`zone-depot w-full py-10 text-center transition-all ${
          survol ? 'actif' : ''
        }`}
      >
        {enCours ? (
          <span className="animate-pouls-doux text-grenat-300 text-sm">
            {etape ?? 'Import en cours…'}
          </span>
        ) : (
          <>
            <p className="text-3xl mb-2 opacity-80">🕯️</p>
            <p className="text-encre-100 text-sm font-medium">
              Déposer un manuscrit — glissez-le ici, ou cliquez pour parcourir
            </p>
            <p className="text-encre-500 text-xs mt-1 italic">
              .txt, .md, .pdf ou .epub · jusqu’à ~1000 pages · découpage
              automatique, traduction reprenable à tout moment
            </p>
          </>
        )}
      </button>

      {erreur && (
        <p className="text-sm text-grenat-300 bg-grenat-700/20 border border-grenat-700/50 rounded-xl px-4 py-2.5 mt-4">
          {erreur}
        </p>
      )}
    </div>
  );
}
