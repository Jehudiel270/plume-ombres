'use client';

// ============================================================
// EspaceLivre.tsx — Espace de travail d'un livre.
// Colonne de gauche : chapitres (statut, actions).
// Colonne de droite : lecture (source/traduit), commandes de
// traduction (file d'attente, progression, annulation), export.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { paginer } from '@/lib/pagination';
import type {
  Chapitre,
  CodeLangue,
  Livre,
  StatutChapitre,
} from '@/lib/types';
import { LANGUES } from '@/lib/types';
import { useMoteurTraduction } from '@/lib/useMoteurTraduction';

const CODES = Object.keys(LANGUES) as CodeLangue[];

interface ChapitreLeger {
  id: string;
  position: number;
  titre: string;
  statut: StatutChapitre;
}

const ETIQUETTE_STATUT_CHAPITRE: Record<StatutChapitre, string> = {
  a_traduire: 'À traduire',
  en_traduction: 'En cours…',
  traduit: 'Traduit',
  erreur: 'À reprendre',
};

const POINT_STATUT: Record<StatutChapitre, string> = {
  a_traduire: 'bg-encre-500',
  en_traduction: 'bg-grenat-400 animate-pouls-doux',
  traduit: 'bg-emerald-400',
  erreur: 'bg-amber-400',
};

interface Compteurs {
  total: number;
  faits: number;
  erreurs: number;
}

