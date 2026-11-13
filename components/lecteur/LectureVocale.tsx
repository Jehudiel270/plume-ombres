'use client';

// ============================================================
// components/lecteur/LectureVocale.tsx — Lecture à voix haute (F9).
//
// Web Speech API du navigateur : aucune clé, aucun serveur, aucun
// coût par caractère. Le texte lu est celui AFFICHÉ (traduction ou
// source selon la vue active) — l'administrateur ouvre ou ferme le
// module par l'interrupteur `lecture_vocale`, la page serveur ne
// monte ce composant que si le module est ouvert.
//
// Comportement :
//   * lecture paragraphe par paragraphe (même découpage typographique
//     que le rendu, lib/lecture-vocale.ts) ;
//   * pause / reprise / arrêt, vitesse (×0,75 à ×1,5), choix de la
//     voix (françaises d'abord), réglages conservés localement ;
//   * le paragraphe en cours est signalé et amené à l'écran ;
//   * ouvrir un autre chapitre arrête la lecture ;
//   * navigateur sans synthèse vocale : le composant ne s'affiche pas.
//
// Patterns React (règles du projet) : disponibilité et voix passent
// par useSyncExternalStore (pas de setState synchrone dans un effet) ;
// le changement de chapitre ajuste l'état PENDANT le rendu (pattern
// officiel « ajuster l'état lors d'un changement de prop ») ; les
// refs ne sont écrites que dans les effets et les gestionnaires
// d'événements.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

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
// useSyncExternalStore exige un instantané CACHÉ (référence stable) :
// la liste des voix est donc tenue dans un cache de module, rafraîchi
// par l'événement voiceschanged du navigateur.

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

type StatutVocal = 'arret' | 'lecture' | 'pause';

export default function LectureVocale({ texte }: { texte: string }) {
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
  // rendu — même convention que lib/useLecture : try/catch pour le
  // rendu serveur et la navigation privée).
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

  const [statut, setStatut] = useState<StatutVocal>('arret');
  const [indexLu, setIndexLu] = useState(0);

  // Segments de lecture (même découpage typographique que le rendu).
  const segments = useMemo(() => decouperPourLecture(texte), [texte]);

  // Références mutables lues par le chaînage des énoncés (écrites dans
  // les effets et les gestionnaires d'événements uniquement).
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
    setIndexLu(0);
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
        setIndexLu(0);
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
        setIndexLu(indexRef.current);
        prononcerRef.current(segs);
      };
      enonce.onerror = () => {
        if (annuleRef.current) return;
        setStatut('arret');
      };
      setIndexLu(indexRef.current);
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
    setIndexLu(0);
    setStatut('arret');
  }, []);

  // Le paragraphe lu est amené à l'écran et signalé (aucun déplacement
  // de texte) : on repère le paragraphe rendu qui contient le début du
  // segment courant. Lecture seule du DOM + scroll : pas de setState.
  useEffect(() => {
    if (statut !== 'lecture' || indexLu === 0) return;
    const segment = segments[indexLu];
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
  }, [indexLu, statut, segments]);

  const changerVoix = (nom: string) => {
    voixRef.current = nom || null;
    setVoixPreferee(nom || null);
    try {
      if (nom) window.localStorage.setItem(CLEF_VOIX, nom);
      else window.localStorage.removeItem(CLEF_VOIX);
    } catch {
      /* stockage indisponible */
    }
  };

  const changerVitesse = (v: number) => {
    const normale = normaliserVitesse(v);
    vitesseRef.current = normale;
    setVitesse(normale);
    try {
      window.localStorage.setItem(CLEF_VITESSE, String(normale));
    } catch {
      /* stockage indisponible */
    }
  };

  if (!disponible) return null;

  const triees = voixTriees(voix);

  return (
    <div
      role="group"
      aria-label="Lecture à voix haute"
      className="flex items-center gap-1 rounded-xl border border-nuit-700 bg-nuit-900/60 px-1.5 py-1 shrink-0 max-w-full"
    >
      {statut !== 'lecture' ? (
        <button
          type="button"
          onClick={demarrer}
          disabled={segments.length === 0}
          aria-label={
            statut === 'pause' ? 'Reprendre la lecture à voix haute' : 'Lire à voix haute'
          }
          title={statut === 'pause' ? 'Reprendre' : 'Écouter le chapitre'}
          className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9 disabled:opacity-35"
        >
          ▶
        </button>
      ) : (
        <button
          type="button"
          onClick={mettreEnPause}
          aria-label="Mettre la lecture en pause"
          title="Pause"
          className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9"
        >
          ⏸
        </button>
      )}
      {statut !== 'arret' && (
        <button
          type="button"
          onClick={arreter}
          aria-label="Arrêter la lecture à voix haute"
          title="Arrêter"
          className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9"
        >
          ⏹
        </button>
      )}

      <label className="sr-only" htmlFor="vitesse-vocale">
        Vitesse de lecture
      </label>
      <select
        id="vitesse-vocale"
        className="champ-sombre select-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-1.5 py-1 text-xs text-encre-100"
        value={vitesse}
        onChange={(e) => changerVitesse(Number(e.target.value))}
      >
        {VITESSES.map((v) => (
          <option key={v} value={v}>
            ×{v}
          </option>
        ))}
      </select>

      {triees.length > 1 && (
        <>
          <label className="sr-only" htmlFor="voix-vocale">
            Voix de synthèse
          </label>
          <select
            id="voix-vocale"
            className="champ-sombre select-sombre max-w-36 rounded-lg border border-nuit-700 bg-nuit-850 px-1.5 py-1 text-xs text-encre-100"
            value={voixPreferee ?? ''}
            onChange={(e) => changerVoix(e.target.value)}
          >
            <option value="">Voix automatique</option>
            {triees.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </>
      )}

      {segments.length > 0 && statut !== 'arret' && (
        <span
          className="text-[10px] text-encre-500 tabular-nums px-1"
          aria-live="polite"
        >
          {Math.min(indexLu + 1, segments.length)}/{segments.length}
        </span>
      )}
    </div>
  );
}
