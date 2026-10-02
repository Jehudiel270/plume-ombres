'use client';

// ============================================================
// EspaceLivre.tsx — Espace de travail d'un livre (orchestration).
// Colonne de gauche : chapitres (sommaire, progression).
// Colonne de droite : lecture, commandes de traduction, exports.
//
// Le rendu est délégué aux composants de `components/lecteur/` :
//  - Sommaire           : liste des chapitres + progression (tiroir mobile) ;
//  - BarreActions       : bandeau (titre, langues) + Exports, condensé ;
//  - Exports            : boutons d'export ;
//  - CommandesTraduction: traduction + bascule source/traduit ;
//  - Lecteur            : surface de lecture (recherche incluse) ;
//  - useExports         : état et logique des exports.
// Chaque sous-composant est mémoïsé (React.memo) et ne reçoit que
// des props stables (callbacks `useCallback`), pour qu'un changement
// d'état local (recherche, réglages, message) ne re-rende plus tout
// l'espace de travail.
//
// Fluidité (vague 2 / C2) : le rafraîchissement des compteurs est un
// callback STABLE (la pagination des segments n'est plus relancée à
// chaque changement d'état) et le ratio de lecture se calcule sur une
// géométrie mise en cache — le défilement ne relit plus la mise en page.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { paginer } from '@/lib/pagination';
import type { Chapitre, Livre, StatutChapitre } from '@/lib/types';
import { useMoteurTraduction } from '@/lib/useMoteurTraduction';
import {
  ratioLectureColonnes,
  ratioLectureVertical,
  useLecture,
} from '@/lib/useLecture';
import { CLEF_PROGRESSION } from '@/lib/progression';
import Sommaire from '@/components/lecteur/Sommaire';
import BarreActions from '@/components/lecteur/BarreActions';
import CommandesTraduction from '@/components/lecteur/CommandesTraduction';
import Lecteur from '@/components/lecteur/Lecteur';
import { usePreferencesLecture } from '@/components/lecteur/ReglagesLecture';
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
  /** Tiroir de chapitres (mobile) : le texte reste en premier à l'écran. */
  const [tiroirOuvert, setTiroirOuvert] = useState(false);

  // La liste des chapitres est lue par `rafraichirCompteurs` à travers une
  // ref : le callback garde une identité STABLE quand un statut change, donc
  // la pagination des segments n'est plus relancée à chaque mise à jour
  // d'état (traduction, reprise, bascule source/traduit…).
  const chapitresRef = useRef(chapitres);
  useEffect(() => {
    chapitresRef.current = chapitres;
  }, [chapitres]);

  const { actif, progression, lancer, annuler, reprendre } =
    useMoteurTraduction();

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
  // Cadre défilant du mode « deux colonnes » (défilement horizontal).
  const cadreLectureRef = useRef<HTMLDivElement | null>(null);

  /** Préférences de confort de lecture (localStorage), partagées avec
   *  le lecteur : elles pilotent la typographie ET la géométrie, donc
   *  tout changement doit ré-armer les mesures de progression. */
  const preferences = usePreferencesLecture();

  /** Le mode deux colonnes n'est actif que sur grand écran (le CSS
   *  ignore les colonnes en dessous de 1024 px). */
  const enColonnes = useCallback((): boolean => {
    const cadre = cadreLectureRef.current;
    if (!cadre || cadre.dataset.colonnes !== '2') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  }, []);

  // Géométrie du corps du chapitre MESURÉE UNE FOIS par chapitre (et au
  // redimensionnement), puis réutilisée à chaque défilement : le calcul du
  // ratio ne relit plus la mise en page (getBoundingClientRect /
  // scrollHeight, qui forcent un recalcul) à chaque image, mais seulement
  // à intervalles espacés.
  const geometrieRef = useRef({ haut: 0, longueur: 1 });
  const derniereMesureRef = useRef(0);

  const mesurerCorps = useCallback(() => {
    const corps = corpsLectureRef.current;
    if (!corps) return;
    const haut = corps.getBoundingClientRect().top + window.scrollY;
    geometrieRef.current = {
      haut,
      // Le corps du chapitre est très haut : on mesure quelle longueur de
      // texte est passée sous l'œil (le haut du corps remonte à l'écran).
      longueur: corps.scrollHeight * 0.8 || 1, // borne défensive
    };
    derniereMesureRef.current = Date.now();
  }, []);

  /** Ratio (0 → 1) du texte du chapitre déjà lu.
   *  Deux modes : défilement VERTICAL (une colonne, arithmétique pure)
   *  ou défilement HORIZONTAL du cadre (deux colonnes). */
  const ratioLecture = useCallback((): number => {
    if (enColonnes()) return ratioLectureColonnes(cadreLectureRef.current);
    const { haut, longueur } = geometrieRef.current;
    return ratioLectureVertical({ haut, longueur }, window.scrollY);
  }, [enColonnes]);

  /** Persiste le point de lecture (débrayé : 1 s max entre écritures,
   *  un seul calcul par image via requestAnimationFrame). */
  const derniersEnregistrements = useRef(0);
  useEffect(() => {
    if (!selection) return;
    const idChapitre = selection;
    let image = 0;
    function surDefilement() {
      if (image) return; // une seule mesure par image
      image = window.requestAnimationFrame(() => {
        image = 0;
        const maintenant = Date.now();
        if (maintenant - derniersEnregistrements.current < 1000) return;
        derniersEnregistrements.current = maintenant;
        // Re-calage périodique de la géométrie (le texte peut se reposer
        // quand un bloc hors écran devient visible) : au plus 1 fois/2 s.
        if (maintenant - derniereMesureRef.current > 2000) mesurerCorps();
        enregistrer(idChapitre, ratioLecture());
      });
    }
    surDefilement();
    // `capture: true` : attrape aussi le défilement HORIZONTAL du cadre
    // à deux colonnes (les événements de défilement d'un élément ne
    // remontent pas jusqu'à window en phase de bouillonnement).
    window.addEventListener('scroll', surDefilement, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', mesurerCorps);
    return () => {
      if (image) window.cancelAnimationFrame(image);
      window.removeEventListener('scroll', surDefilement, { capture: true });
      window.removeEventListener('resize', mesurerCorps);
    };
  }, [
    selection,
    chapitreComplet?.id,
    enregistrer,
    ratioLecture,
    mesurerCorps,
    // Un changement de réglage (taille, interligne, mesure, colonnes…)
    // change la géométrie : on ré-arme la mesure et le défilement.
    preferences.prefs,
  ]);

  // Au retour sur un livre déjà ouvert : on réouvre et on positionne
  // la lecture là où l'utilisateur l'avait laissée.
  const repriseFait = useRef(false);
  useEffect(() => {
    if (repriseFait.current || !chapitreReprendre) return;
    repriseFait.current = true;
    setSelection(chapitreReprendre);
  }, [chapitreReprendre]);
  /** Ratio enregistré pour un chapitre donné (0 si inconnu).
   *  Stable (deps = [livre.id]) : l'effet de repositionnement ci-dessous
   *  ne se relance que si le CHAPITRE change, jamais à chaque rendu. */
  const ratioLectureCible = useCallback(
    (chapitreId: string): number => {
      try {
        const brut = window.localStorage.getItem(CLEF_PROGRESSION);
        if (!brut) return 0;
        const p = JSON.parse(brut) as {
          livreId?: string;
          chapitreId?: string;
          ratio?: number;
        };
        if (p.livreId !== livre.id || p.chapitreId !== chapitreId) return 0;
        return typeof p.ratio === 'number'
          ? Math.min(Math.max(p.ratio, 0), 1)
          : 0;
      } catch {
        return 0;
      }
    },
    [livre.id]
  );

  // Repositionnement une fois le chapitre chargé et le texte posé.
  const idChapitreAffiche = chapitreComplet?.id ?? null;
  useEffect(() => {
    if (!idChapitreAffiche) return;
    const timer = window.setTimeout(() => {
      const ratio = ratioLectureCible(idChapitreAffiche);
      // Deux colonnes : le point de reprise se retrouve dans le
      // défilement horizontal du cadre.
      if (enColonnes()) {
        const cadre = cadreLectureRef.current;
        if (!cadre) return;
        const course = cadre.scrollWidth - cadre.clientWidth;
        cadre.scrollTo({
          left: ratio <= 0.02 ? 0 : Math.max(0, ratio * course),
          behavior: 'auto',
        });
        return;
      }
      // On mesure une fois la géométrie, puis on n'utilise que des nombres.
      mesurerCorps();
      if (ratio <= 0.02) return;
      const { haut, longueur } = geometrieRef.current;
      // Le point de reprise est à `ratio` de la longueur du texte : on
      // défile pour qu'il se trouve légèrement sous le haut de l'écran.
      window.scrollTo({
        top: Math.max(0, haut + ratio * longueur - window.innerHeight * 0.08),
        behavior: 'auto',
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [idChapitreAffiche, mesurerCorps, ratioLectureCible, enColonnes]);

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
  // Callback STABLE (deps = [livre.id]) : la pagination des segments n'est
  // plus relancée à chaque changement de `chapitres` (donc à chaque statut
  // qui bouge, chaque frappe, chaque bascule). Si une lecture est déjà en
  // vol, on en programme UNE seule relance à la suite — jamais de compteurs
  // périmés, jamais de pagination en double.
  const compteursEnCours = useRef(false);
  const compteursARelancer = useRef(false);

  const rafraichirCompteurs = useCallback(async () => {
    if (compteursEnCours.current) {
      compteursARelancer.current = true;
      return;
    }
    compteursEnCours.current = true;
    try {
      do {
        compteursARelancer.current = false;
        const liste = chapitresRef.current;
        if (liste.length === 0) break;
        const ids = liste.map((c) => c.id);
        const lignes = await paginer<{ statut: string }>((debut, fin) =>
          supabaseRef.current
            .from('segments')
            .select('statut')
            .in('chapitre_id', ids)
            .range(debut, fin)
        );
        if (compteursARelancer.current) continue; // des écritures sont survenues
        setCompteurs({
          total: lignes.length,
          faits: lignes.filter((l) => l.statut === 'fait').length,
          erreurs: lignes.filter((l) => l.statut === 'erreur').length,
        });
      } while (compteursARelancer.current);
    } finally {
      compteursEnCours.current = false;
    }
  }, []);

  useEffect(() => {
    rafraichirCompteurs();
  }, [rafraichirCompteurs, actif]);

  // ---------- Reprise automatique des segments orphelins « en_cours » ----------
  // Au chargement / changement de chapitre : un onglet fermé (ou un crash)
  // en pleine traduction laisse des segments bloqués en « en_cours » que la
  // file ne reprend jamais (elle ne lit que « en_attente »/« erreur »). Au-delà
  // de ~10 min on les remet en attente, et si le chapitre se prétendait
  // « traduit »/« en_traduction » avec ce trou, on le corrige.
  useEffect(() => {
    if (!selection || actif) return;
    const id = selection;
    let ignore = false;
    (async () => {
      const repris = await reprendre(supabaseRef.current, id);
      if (ignore || repris === 0) return;
      const { data } = await supabaseRef.current
        .from('chapitres')
        .select('*')
        .eq('id', id)
        .single();
      if (ignore || !data) return;
      const chap = data as Chapitre;
      if (chap.statut === 'traduit' || chap.statut === 'en_traduction') {
        await supabaseRef.current
          .from('chapitres')
          .update({ statut: 'a_traduire' })
          .eq('id', id);
        chap.statut = 'a_traduire';
      }
      const statut = chap.statut;
      setChapitres((cs) =>
        cs.map((c) => (c.id === id ? { ...c, statut } : c))
      );
      setChapitreComplet((courant) =>
        courant && courant.id === id ? { ...courant, statut } : courant
      );
      rafraichirCompteurs();
    })();
    return () => {
      ignore = true;
    };
  }, [selection, actif, reprendre, rafraichirCompteurs]);

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

  // ---------- Chapitres en erreur + relance (P1.3) ----------
  // Le sommaire signale déjà chaque chapitre « à reprendre » (pastille
  // ambre) ; ce bandeau donne le NOMBRE et propose une relance réelle,
  // pour ne plus laisser une page incompréhensible sans issue.
  const chapitresEnErreur = useMemo(
    () => chapitres.filter((c) => c.statut === 'erreur'),
    [chapitres]
  );

  const relancerErreurs = useCallback(async () => {
    if (chapitresEnErreur.length === 0 || actif) return;
    const { data } = await supabaseRef.current
      .from('chapitres')
      .select('*')
      .in(
        'id',
        chapitresEnErreur.map((c) => c.id)
      )
      .order('position', { ascending: true });
    if (!data || data.length === 0) return;
    setLecture('traduit'); // on voit la traduction se reconstruire
    await lancer(supabaseRef.current, data as Chapitre[], livre, majChapitre);
    rafraichirCompteurs();
  }, [
    chapitresEnErreur,
    actif,
    lancer,
    livre,
    majChapitre,
    rafraichirCompteurs,
  ]);

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

  /** Langue du texte AFFICHÉ (source ou traduction) : elle pilote la
   *  césure (`hyphens: auto` a besoin d'un code de langue correct) et
   *  l'annonce du corps de texte aux lecteurs d'écran. */
  const langueAffichee = useMemo(() => {
    const brute =
      lecture === 'traduit' ? livre.langue_cible : livre.langue_source;
    return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(brute ?? '') ? brute : 'fr';
  }, [lecture, livre.langue_source, livre.langue_cible]);

  const chapitreActuel = useMemo(
    () => chapitres.find((c) => c.id === selection) ?? null,
    [chapitres, selection]
  );

  // ---------- Navigation chapitre par chapitre + tiroir (mobile) ----------
  const indexSelection = useMemo(
    () => chapitres.findIndex((c) => c.id === selection),
    [chapitres, selection]
  );
  const chapitrePrecedentId =
    indexSelection > 0 ? chapitres[indexSelection - 1].id : null;
  const chapitreSuivantId =
    indexSelection >= 0 && indexSelection < chapitres.length - 1
      ? chapitres[indexSelection + 1].id
      : null;

  /** Change de chapitre depuis les boutons suivant/précédent : on remonte
   *  en haut du texte (l'effet de reprise repositionne ensuite s'il y a
   *  un point de lecture enregistré). Callback stable. */
  const naviguerVers = useCallback((id: string) => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    cadreLectureRef.current?.scrollTo({ left: 0, behavior: 'auto' });
    setSelection(id);
  }, []);

  const ouvrirTiroir = useCallback(() => setTiroirOuvert(true), []);
  const fermerTiroir = useCallback(() => setTiroirOuvert(false), []);

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[70vh]">
      {/* ======== Colonne gauche : chapitres (tiroir sur mobile) ======== */}
      <Sommaire
        chapitres={chapitres}
        selection={selection}
        onSelection={setSelection}
        compteurs={compteurs}
        tiroirOuvert={tiroirOuvert}
        onFermerTiroir={fermerTiroir}
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

        {/* Chapitres en erreur (P1.3) : le sommaire montre les pastilles
            ambre, ce bandeau donne le compte et la relance. */}
        {chapitresEnErreur.length > 0 && (
          <div
            data-alerte-chapitres-livre
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            <p className="flex items-start gap-2">
              <span aria-hidden>⚠</span>
              <span className="leading-relaxed">
                <strong className="text-amber-100">
                  {chapitresEnErreur.length === 1
                    ? '1 chapitre n’a pas pu être traduit'
                    : `${chapitresEnErreur.length} chapitres n’ont pas pu être traduits`}
                </strong>{' '}
                —{' '}
                {chapitresEnErreur
                  .slice(0, 6)
                  .map((c) => c.titre)
                  .join(' · ')}
                {chapitresEnErreur.length > 6
                  ? ` · +${chapitresEnErreur.length - 6} autre(s)`
                  : ''}
              </span>
            </p>
            <button
              type="button"
              onClick={relancerErreurs}
              disabled={actif}
              title="Reprendre la traduction des chapitres en échec"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-300"
            >
              <span aria-hidden>↻</span>
              Relancer la traduction
            </button>
          </div>
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

        {/* Lecteur — confort de lecture : mesures, thème et
            espacements pilotés par les préférences (localStorage).
            Le `lang` du texte AFFICHÉ (source ou traduction) est porté
            par ce conteneur : la césure (`hyphens: auto`) travaille
            dans la bonne langue, sans faire changer les props du
            lecteur mémoïsé au moment de la bascule source/traduit. */}
        <div lang={langueAffichee} className="contents">
          <Lecteur
            chapitreComplet={chapitreComplet}
            chargementChapitre={chargementChapitre}
            texteNet={texteNet}
            corpsRef={corpsLectureRef}
            cadreRef={cadreLectureRef}
            chapitrePrecedentId={chapitrePrecedentId}
            chapitreSuivantId={chapitreSuivantId}
            onNaviguer={naviguerVers}
            onOuvrirTiroir={ouvrirTiroir}
            position={indexSelection + 1}
            total={chapitres.length}
            preferences={preferences}
          />
        </div>
      </section>
    </div>
  );
}
