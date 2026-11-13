'use client';

// ============================================================
// components/lecteur/useVoix.ts — Lecture à voix haute (F9), hook.
//
// Portage de la maquette (components/reader/ReaderTts.vue) :
//   * la voix de l'appareil lit le chapitre, paragraphe par
//     paragraphe (même découpage que le rendu) ;
//   * play / pause / stop, vitesse, voix — l'ÉTAT vit ici, une
//     seule fois par chapitre ; le panneau « Écouter » (feuille)
//     et la barre d'outils du bas n'en sont que des vues ;
//   * le paragraphe en cours est signalé dans le texte et amené à
//     l'écran — fini le retour en haut du chapitre pour couper :
//     la barre d'outils fixe du bas reste atteignable en scrollant.
//
// Patterns React (règles du projet) : disponibilité et voix passent
// par useSyncExternalStore ; les refs ne sont écrites que dans les
// effets et les gestionnaires d'événements.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  VITESSES,
  decouperPourLecture,
  choisirVoix,
  normaliserVitesse,
  voixTriees,
} from '@/lib/lecture-vocale';

const CLEF_VOIX = 'plume-voix-vocale';
const CLEF_VITESSE = 'plume-vitesse-vocale';

interface VoixNominale {
  name: string;
  lang: string;
}

// ---------- Synthèse vocale comme « source externe » ----------
// Instantané CACHÉ (référence stable) tenu dans un cache de module,
// rafraîchi par l'événement voiceschanged du navigateur.

let cacheVoix: VoixNominale[] = [];
let cacheDisponible = false;

function souscrireSynthese(notifier: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return () => {};
  }
  cacheDisponible = true;
  const charger = () => {
    const liste = window.speechSynthesis
      .getVoices()
      .map((v) => ({ name: v.name, lang: v.lang }));
    if (liste.length > 0 && liste.length !== cacheVoix.length) {
      cacheVoix = liste;
      notifier();
    }
  };
  charger();
  window.speechSynthesis.addEventListener('voiceschanged', charger);
  return () => {
    window.speechSynthesis.removeEventListener('voiceschanged', charger);
  };
}

const instantaneSynthese = () => cacheDisponible;
const instantaneServeur = () => false;
const instantaneVoix = () => cacheVoix;
const instantaneVoixServeur = () => [] as VoixNominale[];
const nePasSouscrire = () => () => {};

export type StatutVoix = 'arret' | 'lecture' | 'pause';

export interface ControleVoix {
  disponible: boolean;
  statut: StatutVoix;
  /** Index du segment en cours (0 → total-1) ; 0 à l'arrêt. */
  index: number;
  total: number;
  /** Échec de synthèse (voix indisponible en cours de route). */
  echec: boolean;
  vitesse: number;
  voixPreferee: string | null;
  voix: Array<{ name: string; lang: string }>;
  demarrer: () => void;
  mettreEnPause: () => void;
  arreter: () => void;
  changerVitesse: (v: number) => void;
  changerVoix: (nom: string) => void;
}

