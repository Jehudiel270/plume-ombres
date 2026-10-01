'use client';

// ============================================================
// EspaceLivre.tsx — Espace de travail d'un livre (orchestration).
// Colonne de gauche : chapitres (sommaire, progression).
// Colonne de droite : lecture, commandes de traduction, exports.
//
// Le rendu est délégué aux composants de `components/lecteur/` :
//  - Sommaire           : liste des chapitres + progression ;
//  - BarreActions       : bandeau (titre, langues) + Exports ;
//  - Exports            : boutons d'export ;
//  - CommandesTraduction: traduction + bascule source/traduit ;
//  - Lecteur            : surface de lecture (recherche incluse) ;
//  - useExports         : état et logique des exports.
// Chaque sous-composant est mémoïsé (React.memo) et ne reçoit que
// des props stables (callbacks `useCallback`), pour qu'un changement
// d'état local (recherche, réglages, message) ne re-rende plus tout
// l'espace de travail.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { paginer } from '@/lib/pagination';
import type { Chapitre, Livre, StatutChapitre } from '@/lib/types';
import { useMoteurTraduction } from '@/lib/useMoteurTraduction';
import { useLecture } from '@/lib/useLecture';
import { CLEF_PROGRESSION } from '@/lib/progression';
import Sommaire from '@/components/lecteur/Sommaire';
import BarreActions from '@/components/lecteur/BarreActions';
import CommandesTraduction from '@/components/lecteur/CommandesTraduction';
import Lecteur from '@/components/lecteur/Lecteur';
import { useExports } from '@/components/lecteur/useExports';
import type { ChapitreLeger, Compteurs } from '@/components/lecteur/partages';

