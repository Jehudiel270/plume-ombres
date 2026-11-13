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
import {
  chapitresAReprendre,
  useMoteurTraduction,
} from '@/lib/useMoteurTraduction';
import {
  ratioLectureColonnes,
  ratioLectureVertical,
  useLecture,
} from '@/lib/useLecture';
import { CLEF_PROGRESSION } from '@/lib/progression';
import BoutonCarnet from '@/components/carnet/BoutonCarnet';
import {
  DUREE_BAIL_NAVIGATEUR_MS,
  creerTravail,
  identifiantExecutant,
  prendreBail,
  renouvelerBail,
} from '@/lib/travaux-traduction';
import Sommaire from '@/components/lecteur/Sommaire';
import BarreActions from '@/components/lecteur/BarreActions';
import CommandesTraduction from '@/components/lecteur/CommandesTraduction';
import {
  apparierDepuisSegments,
  apparierParagraphes,
  type PaireBilingue,
} from '@/lib/bilingue';
import Lecteur from '@/components/lecteur/Lecteur';
import LectureVocale from '@/components/lecteur/LectureVocale';
import { usePreferencesLecture } from '@/components/lecteur/ReglagesLecture';
import { useExports } from '@/components/lecteur/useExports';
import type { ChapitreLeger, Compteurs } from '@/components/lecteur/partages';

/** Clé de mémorisation du débit de traduction mesuré (caractères/seconde). */
const CLE_DEBIT_TRADUCTION = 'plume:debit-traduction';

/**
 * Débit de repli tant qu'aucun passage n'a été mesuré : 900 car/s, valeur
 * prudente entre les 208 car/s observés sur des micro-segments et les
 * 2 130 car/s observés sur des paragraphes réels. Dès le premier passage,
 * la valeur RÉELLE mesurée remplace celle-ci.
 */
const DEBIT_TRADUCTION_DEFAUT = 900;


