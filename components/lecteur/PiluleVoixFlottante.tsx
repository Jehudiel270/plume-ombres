'use client';

// ============================================================
// components/lecteur/PiluleVoixFlottante.tsx — Contrôles compacts
// de la lecture à voix haute (F9), FIXES pendant le défilement.
//
// La feuille « Écouter » porte les réglages (voix, vitesse) ; la
// pilule porte l'ESSENTIEL, atteignable en tout temps, PC comme
// téléphone : pause / reprise, arrêt, avancement. C'est la réponse
// directe au problème d'origine (« pour arrêter la lecture il
// fallait remonter en haut du chapitre »).
//
// Placée à GAUCHE sur la même rangée que le bouton radial (droite) :
// les deux cohabitent sans se recouvrir.
// ============================================================

import { Pause, Play, Square } from 'lucide-react';

import type { ControleVoix } from './useVoix';

export default function PiluleVoixFlottante({ voix }: { voix: ControleVoix }) {
  if (voix.statut === 'arret') return null;
  const progression =
    voix.total > 0 ? Math.round(((voix.index + 1) / voix.total) * 100) : 0;

  return (
    <div
      role="toolbar"
      aria-label="Lecture en cours"
      className="fixed left-3 right-[5.25rem] bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-1.5 rounded-full border border-nuit-700 bg-nuit-900/95 px-2 py-1.5 shadow-xl backdrop-blur lg:left-6 lg:right-auto lg:bottom-8 lg:w-[26rem] animate-fondu-monte"
    >
      {voix.statut === 'lecture' ? (
        <button
          type="button"
          onClick={voix.mettreEnPause}
          aria-label="Mettre la lecture en pause"
          className="bouton-principal grid h-10 w-10 shrink-0 cursor-pointer place-items-center !px-0"
        >
          <Pause size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={voix.demarrer}
          aria-label="Reprendre la lecture"
          className="bouton-principal grid h-10 w-10 shrink-0 cursor-pointer place-items-center !px-0"
        >
          <Play size={16} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={voix.arreter}
        aria-label="Arrêter la lecture"
        className="bouton-fantome grid h-10 w-10 shrink-0 cursor-pointer place-items-center !px-0"
      >
        <Square size={13} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] leading-tight text-encre-400 tabular-nums"
          aria-live="polite"
        >
          {voix.statut === 'pause' ? 'En pause — ' : ''}
          Paragraphe {voix.index + 1} sur {voix.total}
        </p>
        <div
          className="mt-1 h-1 overflow-hidden rounded-full bg-nuit-800"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-grenat-600"
            style={{ width: `${progression}%` }}
          />
        </div>
      </div>
    </div>
  );
}
