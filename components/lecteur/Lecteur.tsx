'use client';

// ============================================================
// Lecteur.tsx — Surface de lecture (F5), portée de la maquette
// (pages/lire/[id]/[n].vue du zip plume-ombres-ui).
//
// STRUCTURE (maquette) :
//  · le texte EST l'interface : plus aucune rangée d'outils entre
//    le titre du chapitre et le texte ;
//  · la BARRE D'OUTILS FIXE DU BAS (BarreOutilsLecteur) porte les
//    actions : Bilingue, Écouter, Carnet, Résumé, Questions,
//    Chercher, Réglages, Défiler, Plein écran — icône + libellé,
//    toujours atteignable pendant le défilement ;
//  · les actions ouvrent la FEUILLE (FeuilleLecteur) : Réglages,
//    Écouter, Résumé, Questions, Carnet — comme les panneaux de la
//    maquette (ReaderSheet) ;
//  · la SÉLECTION de texte ouvre le menu de la maquette
//    (ReaderSelectionMenu) : cinq couleurs de surlignage, note,
//    copie, comparateur, recherche ;
//  · les SURLIGNAGES DU CARNET sont re-rendus dans le texte
//    (rd-mark de la maquette) et restent cliquables (copier /
//    annoter / retirer).
//
// Typographie et performance (F5, C2 — conservées) :
//  · blocs typographiques portant leurs offsets, surlignage de
//    recherche exact au caractère près ;
//  · `content-visibility` sur les paquets hors écran ;
//  · fusion RECHERCHE × SURLIGNAGES par lib/plages-texte (pur,
//    testé) — la recherche prime là où les deux se recouvrent.
// ============================================================

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronsDown,
  CircleHelp,
  Headphones,
  Languages,
  Maximize2,
  Minimize2,
  NotebookPen,
  ScrollText,
  Search,
  Type,
} from 'lucide-react';

import type { Chapitre } from '@/lib/types';
import { chercherTermes, type Plaque } from '@/lib/recherche';
import {
  decouperEnParagraphes,
  grouperEnBlocs,
  TAILLE_BLOC_TEXTE,
} from '@/lib/pagination';
import { preferencesEnCss } from '@/lib/lecture';
import type { PaireBilingue } from '@/lib/bilingue';
import { metaCouleur, type CouleurCarnet, type EntreeCarnet } from '@/lib/carnet';
import {
  fusionnerPlages,
  trouverExtrait,
  type PlageSurlignage,
} from '@/lib/plages-texte';
import { VITESSE_MAX, VITESSE_MIN } from '@/lib/confort-lecture';
import Recherche from '@/components/Recherche';
import type { ControlePreferences } from '@/components/lecteur/ReglagesLecture';
import { PanneauReglages } from '@/components/lecteur/ReglagesLecture';
import { useVoix } from '@/components/lecteur/useVoix';
import { useConfortLecture } from '@/components/lecteur/useConfort';
import BarreOutilsLecteur, {
  type OutilLecteur,
} from '@/components/lecteur/BarreOutilsLecteur';
import FeuilleLecteur from '@/components/lecteur/FeuilleLecteur';
import PanneauEcouter from '@/components/lecteur/PanneauEcouter';
import { PanneauQuestions, PanneauResume } from '@/components/lecteur/PanneauxAide';
import PanneauCarnetExpress from '@/components/lecteur/PanneauCarnetExpress';
import {
  BulleSurlignage,
  MenuSelection,
} from '@/components/lecteur/MenuSelection';

const ID_LECTEUR = 'lecteur-chapitre';
const ID_CORPS = 'corps-livre';

/** Feuilles du lecteur (maquette : settings / audio / recap / qa). */
type Feuille = 'reglages' | 'ecouter' | 'resume' | 'questions' | 'carnet' | null;

const TITRES_FEUILLE: Record<Exclude<Feuille, null>, string> = {
  reglages: 'Réglages de lecture',
  ecouter: 'Écouter ce chapitre',
  resume: 'Résumé à la reprise',
  questions: 'Questions sur le livre',
  carnet: 'Carnet de lecture',
};

/** Surlignage local à un bloc, avec sa couleur d'affichage. */
type SurlignageLocal = PlageSurlignage & { couleur: CouleurCarnet };

/**
 * Titre de chapitre : « Chapitre 3 — Le long corridor » se présente
 * en deux niveaux typographiques (étiquette + titre), comme dans un
 * livre imprimé. Un titre d'une autre forme reste affiché tel quel.
 */
const RE_TITRE_NUMEROTE =
  /^(chapitre|chapter|partie|part|tome|book|livre|épilogue|epilogue|prologue)\s*([0-9]+|[ivxlcdm]+)?\s*[—–:-]\s*(.+)$/i;

