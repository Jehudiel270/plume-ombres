'use client';

// ============================================================
// ZoneImport.tsx — Import d'un livre (.txt / .md / .pdf).
// - .txt / .md : lu tel quel (UTF-8).
// - .pdf      : texte extrait dans le navigateur (pdf.js), puis
//   le même pipeline (chapitres → segments → Supabase) s'applique.
// RLS : l'utilisateur connecté est le propriétaire.
// ============================================================

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { preparerLivre } from '@/lib/import-livre';
import type { CodeLangue } from '@/lib/types';
import { LANGUES } from '@/lib/types';

const CODES = Object.keys(LANGUES) as CodeLangue[];
const TAILLE_LOT = 400; // lignes insérées par requête
const EXTENSIONS = /\.(txt|md|markdown|pdf)$/i;

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
        'Format non supporté : choisis un fichier .txt, .md ou .pdf.'
      );
      return;
    }
    setErreur(null);
    setEnCours(true);

    try {
      const texte = await lireTexte(fichier);

      // 1. Découpage en chapitres puis préparation des segments.
      setEtape('Découpage du texte…');
      const livre = preparerLivre(texte, fichier.name);
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

      // 2b. Conservation du fichier ORIGINAL (mise en forme intacte) :
      // stocké dans le bucket privé « originaux », téléchargeable ensuite.
      let cheminOriginal: string | null = null;
      try {
        const extension = fichier.name.includes('.')
          ? fichier.name.slice(fichier.name.lastIndexOf('.'))
          : '';
        cheminOriginal = `${livreInsere.id}${extension}`;
        const { error: errUpload } = await supabase.storage
          .from('originaux')
          .upload(cheminOriginal, fichier, {
            contentType: fichier.type || 'application/octet-stream',
            upsert: true,
          });
        if (errUpload) throw errUpload;
      } catch (e) {
        // L'import ne doit pas échouer si la conservation échoue :
        cheminOriginal = null;
        console.warn(
          'Original non conservé :',
          e instanceof Error ? e.message : e
        );
      }

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

      // 4. Le livre est prêt à être traduit (avec l'original conservé si possible).
      await supabase
        .from('livres')
        .update({ statut: 'pret', fichier_original: cheminOriginal })
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
          <code className="text-grenat-300">.md</code> ou{' '}
          <code className="text-grenat-300">.pdf</code> — chapitres détectés
          automatiquement, PDF extrait localement (rien n’est envoyé).
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf"
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
              .txt, .md ou .pdf · jusqu’à ~1000 pages · découpage automatique,
              traduction reprenable à tout moment
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
