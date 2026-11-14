'use client';

// ============================================================
// components/lecteur/useConfort.ts — Plein écran + défilement
// automatique (socle du lecteur, gratuit), sous forme de HOOK.
//
// Portage de la maquette : le mode immersif devient plein écran
// (Fullscreen API — absent sur iPhone, le bouton ne s'affiche pas),
// et le défilement automatique reste une boucle requestAnimationFrame
// à vitesse réglable, en pause au bas de page et au changement de
// chapitre. L'ÉTAT vit ici, une seule fois par chapitre ; la barre
// d'outils du bas et la pilule de vitesse n'en sont que des vues.
//
// Les helpers purs (borne de vitesse, pas suivant, fin de page) sont
// dans lib/confort-lecture.ts et testés.
// ============================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  VITESSE_DEFAUT,
  VITESSE_MAX,
  VITESSE_MIN,
  prochainPas,
  vitesseDefilement,
} from '@/lib/confort-lecture';

const CLEF_VITESSE = 'plume-defilement-auto';

export { VITESSE_MIN, VITESSE_MAX };

/** Vrai si l'événement clavier vient d'un champ de saisie. */
function vientDUneSaisie(e: KeyboardEvent): boolean {
  const cible = e.target;
  if (!(cible instanceof HTMLElement)) return false;
  return (
    cible.tagName === 'INPUT' ||
    cible.tagName === 'TEXTAREA' ||
    cible.tagName === 'SELECT' ||
    cible.isContentEditable
  );
}

// ---------- Plein écran comme « source externe » ----------
// L'état du Fullscreen API vit dans le document : store externe
// (useSyncExternalStore), aucun setState d'effet.

function souscrirePleinEcran(notifier: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('fullscreenchange', notifier);
  return () => document.removeEventListener('fullscreenchange', notifier);
}

const pleinEcranPossibleMaintenant = () =>
  typeof document !== 'undefined' &&
  'fullscreenEnabled' in document &&
  document.fullscreenEnabled === true;
const pleinEcranActifMaintenant = () =>
  typeof document !== 'undefined' && Boolean(document.fullscreenElement);
const pleinEcranServeur = () => false;

export interface ControleConfort {
  pleinEcranPossible: boolean;
  pleinEcran: boolean;
  basculerPleinEcran: () => void;
  defile: boolean;
  /** Préparation OUVERTE : le lecteur règle sa vitesse avant de partir. */
  preparerDefile: boolean;
  /** Ouvre la préparation (ou arrête si déjà en défilement). */
  demanderDefile: () => void;
  /** Lance le défilement et ferme la préparation. */
  demarrerDefile: () => void;
  /** Ferme la préparation sans démarrer. */
  annulerDefile: () => void;
  basculerDefile: () => void;
  vitesse: number;
  majVitesse: (v: number) => void;
}

