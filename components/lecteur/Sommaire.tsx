'use client';

// ============================================================
// Sommaire.tsx — Colonne de gauche : liste des chapitres
// (statut, sélection) et progression globale du livre.
// Mémoïsé : ne se re-rend que si `chapitres`, `selection` ou
// `compteurs` changent — un changement de recherche, de réglage
// de lecture ou d'export ne le réveille plus.
// ============================================================

import { memo } from 'react';
import {
  ETIQUETTE_STATUT_CHAPITRE,
  POINT_STATUT,
  type ChapitreLeger,
  type Compteurs,
} from './partages';

interface Props {
  chapitres: ChapitreLeger[];
  selection: string | null;
  /** Change le chapitre affiché (stable : `setSelection`). */
  onSelection: (id: string) => void;
  compteurs: Compteurs | null;
}

function Sommaire({ chapitres, selection, onSelection, compteurs }: Props) {
  const pourcentage =
    compteurs && compteurs.total > 0
      ? Math.round((compteurs.faits / compteurs.total) * 100)
      : 0;

  return (
    <aside className="w-full lg:w-80 shrink-0">
      <div className="velours p-4 flex flex-col h-full max-h-[75vh] lg:sticky lg:top-20">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs uppercase tracking-[0.25em] text-encre-500">
            Chapitres
          </h2>
          <span className="text-[11px] text-encre-500">{chapitres.length}</span>
        </div>

        <nav className="space-y-1 overflow-y-auto pr-1 flex-1">
          {chapitres.map((chapitre) => (
            <button
              key={chapitre.id}
              type="button"
              onClick={() => onSelection(chapitre.id)}
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
  );
}

export default memo(Sommaire);