export default function EspaceLivre({
  livreInitial,
  chapitresInitiaux,
}: {
  livreInitial: Livre;
  chapitresInitiaux: ChapitreLeger[];
}) {
  const supabaseRef = useRef(creerClientNavigateur());
  const requeteRef = useRef<string | null>(null);

  const [livre, setLivre] = useState(livreInitial);
  const [chapitres, setChapitres] = useState(chapitresInitiaux);
  const [selection, setSelection] = useState<string | null>(
    chapitresInitiaux[0]?.id ?? null
  );
  const [chapitreComplet, setChapitreComplet] = useState<Chapitre | null>(null);
  const [lecture, setLecture] = useState<'source' | 'traduit'>('source');
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [messageLangue, setMessageLangue] = useState<string | null>(null);

  const { actif, progression, lancer, annuler } = useMoteurTraduction();

  // ---------- Chargement d'un chapitre complet (textes) ----------
  // Chargement piloté par la sélection ; l'état « en chargement » est
  // dérivé (aucun setState synchrone dans l'effet).
  const chargementChapitre =
    !!selection && (!chapitreComplet || chapitreComplet.id !== selection);

  useEffect(() => {
    if (!selection) return;
    const id = selection;
    requeteRef.current = id;
    let ignore = false;
    (async () => {
      const { data } = await supabaseRef.current
        .from('chapitres')
        .select('*')
        .eq('id', id)
        .single();
      if (ignore || requeteRef.current !== id) return;
      if (data) {
        const chapitre = data as Chapitre;
        setChapitreComplet(chapitre);
        // Le chapitre traduit s'affiche d'emblée dans sa traduction.
        if (chapitre.texte_traduit) setLecture('traduit');
      }
    })();
    return () => {
      ignore = true;
    };
  }, [selection]);

  // ---------- Compteurs de progression (ensemble du livre) ----------
  const rafraichirCompteurs = useCallback(async () => {
    if (chapitres.length === 0) return;
    const ids = chapitres.map((c) => c.id);
    const lignes = await paginer<{ statut: string }>((debut, fin) =>
      supabaseRef.current
        .from('segments')
        .select('statut')
        .in('chapitre_id', ids)
        .range(debut, fin)
    );
    setCompteurs({
      total: lignes.length,
      faits: lignes.filter((l) => l.statut === 'fait').length,
      erreurs: lignes.filter((l) => l.statut === 'erreur').length,
    });
  }, [chapitres]);

  useEffect(() => {
    rafraichirCompteurs();
  }, [rafraichirCompteurs, actif]);

  // ---------- Fin d'un chapitre côté moteur ----------
  const majChapitre = useCallback(
    (chapitre: Chapitre, texteTraduit: string, statut: StatutChapitre) => {
      setChapitres((cs) =>
        cs.map((c) => (c.id === chapitre.id ? { ...c, statut } : c))
      );
      setChapitreComplet((courant) =>
        courant && courant.id === chapitre.id
          ? { ...courant, texte_traduit: texteTraduit, statut }
          : courant
      );
      setLivre((l) => ({
        ...l,
        statut:
          statut === 'erreur' ? 'erreur' : statut === 'traduit' ? 'traduit' : l.statut,
      }));
      rafraichirCompteurs();
    },
    [rafraichirCompteurs]
  );

  // ---------- Lancement de traductions ----------
  const traduireSelection = useCallback(async () => {
    if (!selection) return;
    const chapitre = chapitres.find((c) => c.id === selection);
    if (!chapitre) return;
    setLecture('traduit'); // on verra le texte se construire
    const { data } = await supabaseRef.current
      .from('chapitres')
      .select('*')
      .eq('id', chapitre.id)
      .single();
    if (!data) return;
    await lancer(supabaseRef.current, [data as Chapitre], livre, majChapitre);
  }, [selection, chapitres, livre, lancer, majChapitre]);

  const toutTraduire = useCallback(async () => {
    const { data: tous } = await supabaseRef.current
      .from('chapitres')
      .select('*')
      .eq('livre_id', livre.id)
      .order('position', { ascending: true });
    const restants = ((tous ?? []) as Chapitre[]).filter(
      (c) => c.statut !== 'traduit'
    );
    if (restants.length === 0) return;
    setLecture('traduit');
    await lancer(supabaseRef.current, restants, livre, majChapitre);
    rafraichirCompteurs();
  }, [livre, lancer, majChapitre, rafraichirCompteurs]);

  // ---------- Export ----------
  function telecharger(contenu: string, nomFichier: string, type: string) {
    const blob = new Blob([contenu], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }

  function telechargerBlob(blob: Blob, nomFichier: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }

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
  }, [livre.id]);

  const exporterLivre = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitres = await chargerChapitresExport();
      const contenu = chapitres
        .map((c) => `# ${c.titre}\n\n${c.texte.trimEnd()}\n`)
        .join('\n\n---\n\n');
      telecharger(
        contenu,
        `${livre.titre} — traduction.md`,
        'text/markdown'
      );
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport]);

  /** Export Word (.docx) mis en forme — conserve tout le reste. */
  const exporterLivreDocx = useCallback(async () => {
    setExportEnCours(true);
    try {
      const chapitres = await chargerChapitresExport();
      const { genererDocx } = await import('@/lib/export-docx');
      const blob = await genererDocx(livre.titre, chapitres);
      telechargerBlob(blob, `${livre.titre} — traduction.docx`);
    } catch (e) {
      setMessageLangue(
        `Export Word impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    } finally {
      setExportEnCours(false);
    }
  }, [livre.titre, chargerChapitresExport]);

  /** Impression / « Enregistrer en PDF » du livre mis en forme. */
  const imprimerLivrePdf = useCallback(async () => {
    const chapitres = await chargerChapitresExport();
    const { imprimerLivre } = await import('@/lib/imprimer-pdf');
    imprimerLivre(livre.titre, chapitres);
  }, [livre.titre, chargerChapitresExport]);

  /** Télécharge le fichier ORIGINAL (mise en forme d'origine intacte). */
  const telechargerOriginal = useCallback(async () => {
    if (!livre.fichier_original) {
      setMessageLangue(
        "L'original n'a pas été conservé pour ce livre (import avant cette fonctionnalité)."
      );
      return;
    }
    try {
      const { data, error } = await supabaseRef.current.storage
        .from('originaux')
        .download(livre.fichier_original);
      if (error || !data) throw error ?? new Error('Téléchargement impossible.');
      telechargerBlob(data, livre.nom_fichier ?? 'original');
    } catch (e) {
      setMessageLangue(
        `Original indisponible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
      );
    }
  }, [livre.fichier_original, livre.nom_fichier]);

  // ---------- Langues du livre ----------
  async function changerLangues(source: string, cible: string) {
    if (source === cible) {
      setMessageLangue('La langue source et la langue cible doivent différer.');
      return;
    }
    setMessageLangue(null);
    const { error } = await supabaseRef.current
      .from('livres')
      .update({ langue_source: source, langue_cible: cible })
      .eq('id', livre.id);
    if (error) {
      setMessageLangue(`Erreur : ${error.message}`);
      return;
    }
    setLivre((l) => ({ ...l, langue_source: source, langue_cible: cible }));
    setMessageLangue(
      'Langues mises à jour pour les prochaines traductions. Les segments déjà traduits sont conservés.'
    );
  }

  // ---------- Divers ----------
  const texteAffiche = useMemo(() => {
    if (!chapitreComplet) return '';
    if (lecture === 'traduit')
      return chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    return chapitreComplet.texte_source;
  }, [chapitreComplet, lecture]);

  const pourcentage =
    compteurs && compteurs.total > 0
      ? Math.round((compteurs.faits / compteurs.total) * 100)
      : 0;

  const chapitreActuel = chapitres.find((c) => c.id === selection) ?? null;

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[70vh]">
      {/* ======== Colonne gauche : chapitres ======== */}
      <aside className="w-full lg:w-80 shrink-0">
        <div className="velours p-4 flex flex-col h-full max-h-[75vh] lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs uppercase tracking-[0.25em] text-encre-500">
              Chapitres
            </h2>
            <span className="text-[11px] text-encre-500">
              {chapitres.length}
            </span>
          </div>

          <nav className="space-y-1 overflow-y-auto pr-1 flex-1">
            {chapitres.map((chapitre) => (
              <button
                key={chapitre.id}
                type="button"
                onClick={() => setSelection(chapitre.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer border ${
                  selection === chapitre.id
                    ? 'bg-nuit-700/60 border-grenat-700 text-encre-100'
                    : 'border-transparent hover:bg-nuit-700/40 text-encre-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${POINT_STATUT[chapitre.statut]}`}
                  title={ETIQUETTE_STATUT_CHAPITRE[chapitre.statut]}
                />
                <span className="truncate text-sm">{chapitre.titre}</span>
              </button>
            ))}
          </nav>

          {/* Progression globale */}
          {compteurs && compteurs.total > 0 && (
            <div className="mt-4 pt-4 border-t border-nuit-700/60 px-1">
              <div className="flex justify-between text-[11px] text-encre-500 mb-1.5">
                <span>
                  {compteurs.faits} / {compteurs.total} segments
                </span>
                <span>{pourcentage} %</span>
              </div>
              <div className="h-1.5 rounded-full bg-nuit-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-grenat-500 to-violet-rom-500 transition-all duration-500"
                  style={{ width: `${pourcentage}%` }}
                />
              </div>
              {compteurs.erreurs > 0 && (
                <p className="text-[11px] text-amber-300 mt-1.5">
                  ⚠ {compteurs.erreurs} segment(s) en erreur — relance une
                  traduction pour réessayer.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ======== Colonne droite : lecture & actions ======== */}
      <section className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Bandeau d'actions */}
        <div className="velours p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 mr-auto">
            <Link
              href="/bibliotheque"
              className="text-[11px] text-encre-500 hover:text-grenat-300 transition-colors"
            >
              ← Bibliothèque
            </Link>
            <h1 className="font-display text-xl text-encre-100 truncate leading-snug">
              {livre.titre}
            </h1>
            <p className="text-[11px] text-encre-500">
              {LANGUES[livre.langue_source as CodeLangue]} →{' '}
              {LANGUES[livre.langue_cible as CodeLangue]}
            </p>
          </div>

          <select
            className="select-sombre text-xs"
            value={livre.langue_source}
            onChange={(e) =>
              changerLangues(e.target.value, livre.langue_cible)
            }
            title="Langue source"
          >
            {CODES.map((c) => (
              <option key={c} value={c}>
                {LANGUES[c]}
              </option>
            ))}
          </select>
          <span className="text-encre-500 text-xs">→</span>
          <select
            className="select-sombre text-xs"
            value={livre.langue_cible}
            onChange={(e) =>
              changerLangues(livre.langue_source, e.target.value)
            }
            title="Langue cible"
          >
            {CODES.map((c) => (
              <option key={c} value={c}>
                {LANGUES[c]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={exporterChapitre}
            disabled={!chapitreComplet || exportEnCours}
            className="bouton-fantome text-xs"
            title="Exporter le chapitre courant (.md)"
          >
            ↧ Chapitre
          </button>
          <button
            type="button"
            onClick={exporterLivre}
            disabled={exportEnCours}
            className="bouton-fantome text-xs"
            title="Exporter le livre entier (.md)"
          >
            ↧ Livre (.md)
          </button>
          <button
            type="button"
            onClick={exporterLivreDocx}
            disabled={exportEnCours}
            className="bouton-principal !px-3 !py-1.5 text-xs"
            title="Télécharger le livre mis en forme (Word)"
          >
            ↧ Word (.docx)
          </button>
          <button
            type="button"
            onClick={imprimerLivrePdf}
            disabled={exportEnCours}
            className="bouton-fantome text-xs"
            title="Mise en page puis « Enregistrer en PDF »"
          >
            🖨 PDF
          </button>
          {livre.fichier_original && (
            <button
              type="button"
              onClick={telechargerOriginal}
              disabled={exportEnCours}
              className="bouton-fantome text-xs"
              title="Télécharger le fichier original (mise en forme d’origine intacte)"
            >
              ↧ Original
            </button>
          )}
        </div>

        {messageLangue && (
          <p className="text-xs text-grenat-300 bg-grenat-700/15 border border-grenat-700/40 rounded-xl px-4 py-2">
            {messageLangue}
          </p>
        )}

        {/* Progression de la traduction en cours */}
        {actif && (
          <div className="velours p-4 animate-fondu-monte border-grenat-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <p className="text-sm text-encre-100 mb-1.5">
                  {progression.chapitreEnCours
                    ? `Traduction de « ${progression.chapitreEnCours.titre} »…`
                    : 'Préparation…'}
                </p>
                <div className="h-2 rounded-full bg-nuit-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-grenat-400 via-grenat-500 to-violet-rom-500 transition-all duration-300"
                    style={{
                      width: `${
                        progression.total > 0
                          ? Math.round(
                              ((progression.faits + progression.erreurs) /
                                progression.total) *
                                100
                            )
                          : 4
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-encre-500 mt-1.5">
                  {progression.faits + progression.erreurs} /{' '}
                  {progression.total} segments traités
                  {progression.erreurs > 0 &&
                    ` · ${progression.erreurs} en erreur`}
                </p>
              </div>
              <button
                type="button"
                onClick={annuler}
                className="bouton-fantome !border-amber-500/50 text-amber-300 text-xs"
              >
                ■ Annuler
              </button>
            </div>
          </div>
        )}

        {/* Commandes de traduction */}
        {!actif && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={traduireSelection}
              disabled={
                !chapitreActuel || chapitreActuel.statut === 'traduit'
              }
              className="bouton-principal text-sm"
              title={
                chapitreActuel?.statut === 'traduit'
                  ? 'Chapitre déjà traduit'
                  : 'Traduire le chapitre sélectionné'
              }
            >
              {chapitreActuel?.statut === 'a_traduire'
                ? 'Traduire ce chapitre'
                : chapitreActuel?.statut === 'erreur'
                  ? 'Reprendre ce chapitre'
                  : 'Traduire ce chapitre'}
            </button>
            <button
              type="button"
              onClick={toutTraduire}
              disabled={compteurs !== null && compteurs.total === compteurs.faits}
              className="bouton-fantome text-sm"
            >
              Tout traduire
            </button>
            {chapitreActuel && (
              <span
                className={`text-[11px] uppercase tracking-wider rounded-full px-2.5 py-1 ${
                  chapitreActuel.statut === 'traduit'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : chapitreActuel.statut === 'en_traduction'
                      ? 'bg-grenat-500/15 text-grenat-300'
                      : chapitreActuel.statut === 'erreur'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-encre-500/15 text-encre-300'
                }`}
              >
                {ETIQUETTE_STATUT_CHAPITRE[chapitreActuel.statut]}
              </span>
            )}
          </div>
        )}

        {/* Bascule source / traduction */}
        {chapitreComplet?.texte_traduit && (
          <div className="flex rounded-full bg-nuit-800 p-1 w-fit border border-nuit-700">
            <button
              type="button"
              onClick={() => setLecture('source')}
              className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
                lecture === 'source'
                  ? 'bg-nuit-700 text-encre-100'
                  : 'text-encre-500 hover:text-encre-300'
              }`}
            >
              {LANGUES[livre.langue_source as CodeLangue]}
            </button>
            <button
              type="button"
              onClick={() => setLecture('traduit')}
              className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
                lecture === 'traduit'
                  ? 'bg-nuit-700 text-encre-100'
                  : 'text-encre-500 hover:text-encre-300'
              }`}
            >
              {LANGUES[livre.langue_cible as CodeLangue]}
            </button>
          </div>
        )}

        {/* Lecteur — façon livre : surface calme, colonne ~65 caractères */}
        <div className="lecture velours p-6 sm:p-12 flex-1 min-h-[40vh]">
          {chargementChapitre ? (
            <p className="text-encre-500 text-sm animate-pouls-doux text-center">
              Ouverture du chapitre…
            </p>
          ) : !chapitreComplet ? (
            <p className="text-encre-500 text-sm italic text-center">
              Choisissez un chapitre dans la liste.
            </p>
          ) : (
            <article className="animate-fondu-monte colonne-lecture">
              <header className="text-center mb-10">
                <p className="sur-titre text-grenat-400/80 mb-2">
                  ✦ chapitre ✦
                </p>
                <h2 className="font-display text-2xl sm:text-4xl text-encre-100 leading-snug">
                  {chapitreComplet.titre}
                </h2>
                <div className="liseret mx-auto mt-5" />
              </header>
              {texteAffiche.trim().length === 0 ? (
                <p className="text-encre-500 italic text-center text-sm">
                  Ce chapitre est vide.
                </p>
              ) : (
                <div className="whitespace-pre-wrap font-lecture text-[15px] sm:text-[17px] leading-[1.75] text-encre-100/95 first-letter:float-left first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:pr-3 first-letter:text-grenat-400">
                  {texteAffiche.trim()}
                </div>
              )}
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