function analyserTitre(titre: string): {
  etiquette: string | null;
  principal: string;
} {
  const propre = titre.trim();
  const m = RE_TITRE_NUMEROTE.exec(propre);
  if (!m || !m[3]) return { etiquette: null, principal: propre };
  const mot = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return {
    etiquette: m[2] ? `${mot} ${m[2]}` : mot,
    principal: m[3].trim(),
  };
}

/**
 * Indice de la première occurrence qui commence à `offset` ou après
 * (recherche dichotomique — les plaques sont triées par position).
 */
function indicePlaque(plaques: Plaque[], offset: number): number {
  let bas = 0;
  let haut = plaques.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (plaques[milieu].debut < offset) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

interface Props {
  /** Chapitre complet chargé (null tant qu'aucun n'est ouvert). */
  chapitreComplet: Chapitre | null;
  /** Sélection en cours de chargement (état dérivé, côté parent). */
  chargementChapitre: boolean;
  /** Texte du chapitre affiché, rogné (`texteAffiche.trim()`). */
  texteNet: string;
  /** Élément mesuré par le parent pour le ratio de lecture (défilement). */
  corpsRef: RefObject<HTMLDivElement | null>;
  /** Cadre défilant du mode deux colonnes (mesuré par le parent). */
  cadreRef: RefObject<HTMLDivElement | null>;
  /** Chapitre précédent / suivant (null aux extrémités de la liste). */
  chapitrePrecedentId: string | null;
  chapitreSuivantId: string | null;
  /** Ouvre un chapitre par son id (navigation au pouce). */
  onNaviguer: (id: string) => void;
  /** Ouvre le tiroir des chapitres (mobile). */
  onOuvrirTiroir: () => void;
  /** Position du chapitre affiché (1 → total) et nombre total. */
  position: number;
  total: number;
  /** Préférences de confort (état détenu par l'espace de travail). */
  preferences: ControlePreferences;
  /** Vue bilingue (F7) : paires source ↔ traduit (null = vue simple). */
  pairesBilingue?: PaireBilingue[] | null;
  /** Code de langue de la colonne source (attribut lang de la paire). */
  langueSourceBilingue?: string;
  // ---------- Modules du lecteur (interrupteurs côté serveur) ----------
  livreId: string;
  /** Position (1 → n) du chapitre affiché (aide à la reprise). */
  chapitreLu: number;
  /** Mode d'affichage courant et son changement (bascule Bilingue). */
  modeLecture: 'source' | 'traduit' | 'bilingue';
  onModeLecture: (mode: 'source' | 'traduit' | 'bilingue') => void;
  /** Le module bilingue est ouvert ET le chapitre est traduit. */
  bilingueDisponible: boolean;
  /** Interrupteurs des modules du lecteur, évalués CÔTÉ SERVEUR. */
  modulesLecteur: {
    vocale: boolean;
    carnet: boolean;
    reprise: boolean;
    theories: boolean;
  };
}

/**
 * Corps du texte, MÉMOÏSÉ : tant que la liste d'éléments garde la même
 * référence (elle est produite par `useMemo`), React ne reparcourt pas
 * les milliers de nœuds du chapitre.
 */
const Corps = memo(function Corps({ contenu }: { contenu: ReactNode }) {
  return <>{contenu}</>;
});

function Lecteur({
  chapitreComplet,
  chargementChapitre,
  texteNet,
  corpsRef,
  cadreRef,
  chapitrePrecedentId,
  chapitreSuivantId,
  onNaviguer,
  onOuvrirTiroir,
  position,
  total,
  preferences,
  pairesBilingue = null,
  langueSourceBilingue,
  livreId,
  chapitreLu,
  modeLecture,
  onModeLecture,
  bilingueDisponible,
  modulesLecteur,
}: Props) {
  const routeur = useRouter();
  const { prefs, maj, reinitialiser } = preferences;
  const deuxColonnes = prefs.colonnes === 2;

  // ---------- Recherche plein texte (chapitre affiché) ----------
  const [term, setTerm] = useState('');
  const [indexActif, setIndexActif] = useState(0);
  // Le terme qui déclenche les CALCULS est différé de 200 ms : le champ
  // garde la frappe immédiate, le balayage du chapitre ne se recalcule
  // plus à chaque caractère.
  const [termDiffere, setTermDiffere] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTermDiffere(term), 200);
    return () => window.clearTimeout(timer);
  }, [term]);

  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const basculerRecherche = useCallback(() => {
    setRechercheOuverte((ouverte) => {
      if (ouverte) setTerm('');
      return !ouverte;
    });
  }, []);
  // La barre de recherche ouverte prend le focus (comme un « trouver »
  // de navigateur : la barre s'affiche et on tape directement).
  useEffect(() => {
    if (rechercheOuverte) {
      document.getElementById('champ-recherche-chapitre')?.focus();
    }
  }, [rechercheOuverte]);

  const plaques = useMemo(
    () =>
      termDiffere.trim().length >= 2 && texteNet.length > 0
        ? chercherTermes(texteNet, termDiffere)
        : [],
    [texteNet, termDiffere]
  );
  const cleRecherche = `${texteNet.length}:${termDiffere}`;
  const [clePrec, setClePrec] = useState(cleRecherche);
  const [reinit, setReinit] = useState(false);
  if (reinit) {
    setIndexActif(0);
    setReinit(false);
  } else if (cleRecherche !== clePrec) {
    setClePrec(cleRecherche);
    setReinit(true);
  }
  const indexAffiche =
    plaques.length > 0 ? Math.min(indexActif, plaques.length - 1) : 0;

  // La plaque active est ramenée à l'écran.
  useEffect(() => {
    if (plaques.length === 0) return;
    const marque = document.querySelector('[data-ligne-recherche-active]');
    marque?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [indexAffiche, plaques.length, prefs.colonnes, prefs.taille, prefs.largeur]);

  // ---------- Feuilles, voix, confort ----------
  const [feuille, setFeuille] = useState<Feuille>(null);
  const fermerFeuille = useCallback(() => setFeuille(null), []);
  const voix = useVoix(texteNet);
  const confort = useConfortLecture({
    cibleId: ID_LECTEUR,
    cadreRef,
    deuxColonnes,
    cleChapitre: chapitreComplet?.id ?? '',
  });

  // ---------- Surlignages du carnet (chapitre affiché) ----------
  // Aucun setState synchrone d'effet : la fonction est asynchrone, la
  // réponse remplace l'état ; tant qu'elle n'arrive pas, l'ancienne
  // liste reste affichée (aucun clignotement).
  const [surlignages, setSurlignages] = useState<EntreeCarnet[]>([]);
  const chargerSurlignages = useCallback(async () => {
    if (!modulesLecteur.carnet || !chapitreComplet) return;
    try {
      const params = new URLSearchParams({
        livreId,
        chapitreId: chapitreComplet.id,
        type: 'surlignage',
      });
      const reponse = await fetch(`/api/carnet?${params.toString()}`);
      if (!reponse.ok) {
        setSurlignages([]);
        return;
      }
      const donnees = (await reponse.json().catch(() => null)) as {
        entrees?: EntreeCarnet[];
      } | null;
      setSurlignages(Array.isArray(donnees?.entrees) ? donnees.entrees : []);
    } catch {
      setSurlignages([]);
    }
  }, [livreId, chapitreComplet, modulesLecteur.carnet]);

  useEffect(() => {
    if (!modulesLecteur.carnet || !chapitreComplet) return;
    // Chargement du chapitre affiché : les setState vivent dans les
    // callbacks de promesse (jamais dans le corps de l'effet —
    // règles React Compiler).
    const params = new URLSearchParams({
      livreId,
      chapitreId: chapitreComplet.id,
      type: 'surlignage',
    });
    fetch(`/api/carnet?${params.toString()}`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        const entrees = (donnees as { entrees?: EntreeCarnet[] } | null)?.entrees;
        setSurlignages(Array.isArray(entrees) ? entrees : []);
      })
      .catch(() => setSurlignages([]));
  }, [livreId, chapitreComplet, modulesLecteur.carnet]);

  // ---------- Menu de sélection (maquette : ReaderSelectionMenu) ----------
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    extrait: string;
  } | null>(null);
  const [bulle, setBulle] = useState<{ x: number; y: number; id: string } | null>(
    null
  );

  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const surSelection = () => {
      if (minuteur) clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        if (document.activeElement?.closest('[role="toolbar"]')) return;
        const s = window.getSelection();
        const q = (s?.toString() ?? '').replace(/\s+/g, ' ').trim();
        if (
          !s ||
          s.isCollapsed ||
          q.length < 3 ||
          !s.rangeCount ||
          !corpsRef.current
        ) {
          setSelection(null);
          return;
        }
        const plage = s.getRangeAt(0);
        const ancre =
          plage.commonAncestorContainer.nodeType === 1
            ? (plage.commonAncestorContainer as Element)
            : plage.commonAncestorContainer.parentElement;
        if (!ancre?.closest('[data-selectable]') || !corpsRef.current.contains(ancre)) {
          return;
        }
        const rect = plage.getBoundingClientRect();
        setBulle(null);
        setSelection({
          x: Math.min(window.innerWidth - 164, Math.max(164, rect.left + rect.width / 2)),
          y: Math.min(window.innerHeight - 190, rect.bottom + 10),
          extrait: q.length > 400 ? q.slice(0, 400) : q,
        });
      }, 180);
    };
    // Le défilement emporte la sélection hors de sa position : le menu
    // se ferme plutôt que de rester flottant au mauvais endroit.
    const surDefilement = () => {
      setSelection(null);
      setBulle(null);
    };
    document.addEventListener('selectionchange', surSelection);
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      document.removeEventListener('selectionchange', surSelection);
      window.removeEventListener('scroll', surDefilement);
      if (minuteur) clearTimeout(minuteur);
    };
  }, [corpsRef]);

  /** Écrit au carnet par l'API (le serveur reste l'autorité). */
  const ecrireCarnet = useCallback(
    async (corps: Record<string, unknown>): Promise<boolean> => {
      try {
        const reponse = await fetch('/api/carnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            livreId,
            chapitreId: chapitreComplet?.id ?? null,
            chapitreTitre: chapitreComplet?.titre ?? null,
            ...corps,
          }),
        });
        return reponse.ok;
      } catch {
        return false;
      }
    },
    [livreId, chapitreComplet]
  );

  const surSurligner = useCallback(
    (couleur: CouleurCarnet) => {
      const extrait = selection?.extrait ?? '';
      setSelection(null);
      if (!extrait) return;
      void ecrireCarnet({ type: 'surlignage', extrait, couleur }).then(() =>
        chargerSurlignages()
      );
    },
    [selection, ecrireCarnet, chargerSurlignages]
  );

  const surNoteSelection = useCallback(
    (texte: string, couleur: CouleurCarnet) => {
      const extrait = selection?.extrait ?? '';
      setSelection(null);
      if (!extrait || !texte) return;
      void ecrireCarnet({ type: 'note', extrait, annotation: texte, couleur });
    },
    [selection, ecrireCarnet]
  );

  const surCopierSelection = useCallback(() => {
    const extrait = selection?.extrait ?? '';
    setSelection(null);
    if (!extrait) return;
    const copier = navigator.clipboard?.writeText(extrait);
    if (copier) {
      copier.catch(() => {
        /* refus du navigateur : la sélection native reste copiable */
      });
    }
  }, [selection]);

  const surComparerSelection = useCallback(() => {
    const terme = (selection?.extrait ?? '').slice(0, 60).trim();
    setSelection(null);
    if (!terme) return;
    routeur.push(
      `/theories?livre=${livreId}&onglet=comparateur&terme=${encodeURIComponent(terme)}`
    );
  }, [selection, routeur, livreId]);

  const surChercherSelection = useCallback(() => {
    const terme = selection?.extrait.trim() ?? '';
    setSelection(null);
    if (!terme) return;
    setTerm(terme);
    setRechercheOuverte(true);
  }, [selection]);

  // ---------- Clic sur un surlignage existant ----------
  useEffect(() => {
    const corps = document.getElementById(ID_CORPS);
    if (!corps) return;
    const surClic = (e: MouseEvent) => {
      const cible = (e.target as HTMLElement).closest('mark[data-surlignage-id]');
      if (!cible) return;
      e.preventDefault();
      e.stopPropagation();
      const id = cible.getAttribute('data-surlignage-id') ?? '';
      if (!id) return;
      const rect = cible.getBoundingClientRect();
      setSelection(null);
      setBulle({
        x: Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2)),
        y: Math.max(64, rect.top - 52),
        id,
      });
    };
    corps.addEventListener('click', surClic);
    return () => corps.removeEventListener('click', surClic);
  }, []);

  const entreeBulle = bulle
    ? surlignages.find((s) => s.id === bulle.id) ?? null
    : null;

  const retirerSurlignage = useCallback(
    async (id: string) => {
      setBulle(null);
      try {
        await fetch('/api/carnet', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      } catch {
        /* silencieux : le surlignage reste affiché */
      }
      void chargerSurlignages();
    },
    [chargerSurlignages]
  );

  // ---------- Raccourcis clavier : chapitres (← / →) ----------
  const naviguerPrecedent = useCallback(() => {
    if (chapitrePrecedentId) onNaviguer(chapitrePrecedentId);
  }, [chapitrePrecedentId, onNaviguer]);
  const naviguerSuivant = useCallback(() => {
    if (chapitreSuivantId) onNaviguer(chapitreSuivantId);
  }, [chapitreSuivantId, onNaviguer]);
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' && document.activeElement === document.body) {
        e.preventDefault();
        naviguerPrecedent();
      } else if (e.key === 'ArrowRight' && document.activeElement === document.body) {
        e.preventDefault();
        naviguerSuivant();
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [naviguerPrecedent, naviguerSuivant]);

  // ---------- Découpage typographique (mémoïsé) ----------
  const blocsTypo = useMemo(
    () => (texteNet.length > 0 ? decouperEnParagraphes(texteNet) : []),
    [texteNet]
  );
  const paquets = useMemo(
    () => grouperEnBlocs(blocsTypo, TAILLE_BLOC_TEXTE),
    [blocsTypo]
  );

  // ---------- Plages par bloc : occurrences de recherche ----------
  // Les plaques sont triées : un balayage unique les répartit dans
  // leurs blocs (rognées au bloc, une plaque à cheval est ignorée —
  // comme le faisait l'ancien surlignage).
  const occParBloc = useMemo(() => {
    const parBloc = new Map<number, Array<{ debut: number; fin: number }>>();
    const activeParBloc = new Map<number, number>();
    if (plaques.length === 0) return { parBloc, activeParBloc };
    let b = 0;
    for (let i = 0; i < plaques.length; i += 1) {
      const p = plaques[i];
      while (
        b < blocsTypo.length &&
        p.debut >= blocsTypo[b].debut + blocsTypo[b].texte.length
      ) {
        b += 1;
      }
      if (b >= blocsTypo.length) break;
      const finBloc = blocsTypo[b].debut + blocsTypo[b].texte.length;
      if (p.fin > finBloc) continue; // à cheval sur deux blocs : ignorée
      const liste = parBloc.get(b) ?? [];
      if (i === indexAffiche) activeParBloc.set(b, liste.length);
      liste.push({ debut: p.debut - blocsTypo[b].debut, fin: p.fin - blocsTypo[b].debut });
      parBloc.set(b, liste);
    }
    return { parBloc, activeParBloc };
  }, [plaques, blocsTypo, indexAffiche]);

  // ---------- Plages par bloc : surlignages du carnet ----------
  // Correspondance À LA MANIÈRE DE LA MAQUETTE : l'extrait enregistré
  // est retrouvé dans le texte (blancs ignorés). Un extrait peut
  // réapparaître dans plusieurs blocs : chaque occurrence est marquée.
  const surlignagesParBloc = useMemo(() => {
    const parBloc = new Map<number, SurlignageLocal[]>();
    if (surlignages.length === 0 || blocsTypo.length === 0) return parBloc;
    for (const entree of surlignages) {
      const extrait = entree.extrait?.trim();
      if (!extrait) continue;
      const couleur: CouleurCarnet = entree.couleur ?? 'azur';
      for (let i = 0; i < blocsTypo.length; i += 1) {
        const trouvee = trouverExtrait(blocsTypo[i].texte, extrait);
        if (trouvee) {
          const liste = parBloc.get(i) ?? [];
          liste.push({ ...trouvee, id: entree.id, couleur });
          parBloc.set(i, liste);
        }
      }
    }
    return parBloc;
  }, [blocsTypo, surlignages]);

  /** Rendu d'un bloc : fusion recherche × surlignages (lib testée). */
  const couleurParId = useMemo(
    () => new Map(surlignages.map((s) => [s.id, s.couleur ?? 'azur'])),
    [surlignages]
  );
  const rendreBloc = useCallback(
    (bloc: { texte: string }, iBloc: number): ReactNode => {
      const occ = occParBloc.parBloc.get(iBloc);
      const surl = surlignagesParBloc.get(iBloc);
      if (!occ && !surl) return bloc.texte;
      const segments = fusionnerPlages(
        bloc.texte.length,
        occ ?? [],
        surl ?? [],
        occParBloc.activeParBloc.get(iBloc) ?? -1
      );
      return segments.map((seg, i) => {
        const morceau = bloc.texte.slice(seg.debut, seg.fin);
        if (seg.type === 'recherche') {
          return seg.actif ? (
            <mark key={i} data-ligne-recherche-active="">
              {morceau}
            </mark>
          ) : (
            <mark key={i}>{morceau}</mark>
          );
        }
        if (seg.type === 'surlignage') {
          return (
            <mark
              key={i}
              className={metaCouleur(couleurParId.get(seg.id) ?? 'azur').marque}
              data-surlignage-id={seg.id}
              title="Surlignage — cliquez pour copier, annoter ou retirer"
            >
              {morceau}
            </mark>
          );
        }
        return morceau;
      });
    },
    [occParBloc, surlignagesParBloc, couleurParId]
  );

  /** Surlignage de recherche dans les PAIRES bilingues (ancien
   *  comportement, conservé : offsets des paires non contigus). */
  const surlignerPaire = useCallback(
    (texte: string, base: number): ReactNode => {
      if (plaques.length === 0) return texte;
      const finBloc = base + texte.length;
      const debutIndex = indicePlaque(plaques, base);
      const morceaux: ReactNode[] = [];
      let curseur = base;
      let dedans = 0;
      for (let i = debutIndex; i < plaques.length; i += 1) {
        const p = plaques[i];
        if (p.debut >= finBloc) break;
        if (p.fin > finBloc) continue;
        if (p.debut < curseur) continue;
        dedans += 1;
        if (p.debut > curseur) {
          morceaux.push(texte.slice(curseur - base, p.debut - base));
        }
        const contenu = texte.slice(p.debut - base, p.fin - base);
        morceaux.push(
          i === indexAffiche ? (
            <mark key={`actif-${i}`} data-ligne-recherche-active="">
              {contenu}
            </mark>
          ) : (
            <mark key={`occ-${i}`}>{contenu}</mark>
          )
        );
        curseur = p.fin;
      }
      if (dedans === 0) return texte;
      if (curseur < finBloc) morceaux.push(texte.slice(curseur - base));
      return morceaux;
    },
    [plaques, indexAffiche]
  );

  // ---------- Contenu du corps (mémoïsé) ----------
  const contenu = useMemo(() => {
    const avecLettrine = prefs.lettrine;
    const paresseux = !deuxColonnes;
    // Vue bilingue (F7) : paires source ↔ traduit.
    if (pairesBilingue) {
      const TAILLE_PAIQUET_PAIRES = 6;
      const paquetsPaires: PaireBilingue[][] = [];
      for (let i = 0; i < pairesBilingue.length; i += TAILLE_PAIQUET_PAIRES) {
        paquetsPaires.push(pairesBilingue.slice(i, i + TAILLE_PAIQUET_PAIRES));
      }
      return paquetsPaires.map((paquet, iP) => (
        <div
          key={iP}
          className={
            paresseux
              ? '[content-visibility:auto] [contain-intrinsic-size:auto_800px]'
              : undefined
          }
        >
          {paquet.map((paire, iB) => {
            const absolu = iP * TAILLE_PAIQUET_PAIRES + iB;
            return (
              <div key={iB} className="paire-bilingue">
                {paire.source && (
                  <p className="bilingue-source" lang={langueSourceBilingue}>
                    {paire.source}
                  </p>
                )}
                {paire.traduit ? (
                  <p className={avecLettrine && absolu === 0 ? 'lettrine' : undefined}>
                    {paire.debutTraduit >= 0
                      ? surlignerPaire(paire.traduit, paire.debutTraduit)
                      : paire.traduit}
                  </p>
                ) : (
                  <p className="bilingue-attente" aria-hidden="true">
                    —
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ));
    }
    // Vue simple : blocs typographiques, recherche + surlignages fusionnés.
    let compteur = -1;
    return paquets.map((paquet, iP) => (
      <div
        key={iP}
        className={
          paresseux
            ? '[content-visibility:auto] [contain-intrinsic-size:auto_800px]'
            : undefined
        }
      >
        {paquet.map((bloc, iB) => {
          compteur += 1;
          const iBloc = compteur;
          const premier = avecLettrine && iP === 0 && iB === 0;
          if (bloc.type === 'scene') {
            return (
              <p
                key={iB}
                className="repere-scene"
                role="separator"
                aria-label="Séparation de scène"
              >
                {rendreBloc(bloc, iBloc)}
              </p>
            );
          }
          return (
            <p key={iB} className={premier ? 'lettrine' : undefined} data-bloc={bloc.debut}>
              {rendreBloc(bloc, iBloc)}
            </p>
          );
        })}
      </div>
    ));
  }, [
    paquets,
    rendreBloc,
    surlignerPaire,
    prefs.lettrine,
    deuxColonnes,
    pairesBilingue,
    langueSourceBilingue,
  ]);

  /** Tourne d'une colonne (le cadre défile horizontalement). */
  const tournerColonne = useCallback(
    (sens: number) => {
      const cadre = cadreRef.current;
      if (!cadre) return;
      const pas = Math.max(180, Math.round(cadre.clientWidth / 2));
      cadre.scrollBy({ left: sens * pas, behavior: 'smooth' });
    },
    [cadreRef]
  );
  useEffect(() => {
    cadreRef.current?.scrollTo({ left: 0 });
  }, [deuxColonnes, cadreRef]);

  // ---------- Style : préférences → variables CSS ----------
  const stylePreferences = useMemo(
    () => preferencesEnCss(prefs) as CSSProperties,
    [prefs]
  );
  const titre = useMemo(
    () => analyserTitre(chapitreComplet?.titre ?? ''),
    [chapitreComplet?.titre]
  );

  // ---------- Édition carnet (depuis la barre ou une bulle) ----------
  const [carnetEdition, setCarnetEdition] = useState<{
    extrait: string;
    annotation: string;
    entreeId?: string;
  } | null>(null);

  // ---------- Barre d'outils du bas (maquette) ----------
  const outils: OutilLecteur[] = [];
  if (bilingueDisponible) {
    outils.push({
      cle: 'bilingue',
      libelle: 'Bilingue',
      icone: Languages,
      actif: modeLecture === 'bilingue',
      onPress: () => onModeLecture(modeLecture === 'bilingue' ? 'traduit' : 'bilingue'),
    });
  }
  if (modulesLecteur.vocale) {
    outils.push({
      cle: 'ecouter',
      libelle: 'Écouter',
      icone: Headphones,
      actif: voix.statut !== 'arret',
      onPress: () => setFeuille('ecouter'),
    });
  }
  if (modulesLecteur.carnet) {
    outils.push({
      cle: 'carnet',
      libelle: 'Carnet',
      icone: NotebookPen,
      onPress: () => {
        setCarnetEdition(null);
        setFeuille('carnet');
      },
    });
  }
  if (modulesLecteur.reprise) {
    outils.push({
      cle: 'resume',
      libelle: 'Résumé',
      icone: ScrollText,
      onPress: () => setFeuille('resume'),
    });
    outils.push({
      cle: 'questions',
      libelle: 'Questions',
      icone: CircleHelp,
      onPress: () => setFeuille('questions'),
    });
  }
  outils.push({
    cle: 'chercher',
    libelle: 'Chercher',
    icone: Search,
    actif: rechercheOuverte,
    onPress: basculerRecherche,
  });
  outils.push({
    cle: 'reglages',
    libelle: 'Réglages',
    icone: Type,
    onPress: () => setFeuille('reglages'),
  });
  outils.push({
    cle: 'defiler',
    libelle: confort.defile ? 'Arrêter' : 'Défiler',
    icone: ChevronsDown,
    actif: confort.defile,
    onPress: confort.basculerDefile,
  });
  if (confort.pleinEcranPossible) {
    outils.push({
      cle: 'plein',
      libelle: confort.pleinEcran ? 'Quitter' : 'Plein écran',
      icone: confort.pleinEcran ? Minimize2 : Maximize2,
      onPress: confort.basculerPleinEcran,
    });
  }

  const basDePage = (
    <nav
      aria-label="Navigation de chapitre"
      className="lg:hidden sticky bottom-0 z-30 pt-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-stretch gap-1.5 rounded-2xl border border-nuit-700 bg-nuit-900 p-1 shadow-2xl shadow-black/60">
        <button
          type="button"
          onClick={() => chapitrePrecedentId && onNaviguer(chapitrePrecedentId)}
          disabled={!chapitrePrecedentId}
          aria-label="Chapitre précédent"
          className="bouton-fantome flex-1 max-w-36 min-h-10 px-2 text-[11px] whitespace-nowrap disabled:opacity-35"
        >
          ‹ Précédent
        </button>
        <button
          type="button"
          onClick={onOuvrirTiroir}
          aria-label="Ouvrir le sommaire"
          className="bouton-fantome w-16 shrink-0 min-h-10 flex items-center justify-center gap-1 whitespace-nowrap"
        >
          <span className="text-sm" aria-hidden="true">☰</span>
          <span className="text-[10px] text-encre-500">
            {position}/{total}
          </span>
        </button>
        <button
          type="button"
          onClick={() => chapitreSuivantId && onNaviguer(chapitreSuivantId)}
          disabled={!chapitreSuivantId}
          aria-label="Chapitre suivant"
          className="bouton-principal flex-1 max-w-36 min-h-10 px-2 text-[11px] whitespace-nowrap disabled:opacity-35"
        >
          Suivant ›
        </button>
      </div>
    </nav>
  );

  return (
    <>
      <div
        id={ID_LECTEUR}
        style={stylePreferences}
        className="lecture velours lecture-transparente surface-lecture flex-1 min-h-[40vh]"
      >
        {chargementChapitre ? (
          <p className="text-encre-500 text-sm animate-pouls-doux text-center">
            Ouverture du chapitre…
          </p>
        ) : !chapitreComplet ? (
          <p className="text-encre-500 text-sm italic text-center">
            Choisissez un chapitre dans la liste.
          </p>
        ) : (
          <article
            className="animate-fondu-monte colonne-lecture"
            data-colonnes={deuxColonnes ? '2' : '1'}
            data-selectable
          >
            {/* Barre de recherche : n'existe que quand on la demande
                (outil « Chercher » de la barre du bas), comme un
                « trouver » de navigateur. */}
            {rechercheOuverte && (
              <div className="sticky top-2 z-20 mb-5 velours rounded-2xl p-2 shadow-xl shadow-black/40 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Recherche
                    term={term}
                    texte={texteNet}
                    plaques={plaques}
                    indexActif={indexAffiche}
                    onTerm={setTerm}
                    onIndexActif={setIndexActif}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRechercheOuverte(false);
                    setTerm('');
                  }}
                  aria-label="Fermer la recherche"
                  className="bouton-fantome !px-2.5 !py-1.5 text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            <header className="entete-chapitre text-center">
              <p className="sur-titre text-grenat-400/80 mb-2">
                {titre.etiquette ? `✦ ${titre.etiquette} ✦` : '✦ chapitre ✦'}
              </p>
              <h2 className="titre-chapitre">{titre.principal}</h2>
              <div className="liseret mx-auto mt-5" />
            </header>

            {texteNet.length === 0 ? (
              <p className="text-encre-500 italic text-center text-sm">
                Ce chapitre est vide.
              </p>
            ) : (
              <div
                ref={cadreRef}
                className="cadre-lecture"
                data-colonnes={deuxColonnes ? '2' : '1'}
                tabIndex={deuxColonnes ? 0 : -1}
                role={deuxColonnes ? 'region' : undefined}
                aria-label={
                  deuxColonnes
                    ? 'Texte du chapitre, deux colonnes — flèches pour changer de colonne'
                    : undefined
                }
              >
                <div
                  id={ID_CORPS}
                  ref={corpsRef}
                  data-colonnes={deuxColonnes ? '2' : '1'}
                  className="corps-livre"
                >
                  <Corps contenu={contenu} />
                </div>
              </div>
            )}
          </article>
        )}
      </div>

      {basDePage}

      {/* Barre d'outils fixe du bas (maquette) + pilule de défilement. */}
      <BarreOutilsLecteur outils={outils} />
      {confort.defile && (
        <div className="fixed right-3 bottom-[calc(7.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-full border border-nuit-700 bg-nuit-900/95 px-3 py-1.5 shadow-xl backdrop-blur lg:bottom-14 animate-fondu-monte">
          <span className="text-[11px] text-encre-500 whitespace-nowrap">Défilement</span>
          <input
            type="range"
            min={VITESSE_MIN}
            max={VITESSE_MAX}
            step={10}
            value={confort.vitesse}
            onChange={(e) => confort.majVitesse(Number(e.target.value))}
            aria-label="Vitesse du défilement automatique, pixels par seconde"
            className="w-24 accent-[var(--color-grenat-500)]"
          />
          <button
            type="button"
            onClick={confort.basculerDefile}
            className="bouton-fantome !min-h-8 !px-2 text-[11px]"
          >
            Arrêter
          </button>
        </div>
      )}

      {/* Deux colonnes : tourner de colonne (grand écran, comme avant). */}
      {deuxColonnes && (
        <div className="hidden lg:flex fixed left-4 bottom-14 z-30 items-center gap-1 rounded-full border border-nuit-700 bg-nuit-900/95 px-1.5 py-1 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => tournerColonne(-1)}
            aria-label="Colonne précédente"
            title="Colonne précédente"
            className="bouton-fantome !px-2.5 !py-1.5 text-xs"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => tournerColonne(1)}
            aria-label="Colonne suivante"
            title="Colonne suivante"
            className="bouton-fantome !px-2.5 !py-1.5 text-xs"
          >
            ›
          </button>
        </div>
      )}

      {/* Feuille du lecteur (maquette : ReaderSheet). */}
      <FeuilleLecteur
        ouvert={feuille !== null}
        titre={feuille ? TITRES_FEUILLE[feuille] : ''}
        surtitre={chapitreComplet?.titre ?? undefined}
        surFermer={fermerFeuille}
      >
        {feuille === 'reglages' && (
          <PanneauReglages prefs={prefs} maj={maj} reinitialiser={reinitialiser} />
        )}
        {feuille === 'ecouter' && <PanneauEcouter voix={voix} />}
        {feuille === 'resume' && <PanneauResume livreId={livreId} chapitreLu={chapitreLu} />}
        {feuille === 'questions' && (
          <PanneauQuestions livreId={livreId} chapitreLu={chapitreLu} />
        )}
        {feuille === 'carnet' && chapitreComplet && (
          <PanneauCarnetExpress
            key={carnetEdition?.entreeId ?? carnetEdition?.extrait ?? 'vide'}
            livreId={livreId}
            chapitreId={chapitreComplet.id}
            chapitreTitre={chapitreComplet.titre}
            extraitInitial={carnetEdition?.extrait ?? ''}
            annotationInitiale={carnetEdition?.annotation ?? ''}
            entreeId={carnetEdition?.entreeId}
            surEnregistre={() => {
              setFeuille(null);
              void chargerSurlignages();
            }}
          />
        )}
      </FeuilleLecteur>

      {/* Menu de sélection (maquette : ReaderSelectionMenu). */}
      {selection && (
        <MenuSelection
          x={selection.x}
          y={selection.y}
          extrait={selection.extrait}
          comparerOuvert={modulesLecteur.theories}
          surSurligner={surSurligner}
          surNote={surNoteSelection}
          surCopier={surCopierSelection}
          surComparer={surComparerSelection}
          surChercher={surChercherSelection}
        />
      )}

      {/* Bulle d'un surlignage existant. */}
      {bulle && entreeBulle && (
        <BulleSurlignage
          x={bulle.x}
          y={bulle.y}
          surCopier={() => {
            if (entreeBulle.extrait) {
              navigator.clipboard?.writeText(entreeBulle.extrait).catch(() => {});
            }
            setBulle(null);
          }}
          surAnnoter={() => {
            setCarnetEdition({
              extrait: entreeBulle.extrait ?? '',
              annotation: entreeBulle.annotation ?? '',
              entreeId: entreeBulle.id,
            });
            setBulle(null);
            setFeuille('carnet');
          }}
          surRetirer={() => retirerSurlignage(entreeBulle.id)}
          surFermer={() => setBulle(null)}
        />
      )}
    </>
  );
}

export default memo(Lecteur);