export default function EspaceLivre({
  livreInitial,
  chapitresInitiaux,
  totalCaracteres,
  lectureVocaleOuverte = false,
  bilingueOuverte = false,
  carnetOuverte = false,
  grapheOuvert = false,
}: {
  livreInitial: Livre;
  chapitresInitiaux: ChapitreLeger[];
  /** Nombre total de caractères du livre (estimation du temps de lecture). */
  totalCaracteres: number;
  /**
   * Interrupteur `lecture_vocale` (F9) évalué CÔTÉ SERVEUR (registre +
   * plan du compte) : la page ne passe vrai que si le module est ouvert
   * pour ce lecteur. Défaut false : sans wire, rien ne s'affiche.
   */
  lectureVocaleOuverte?: boolean;
  /**
   * Interrupteur `carnet` (F2, ajout chantier) évalué CÔTÉ SERVEUR :
   * le bouton du carnet n'existe que si le module est ouvert.
   */
  carnetOuverte?: boolean;
  /**
   * Interrupteur `graphe` (F25, ajout chantier) évalué CÔTÉ SERVEUR :
   * le lien vers le graphe narratif n'existe que si le module est ouvert.
   */
  grapheOuvert?: boolean;
  /**
   * Interrupteur `bilingue` (F7) évalué CÔTÉ SERVEUR : le bouton de la
   * vue bilingue n'existe que si le module est ouvert pour ce lecteur.
   */
  bilingueOuverte?: boolean;
}) {
  const supabaseRef = useRef(creerClientNavigateur());
  const requeteRef = useRef<string | null>(null);

  const [livre, setLivre] = useState(livreInitial);
  const [chapitres, setChapitres] = useState(chapitresInitiaux);
  const [selection, setSelection] = useState<string | null>(
    chapitresInitiaux[0]?.id ?? null
  );
  const [chapitreComplet, setChapitreComplet] = useState<Chapitre | null>(null);
  const [lecture, setLecture] = useState<'source' | 'traduit' | 'bilingue'>(
    'source'
  );
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  /** Ce qui RESTE à traduire dans le livre (compté avec la vraie source). */
  const [aTraduire, setATraduire] = useState<{
    segments: number;
    caracteres: number;
  } | null>(null);
  const [messageLangue, setMessageLangue] = useState<string | null>(null);

  // ---------- Débit réel et estimation de durée ----------
  // Le moteur publie le débit mesuré à la fin de chaque passage
  // (`plume:debit-traduction`). On le mémorise puis on l'utilise pour
  // annoncer une durée AVANT de lancer. Sans mesure, on part d'un débit
  // prudent constaté sur de vrais livres, et on le dit.
  const [debitMesure, setDebitMesure] = useState<number | null>(() => {
    // Lecture unique au montage : le rendu serveur n'affiche aucune
    // estimation (aTraduire est encore null), donc aucun écart d'hydratation.
    if (typeof window === 'undefined') return null;
    try {
      const brut = window.localStorage.getItem(CLE_DEBIT_TRADUCTION);
      const valeur = brut ? Number(brut) : Number.NaN;
      return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const surDebit = (evenement: Event) => {
      const detail = (evenement as CustomEvent<{ debit?: number }>).detail;
      const taux = Number(detail?.debit);
      if (!Number.isFinite(taux) || taux <= 0) return;
      setDebitMesure(taux);
      try {
        window.localStorage.setItem(
          CLE_DEBIT_TRADUCTION,
          String(Math.round(taux))
        );
      } catch {
        /* stockage indisponible : l'estimation vaut pour cette session */
      }
    };
    window.addEventListener('plume:debit-traduction', surDebit);
    return () =>
      window.removeEventListener('plume:debit-traduction', surDebit);
  }, []);

  const estimation = useMemo(() => {
    if (!aTraduire || aTraduire.caracteres <= 0) return null;
    const taux = debitMesure ?? DEBIT_TRADUCTION_DEFAUT;
    return {
      secondes: aTraduire.caracteres / taux,
      mesure: debitMesure !== null,
      taux,
    };
  }, [aTraduire, debitMesure]);

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

  /**
   * Travail serveur du livre (persistance). Créé au lancement de
   * « Tout traduire » : si l'onglet est fermé, l'exécutant planifié
   * reprend le relais dès que le bail a expiré.
   */
  const [travailId, setTravailId] = useState<string | null>(null);

  /**
   * Identifiant de CET onglet comme exécutant : c'est lui qui figure
   * dans le bail (`executeur`). Un par montage, donc stable d'un
   * renouvellement à l'autre.
   */
  const [executeurOnglet] = useState(() => identifiantExecutant('onglet'));

  // Bail : tant que l'onglet travaille, il RENOUVELLE son bail toutes
  // les 20 s — l'exécutant serveur ne prend la main que si ce
  // renouvellement cesse (onglet fermé, crash). Si le renouvellement
  // échoue (bail délogé), on cesse de battre : la traduction dans le
  // navigateur continue, elle n'attend personne.
  useEffect(() => {
    if (!actif || !travailId) return;
    const id = setInterval(() => {
      void renouvelerBail(
        supabaseRef.current,
        travailId,
        executeurOnglet,
        DUREE_BAIL_NAVIGATEUR_MS
      )
        .then((tenu) => {
          if (!tenu) clearInterval(id);
        })
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(id);
  }, [actif, travailId, executeurOnglet]);

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
        // On reste sur le TEXTE SOURCE à l'ouverture : l'utilisateur doit
        // pouvoir lire la version originale avant de lancer une traduction.
        // La bascule source ↔ traduction reste manuelle (barre d'outils).
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

  // ---------- Compteur AVANT traduction (segments + caractères) ----------
  // Le quota se facture au CARACTÈRE : annoncer « X segments · Y
  // caractères » avant de lancer évite de découvrir le coût après coup.
  // La mesure lit la vraie source des seuls segments non traduits (une
  // passe paginée, à l'ouverture puis à la fin de chaque passage) ; elle
  // n'est PAS recalculée pendant la traduction, où le bandeau de
  // progression la remplace.
  const mesurerATraduire = useCallback(async () => {
    const liste = chapitresRef.current;
    if (liste.length === 0) {
      setATraduire({ segments: 0, caracteres: 0 });
      return;
    }
    const ids = liste.map((c) => c.id);
    const lignes = await paginer<{
      id: number;
      statut: string;
      source: string | null;
    }>((debut, fin) =>
      supabaseRef.current
        .from('segments')
        .select('id, statut, source')
        .in('chapitre_id', ids)
        .neq('statut', 'fait')
        .order('id', { ascending: true })
        .range(debut, fin)
    );
    setATraduire({
      segments: lignes.length,
      caracteres: lignes.reduce((n, l) => n + (l.source?.length ?? 0), 0),
    });
  }, []);

  useEffect(() => {
    if (actif) return;
    void mesurerATraduire();
  }, [actif, mesurerATraduire]);

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
    // La vue reste sur la SOURCE : on ne bascule pas l'utilisateur de force.
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
    // Pas de bascule forcée : l'utilisateur garde la main sur la vue.

    // Travail PERSISTANT + BAIL, créés avant de lancer. L'onglet PREND le
    // bail en priorité (préemption : l'utilisateur passe avant l'exécutant
    // serveur, qui perdra son bail au prochain renouvellement et
    // abandonnera son lot). Si l'onglet est fermé, le bail expire et
    // l'exécutant planifié reprend les segments restants, sans que
    // l'utilisateur relance quoi que ce soit.
    // Un échec ici ne bloque JAMAIS la traduction dans le navigateur : le
    // livre perd seulement son exécutant serveur de secours.
    try {
      const travail = await creerTravail(supabaseRef.current, {
        livreId: livre.id,
        statutInitial: 'en_cours',
      });
      const tenu = await prendreBail(supabaseRef.current, travail.id, {
        executeur: executeurOnglet,
        dureeMs: DUREE_BAIL_NAVIGATEUR_MS,
        forcer: true,
      });
      // Bail non pris (réseau, RLS, travail clos) : on ne bat pas sur un
      // bail qu'on ne tient pas. La traduction continue quand même.
      setTravailId(tenu ? travail.id : null);
    } catch {
      setTravailId(null);
    }

    await lancer(supabaseRef.current, restants, livre, majChapitre);
    rafraichirCompteurs();
  }, [livre, executeurOnglet, lancer, majChapitre, rafraichirCompteurs]);

  // ---------- Requalification des segments orphelins au montage ----------
  // Un onglet fermé en pleine traduction laisse des segments bloqués en
  // `en_cours`. On les remet simplement dans la file (`en_attente`) pour
  // qu'ils soient pris au PROCHAIN lancement manuel.
  //
  // ⚠️ Aucune traduction ne démarre ici : l'utilisateur doit appuyer sur
  // « Traduire » lui-même, sinon il ne voit ni le texte source, ni le
  // nombre de caractères, ni l'estimation de durée avant que ça parte.
  const requalificationFaite = useRef(false);
  useEffect(() => {
    if (requalificationFaite.current || actif) return;
    requalificationFaite.current = true;
    const ids = chapitresRef.current.map((c) => c.id);
    if (ids.length === 0) return;
    // L'appel effectue la remise en file ; son résultat (chapitres encore
    // incomplets) n'est volontairement PAS utilisé pour lancer quoi que
    // ce soit.
    void chapitresAReprendre(supabaseRef.current, ids).catch(() => undefined);
  }, [actif]);

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
    if (lecture === 'traduit' || lecture === 'bilingue')
      return chapitreComplet.texte_traduit ?? chapitreComplet.texte_source;
    return chapitreComplet.texte_source;
  }, [chapitreComplet, lecture]);

  const texteNet = useMemo(() => texteAffiche.trim(), [texteAffiche]);

  /** Langue du texte AFFICHÉ (source ou traduction) : elle pilote la
   *  césure (`hyphens: auto` a besoin d'un code de langue correct) et
   *  l'annonce du corps de texte aux lecteurs d'écran. */
  const langueAffichee = useMemo(() => {
    const brute =
      lecture === 'source' ? livre.langue_source : livre.langue_cible;
    return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(brute ?? '') ? brute : 'fr';
  }, [lecture, livre.langue_source, livre.langue_cible]);

  // ---------- Vue bilingue (F7) : paires source ↔ traduit ----------
  // Alignement SEGMENT par SEGMENT (les unités réellement traduites) ;
  // repli paragraphe par paragraphe si la table est vide. Les paires
  // restent en cache : basculer de vue ne relance pas la lecture.
  const [pairesBilingue, setPairesBilingue] = useState<PaireBilingue[] | null>(
    null
  );
  useEffect(() => {
    if (lecture !== 'bilingue' || !chapitreComplet) return;
    const idChapitre = chapitreComplet.id;
    const texteSource = chapitreComplet.texte_source;
    const texteTraduit = chapitreComplet.texte_traduit ?? '';
    let annule = false;
    (async () => {
      try {
        const { data } = await supabaseRef.current
          .from('segments')
          .select('source, traduit, position')
          .eq('chapitre_id', idChapitre)
          .order('position', { ascending: true });
        if (annule) return;
        const parSegments = apparierDepuisSegments(
          (data ?? []) as Array<{ source: string | null; traduit: string | null }>
        );
        setPairesBilingue(
          parSegments.length > 0
            ? parSegments
            : apparierParagraphes(texteSource, texteTraduit)
        );
      } catch {
        if (!annule) {
          setPairesBilingue(apparierParagraphes(texteSource, texteTraduit));
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, [lecture, chapitreComplet]);

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
          grapheOuvert={grapheOuvert}
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
          aTraduire={aTraduire}
          estimation={estimation}
          onTraduireSelection={traduireSelection}
          onToutTraduire={toutTraduire}
          lecture={lecture}
          onLecture={setLecture}
          bilingueDisponible={bilingueOuverte && !!chapitreComplet?.texte_traduit}
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
        {chapitres.length === 0 ? (
          /* État vide défensif (C5) : un livre sans aucun chapitre —
             anomalie de données (un import normal produit toujours au
             moins un chapitre, cf. lib/segmenter.ts). On l'explique au
             lieu de laisser le lecteur dire « choisissez un chapitre »
             alors que la liste est vide. */
          <div className="velours p-10 text-center animate-fondu-monte">
            <p className="text-4xl mb-3 opacity-80" aria-hidden>
              📖
            </p>
            <p className="text-encre-100 font-display text-xl">
              Ce livre ne contient aucun chapitre.
            </p>
            <p className="text-encre-500 text-sm mt-3 max-w-md mx-auto leading-relaxed italic">
              Le découpage n’a produit aucune section exploitable. Réimportez
              le fichier — un .txt ou un .epub donne le découpage le plus
              fiable — pour relancer l’extraction.
            </p>
          </div>
        ) : (
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
              pairesBilingue={
                lecture === 'bilingue' ? pairesBilingue : null
              }
              langueSourceBilingue={livre.langue_source}
              outils={
                <>
                  {lectureVocaleOuverte && chapitreComplet ? (
                    <LectureVocale texte={texteNet} />
                  ) : null}
                  {carnetOuverte && chapitreComplet ? (
                    <BoutonCarnet
                      livreId={livre.id}
                      chapitreId={chapitreComplet.id}
                      chapitreTitre={chapitreComplet.titre}
                    />
                  ) : null}
                </>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
