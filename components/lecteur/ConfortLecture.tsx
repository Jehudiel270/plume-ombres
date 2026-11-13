'use client';

// ============================================================
// ConfortLecture.tsx — Plein écran + défilement automatique
// (socle du lecteur, gratuit — pas d'interrupteur : aucune donnée
// ne quitte l'atelier, aucune route d'API).
//
// Inspiré des lecteurs de référence (Readest, lecteur d'Anime-Sama) :
//   · PLEIN ÉCRAN — Fullscreen API sur le conteneur du chapitre ;
//     absent sur iPhone (Safari ne l'expose que pour les vidéos) →
//     le bouton ne s'affiche pas quand le navigateur ne le permet
//     pas. Échap quitte, comme partout.
//   · DÉFILEMENT AUTOMATIQUE — boucle requestAnimationFrame, vitesse
//     réglable (px/s, mémorisée), pause automatique au bas de page
//     et au changement de chapitre. Choisit le bon conteneur :
//     élément plein écran, cadre deux colonnes s'il défile, sinon la
//     page elle-même.
//   · RACCOURCIS — f : plein écran, a : défilement, ← / → :
//     chapitre précédent / suivant (gérés côté Lecteur).
// Les helpers purs (borne de vitesse, pas suivant, fin de page) sont
// dans lib/confort-lecture.ts et testés.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  VITESSE_DEFAUT,
  VITESSE_MAX,
  VITESSE_MIN,
  prochainPas,
  vitesseDefilement,
} from '@/lib/confort-lecture';

const CLEF_VITESSE = 'plume-defilement-auto';

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

interface Props {
  /** Élément à passer en plein écran (conteneur du chapitre). */
  cibleId: string;
  /** Cadre du mode deux colonnes (conteneur défilant éventuel). */
  cadreRef: React.RefObject<HTMLDivElement | null>;
  /** Mode deux colonnes actif (le cadre défile à la place de la page). */
  deuxColonnes: boolean;
  /** Change à chaque chapitre ouvert : met le défilement en pause. */
  cleChapitre: string;
}

export default function ConfortLecture({
  cibleId,
  cadreRef,
  deuxColonnes,
  cleChapitre,
}: Props) {
  const [pleinEcranPossible, setPleinEcranPossible] = useState(false);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [defile, setDefile] = useState(false);
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
  const vitesseRef = useRef(vitesse);
  vitesseRef.current = vitesse;

  // ---------- Plein écran ----------
  useEffect(() => {
    setPleinEcranPossible(
      typeof document !== 'undefined' &&
        'fullscreenEnabled' in document &&
        document.fullscreenEnabled === true
    );
    const surChangement = () => setPleinEcran(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', surChangement);
    return () => document.removeEventListener('fullscreenchange', surChangement);
  }, []);

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
  // Boucle rAF : pas = vitesse (px/s) × temps écoulé. Le conteneur est
  // résolu À CHAQUE pas (plein écran entré/sorti, colonnes changées).
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

  // Pause au changement de chapitre : on ne veut pas défiler un texte
  // qui n'est plus celui lu.
  useEffect(() => {
    setDefile(false);
  }, [cleChapitre]);

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
        setDefile((d) => !d);
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [basculerPleinEcran, pleinEcranPossible]);

  const majVitesse = (valeur: number) => {
    const bornee = vitesseDefilement(valeur);
    setVitesse(bornee);
    try {
      window.localStorage.setItem(CLEF_VITESSE, String(bornee));
    } catch {
      // Stockage indisponible : la vitesse reste en mémoire.
    }
  };

  return (
    <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Confort de lecture">
      {/* Compact (correctif 13/11) : ces trois contrôles occupaient
          trop de place dans la barre du chapitre (le libellé « Plein
          écran » se repliait sur deux lignes en étouffant la ligne) —
          hauteur 40 px, polices 11 px, libellés sur une seule ligne,
          curseur plus court sur petit écran. Reste tactile : 40 px de
          hauteur de cible. */}
      <button
        type="button"
        onClick={() => setDefile((d) => !d)}
        aria-pressed={defile}
        aria-label="Défilement automatique (touche A)"
        title="Défilement automatique — touche A"
        className={`min-h-10 text-[11px] px-2 whitespace-nowrap ${defile ? 'bouton-principal' : 'bouton-fantome'}`}
      >
        {defile ? 'Pause' : 'Défiler'}
      </button>
      <input
        type="range"
        min={VITESSE_MIN}
        max={VITESSE_MAX}
        step={10}
        value={vitesse}
        onChange={(e) => majVitesse(Number(e.target.value))}
        aria-label="Vitesse du défilement automatique, pixels par seconde"
        className={`w-16 sm:w-20 accent-[var(--color-grenat-500)] ${defile ? '' : 'opacity-50'}`}
      />
      {pleinEcranPossible && (
        <button
          type="button"
          onClick={() => void basculerPleinEcran()}
          aria-pressed={pleinEcran}
          aria-label="Plein écran (touche F)"
          title="Plein écran — touche F (Échap pour sortir)"
          className="bouton-fantome min-h-10 text-[11px] px-2 whitespace-nowrap"
        >
          {pleinEcran ? 'Quitter' : 'Plein écran'}
        </button>
      )}
    </div>
  );
}