export default function EspaceLivre({
  livreInitial,
  chapitresInitiaux,
  totalCaracteres,
}: {
  livreInitial: Livre;
  chapitresInitiaux: ChapitreLeger[];
  /** Nombre total de caractères du livre (estimation du temps de lecture). */
  totalCaracteres: number;
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
  const [messageLangue, setMessageLangue] = useState<string | null>(null);

  const { actif, progression, lancer, annuler } = useMoteurTraduction();

  // ---------- Progression de lecture + stats (100 % local) ----------
  const {
    tempsLecture,
    tempsEstime,
    etiquetteReprise,
    chapitreReprendre,
    enregistrer,
  } = useLecture({
    livreId: livre.id,
    chapitres,
    totalCaracteres,
  });

  // Élément du lecteur mesuré pour calculer le ratio de texte lu.
  const corpsLectureRef = useRef<HTMLDivElement | null>(null);

  /** Ratio (0 → 1) du texte du chapitre déjà lu, dérivé du défilement. */
  function ratioLecture(): number {
    const corps = corpsLectureRef.current;
    if (!corps) return 0;
    // Le corps du chapitre est très haut : on mesure quelle longueur de
    // texte est passée sous l'œil (le haut du corps remonte à l'écran).
    const haut = corps.getBoundingClientRect().top;
    const defilement = -haut; // px de texte déjà passés sous l'œil
    const longueur = corps.scrollHeight * 0.8 || 1; // borne défensive
    return Math.min(1, Math.max(0, defilement / longueur));
  }

  /** Persiste le point de lecture (débrayé : 1 s max entre écritures). */
  const derniersEnregistrets = useRef(0);
  useEffect(() => {
    if (!selection) return;
    const idChapitre = selection;
    function surDefilement() {
      const maintenant = Date.now();
      if (maintenant - derniersEnregistrets.current < 1000) return;
      derniersEnregistrets.current = maintenant;
      enregistrer(idChapitre, ratioLecture());
    }
    surDefilement();
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => window.removeEventListener('scroll', surDefilement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, chapitreComplet?.id]);

  // Au retour sur un livre déjà ouvert : on réouvre et on positionne
  // la lecture là où l'utilisateur l'avait laissée.
  const repriseFait = useRef(false);
  useEffect(() => {
    if (repriseFait.current || !chapitreReprendre) return;
    repriseFait.current = true;
    setSelection(chapitreReprendre);
  }, [chapitreReprendre]);
  /** Ratio enregistré pour un chapitre donné (0 si inconnu). */
  function ratioLectureCible(chapitreId: string): number {
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      if (!brut) return 0;
      const p = JSON.parse(brut) as {
        livreId?: string;
        chapitreId?: string;
        ratio?: number;
      };
      if (p.livreId !== livre.id || p.chapitreId !== chapitreId) return 0;
      return typeof p.ratio === 'number' ? Math.min(Math.max(p.ratio, 0), 1) : 0;
    } catch {
      return 0;
    }
  }

  // Repositionnement une fois le chapitre chargé et le texte posé.
  useEffect(() => {
    if (!chapitreComplet) return;
    const id = chapitreComplet.id;
    const timer = window.setTimeout(() => {
      const corps = corpsLectureRef.current;
      if (!corps) return;
      const ratio = ratioLectureCible(id);
      if (ratio <= 0.02) return;
      // Le point de reprise est à `ratio` de la longueur du texte : on
      // défile pour qu'il se trouve légèrement sous le haut de l'écran.
      const defilement = ratio * 0.8 * corps.scrollHeight;
      const hautAbsolu = corps.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, hautAbsolu + defilement - window.innerHeight * 0.08),
        behavior: 'auto',
      });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapitreComplet?.id]);

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

  // ---------- Exports (état + logique dans le hook) ----------
  const {
    exportEnCours,
    genPdf,
    exportFidele,
    exporterChapitre,
    exporterLivre,
    exporterLivreDocx,
    imprimerLivrePdf,
    telechargerPdfTraduit,
    telechargerFidele,
  } = useExports({
    supabaseRef,
    livre,
    chapitreComplet,
    chapitres,
    setMessageLangue,
  });

  // ---------- Langues du livre ----------
  const changerLangues = useCallback(
    async (source: string, cible: string) => {
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
    },
    [livre.id]
  );

  // ---------- Divers ----------
  const texteAffiche = useMemo(() => {
    if (!chapitreComplet) return '';
    if (lecture === 'traduit')
      return chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    return chapitreComplet.texte_source;
  }, [chapitreComplet, lecture]);

  const texteNet = useMemo(() => texteAffiche.trim(), [texteAffiche]);

  const chapitreActuel = useMemo(
    () => chapitres.find((c) => c.id === selection) ?? null,
    [chapitres, selection]
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[70vh]">
      {/* ======== Colonne gauche : chapitres ======== */}
      <Sommaire
        chapitres={chapitres}
        selection={selection}
        onSelection={setSelection}
        compteurs={compteurs}
      />

      {/* ======== Colonne droite : lecture & actions ======== */}
      <section className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Bandeau d'actions */}
        <BarreActions
          livre={livre}
          tempsEstime={tempsEstime}
          tempsLecture={tempsLecture}
          chapitreDisponible={!!chapitreComplet}
          onChangerLangues={changerLangues}
          onExporterChapitre={exporterChapitre}
          onExporterLivre={exporterLivre}
          onExporterLivreDocx={exporterLivreDocx}
          onImprimerLivrePdf={imprimerLivrePdf}
          onTelechargerPdfTraduit={telechargerPdfTraduit}
          onTelechargerFidele={telechargerFidele}
          exportEnCours={exportEnCours}
          genPdf={genPdf}
          exportFidele={exportFidele}
        />

        {/* Message langue / info */}
        {etiquetteReprise && (
          <p className="text-[11px] text-encre-500 -mt-2 px-1">
            ✦ Où vous êtes : {etiquetteReprise}
          </p>
        )}

        {messageLangue && (
          <p className="text-xs text-grenat-300 bg-grenat-700/15 border border-grenat-700/40 rounded-xl px-4 py-2">
            {messageLangue}
          </p>
        )}

        <CommandesTraduction
          actif={actif}
          progression={progression}
          onAnnuler={annuler}
          chapitreActuel={chapitreActuel}
          compteurs={compteurs}
          onTraduireSelection={traduireSelection}
          onToutTraduire={toutTraduire}
          lecture={lecture}
          onLecture={setLecture}
          texteTraduitDisponible={!!chapitreComplet?.texte_traduit}
          langueSource={livre.langue_source}
          langueCible={livre.langue_cible}
        />

        {/* Lecteur — façon livre : surface calme, colonne ~65 caractères */}
        <Lecteur
          chapitreComplet={chapitreComplet}
          chargementChapitre={chargementChapitre}
          texteNet={texteNet}
          corpsRef={corpsLectureRef}
        />
      </section>
    </div>
  );
}