export function useConfortLecture({
  cibleId,
  cadreRef,
  deuxColonnes,
  cleChapitre,
}: {
  /** Élément à passer en plein écran (conteneur du chapitre). */
  cibleId: string;
  /** Cadre du mode deux colonnes (conteneur défilant éventuel). */
  cadreRef: React.RefObject<HTMLDivElement | null>;
  /** Mode deux colonnes actif (le cadre défile à la place de la page). */
  deuxColonnes: boolean;
  /** Change à chaque chapitre ouvert : met le défilement en pause. */
  cleChapitre: string;
}): ControleConfort {
  const pleinEcranPossible = useSyncExternalStore(
    souscrirePleinEcran,
    pleinEcranPossibleMaintenant,
    pleinEcranServeur
  );
  const pleinEcran = useSyncExternalStore(
    souscrirePleinEcran,
    pleinEcranActifMaintenant,
    pleinEcranServeur
  );
  const [defile, setDefile] = useState(false);
  // La préparation (« à quelle vitesse voulez-vous défiler ? ») reste
  // ouverte jusqu'au démarrage ou à l'annulation.
  const [preparerDefile, setPreparerDefile] = useState(false);
  const [vitesse, setVitesse] = useState<number>(() => {
    // Lecture tolérante : hors navigateur ou valeur corrompue → défaut.
    try {
      return vitesseDefilement(
        Number(window.localStorage.getItem(CLEF_VITESSE))
      );
    } catch {
      return VITESSE_DEFAUT;
    }
  });

  // Pause au changement de chapitre : on ne veut pas défiler un texte
  // qui n'est plus celui lu. Ajustement PENDANT le rendu (pattern
  // officiel React — même convention que useVoix).
  const [cleVu, setCleVu] = useState(cleChapitre);
  if (cleVu !== cleChapitre) {
    setCleVu(cleChapitre);
    setDefile(false);
    setPreparerDefile(false);
  }

  const basculerPleinEcran = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const cible = document.getElementById(cibleId);
      if (cible) await cible.requestFullscreen();
    } catch {
      // Refus du navigateur (permissions, iframe…) : silencieux.
    }
  }, [cibleId]);

  // ---------- Défilement automatique ----------
  // Le MENU « Défiler » ouvre la PRÉPARATION (vitesse réglable avant
  // de partir) ; « Commencer » lance la boucle rAF. Pas = vitesse
  // (px/s) × temps écoulé. Le conteneur est résolu À CHAQUE pas (plein
  // écran entré/sorti, colonnes changées). La vitesse passe par une
  // ref tenue à jour PAR EFFET (jamais écrite pendant le rendu).
  const vitesseRef = useRef(vitesse);
  useEffect(() => {
    vitesseRef.current = vitesse;
  }, [vitesse]);

  useEffect(() => {
    if (!defile) return;
    let annule = 0;
    let precedent = performance.now();

    const pas = (maintenant: number) => {
      const dt = Math.min(0.25, (maintenant - precedent) / 1000);
      precedent = maintenant;

      let conteneur: HTMLElement | null =
        (document.fullscreenElement as HTMLElement | null) ?? null;
      if (!conteneur && deuxColonnes) {
        const cadre = cadreRef.current;
        if (cadre && cadre.scrollHeight > cadre.clientHeight + 1) conteneur = cadre;
      }
      const racine = conteneur ?? (document.scrollingElement as HTMLElement | null);
      if (!racine) {
        setDefile(false);
        return;
      }
      const suivant = prochainPas(
        racine.scrollTop,
        vitesseRef.current * dt,
        racine.scrollHeight,
        racine.clientHeight
      );
      if (suivant === null) {
        setDefile(false); // bas de page : pause automatique
        return;
      }
      racine.scrollTop = suivant;
      annule = requestAnimationFrame(pas);
    };

    annule = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(annule);
  }, [defile, deuxColonnes, cadreRef]);

  const basculerDefile = useCallback(() => setDefile((d) => !d), []);

  const demanderDefile = useCallback(() => {
    setDefile((d) => {
      if (d) return false; // déjà en cours → stop immédiat
      setPreparerDefile(true); // sinon → régler la vitesse d'abord
      return d;
    });
  }, []);
  const demarrerDefile = useCallback(() => {
    setPreparerDefile(false);
    setDefile(true);
  }, []);
  const annulerDefile = useCallback(() => setPreparerDefile(false), []);

  // ---------- Raccourcis clavier (f, a) ----------
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (vientDUneSaisie(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      const cle = e.key.toLowerCase();
      if (cle === 'f' && pleinEcranPossible) {
        e.preventDefault();
        void basculerPleinEcran();
      } else if (cle === 'a') {
        e.preventDefault();
        setDefile((d) => {
          if (d) return false;
          setPreparerDefile(true);
          return d;
        });
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [basculerPleinEcran, pleinEcranPossible]);

  const majVitesse = useCallback((valeur: number) => {
    const bornee = vitesseDefilement(valeur);
    setVitesse(bornee);
    try {
      window.localStorage.setItem(CLEF_VITESSE, String(bornee));
    } catch {
      // Stockage indisponible : la vitesse reste en mémoire.
    }
  }, []);

  return {
    pleinEcranPossible,
    pleinEcran,
    basculerPleinEcran: () => void basculerPleinEcran(),
    defile,
    preparerDefile,
    demanderDefile,
    demarrerDefile,
    annulerDefile,
    basculerDefile,
    vitesse,
    majVitesse,
  };
}