export function useVoix(texte: string): ControleVoix {
  const disponible = useSyncExternalStore(
    nePasSouscrire,
    instantaneSynthese,
    instantaneServeur
  );
  const voix = useSyncExternalStore(
    souscrireSynthese,
    instantaneVoix,
    instantaneVoixServeur
  );

  // Réglages conservés localement (lecture une seule fois, au premier
  // rendu — try/catch pour le rendu serveur et la navigation privée).
  const [voixPreferee, setVoixPreferee] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(CLEF_VOIX) || null;
    } catch {
      return null;
    }
  });
  const [vitesse, setVitesse] = useState<number>(() => {
    try {
      const s = window.localStorage.getItem(CLEF_VITESSE);
      return normaliserVitesse(s === null ? NaN : Number(s));
    } catch {
      return 1;
    }
  });

  const [statut, setStatut] = useState<StatutVoix>('arret');
  const [index, setIndex] = useState(0);
  const [echec, setEchec] = useState(false);

  // Segments de lecture (même découpage typographique que le rendu).
  const segments = useMemo(() => decouperPourLecture(texte), [texte]);

  // Références mutables lues par le chaînage des énoncés.
  const indexRef = useRef(0);
  const voixRef = useRef(voixPreferee);
  const vitesseRef = useRef(vitesse);
  const annuleRef = useRef(false);

  // Changement de chapitre (ou de vue) : l'état repart de zéro. La
  // remise à zéro des ÉTATS se fait pendant le rendu (pattern officiel) ;
  // l'effet se réserve le nettoyage de la synthèse et des refs.
  const [texteVu, setTexteVu] = useState(texte);
  if (texteVu !== texte) {
    setTexteVu(texte);
    setIndex(0);
    setStatut('arret');
  }

  useEffect(() => {
    annuleRef.current = true;
    indexRef.current = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [texte]);

  // Nettoyage à la sortie de l'espace de lecture.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /** Prononce le segment courant de `segs`, puis la suite. La fonction
   *  vit dans une ref (chaînage par onend sans TDZ, aucune dépendance) ;
   *  elle lit les refs (voix, vitesse, index) et n'est appelée que
   *  depuis des événements — les setState y sont autorisés. */
  const prononcerRef = useRef<(segs: string[]) => void>(() => {});

  useEffect(() => {
    const prononcer = (segs: string[]) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (indexRef.current >= segs.length) {
        indexRef.current = 0;
        setIndex(0);
        setStatut('arret');
        return;
      }
      const enonce = new SpeechSynthesisUtterance(segs[indexRef.current]);
      const liste = window.speechSynthesis.getVoices();
      const choix = choisirVoix(liste, voixRef.current);
      if (choix) {
        enonce.voice = liste.find((v) => v.name === choix.name) ?? null;
      }
      enonce.rate = vitesseRef.current;
      enonce.onend = () => {
        if (annuleRef.current) return;
        indexRef.current += 1;
        setIndex(indexRef.current);
        prononcerRef.current(segs);
      };
      enonce.onerror = () => {
        if (annuleRef.current) return;
        setEchec(true);
        setStatut('arret');
      };
      setIndex(indexRef.current);
      window.speechSynthesis.speak(enonce);
    };
    prononcerRef.current = prononcer;
    return () => {
      prononcerRef.current = () => {};
    };
  }, []);

  const demarrer = useCallback(() => {
    if (segments.length === 0) return;
    annuleRef.current = false;
    setEchec(false);
    if (
      statut === 'pause' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.paused
    ) {
      window.speechSynthesis.resume();
      setStatut('lecture');
      return;
    }
    setStatut('lecture');
    prononcerRef.current(segments);
  }, [segments, statut]);

  const mettreEnPause = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.pause();
    setStatut('pause');
  }, []);

  const arreter = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    annuleRef.current = true;
    window.speechSynthesis.cancel();
    indexRef.current = 0;
    setIndex(0);
    setStatut('arret');
  }, []);

  // Le paragraphe lu est amené à l'écran et signalé (aucun déplacement
  // de texte) : on repère le paragraphe rendu qui contient le début du
  // segment courant. Lecture seule du DOM + scroll : pas de setState.
  useEffect(() => {
    if (statut !== 'lecture' || index === 0) return;
    const segment = segments[index];
    if (!segment) return undefined;
    const extrait = segment.slice(0, 40);
    const corps = document.getElementById('corps-livre');
    if (!corps) return undefined;
    let choisi: HTMLParagraphElement | null = null;
    for (const p of corps.querySelectorAll('p')) {
      if (p.textContent?.includes(extrait)) {
        choisi = p as HTMLParagraphElement;
        break;
      }
    }
    if (!choisi) return undefined;
    choisi.setAttribute('data-lecture-vocale', 'true');
    choisi.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return () => choisi?.removeAttribute('data-lecture-vocale');
  }, [index, statut, segments]);

  const changerVoix = useCallback((nom: string) => {
    voixRef.current = nom || null;
    setVoixPreferee(nom || null);
    try {
      if (nom) window.localStorage.setItem(CLEF_VOIX, nom);
      else window.localStorage.removeItem(CLEF_VOIX);
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const changerVitesse = useCallback((v: number) => {
    const normale = normaliserVitesse(v);
    vitesseRef.current = normale;
    setVitesse(normale);
    try {
      window.localStorage.setItem(CLEF_VITESSE, String(normale));
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const triees = useMemo(() => voixTriees(voix), [voix]);

  return {
    disponible,
    statut,
    index,
    total: segments.length,
    echec,
    vitesse,
    voixPreferee,
    voix: triees,
    demarrer,
    mettreEnPause,
    arreter,
    changerVitesse,
    changerVoix,
  };
}

export { VITESSES };
