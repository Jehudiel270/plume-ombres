'use client';

// ============================================================
// CommandesTraduction.tsx — Commandes de traduction : bandeau de
// progression (lot en cours + annulation), boutons « Traduire ce
// chapitre » / « Tout traduire » et bascule source ↔ traduction.
// Mémoïsé.
// ============================================================

import { memo } from 'react';
import { LANGUES } from '@/lib/types';
import type { CodeLangue } from '@/lib/types';
import type { Progression } from '@/lib/useMoteurTraduction';
import {
  ETIQUETTE_STATUT_CHAPITRE,
  type ChapitreLeger,
  type Compteurs,
} from './partages';

interface Props {
  /** Une traduction est en cours (le bandeau de progression remplace les commandes). */
  actif: boolean;
  progression: Progression;
  onAnnuler: () => void;
  /** Chapitre actuellement sélectionné (null si aucun). */
  chapitreActuel: ChapitreLeger | null;
  compteurs: Compteurs | null;
  onTraduireSelection: () => void;
  onToutTraduire: () => void;
  /** Mode d'affichage courant du lecteur. */
  lecture: 'source' | 'traduit';
  onLecture: (mode: 'source' | 'traduit') => void;
  /** Le chapitre affiché possède une traduction (affiche la bascule). */
  texteTraduitDisponible: boolean;
  langueSource: string;
  langueCible: string;
}

function CommandesTraduction({
  actif,
  progression,
  onAnnuler,
  chapitreActuel,
  compteurs,
  onTraduireSelection,
  onToutTraduire,
  lecture,
  onLecture,
  texteTraduitDisponible,
  langueSource,
  langueCible,
}: Props) {
  return (
    <>
      {/* Progression de la traduction en cours */}
      {actif && (
        <div className="velours p-4 animate-fondu-monte border-grenat-700">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-52">
              <p className="text-sm text-encre-100 mb-1.5">
                {progression.chapitreEnCours
                  ? `Traduction de « ${progression.chapitreEnCours.titre} »…`
                  : 'Préparation…'}
              </p>
              <div className="h-2 rounded-full bg-nuit-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-grenat-400 via-grenat-500 to-violet-rom-500 transition-all duration-300"
                  style={{
                    width: `${
                      progression.total > 0
                        ? Math.round(
                            ((progression.faits + progression.erreurs) /
                              progression.total) *
                              100
                          )
                        : 4
                    }%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-encre-500 mt-1.5">
                {progression.faits + progression.erreurs} /{' '}
                {progression.total} segments traités
                {progression.erreurs > 0 &&
                  ` · ${progression.erreurs} en erreur`}
              </p>
            </div>
            <button
              type="button"
              onClick={onAnnuler}
              className="bouton-fantome !border-amber-500/50 text-amber-300 text-xs"
            >
              ■ Annuler
            </button>
          </div>
        </div>
      )}

      {/* Commandes de traduction */}
      {!actif && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTraduireSelection}
            disabled={!chapitreActuel || chapitreActuel.statut === 'traduit'}
            className="bouton-principal text-sm"
            title={
              chapitreActuel?.statut === 'traduit'
                ? 'Chapitre déjà traduit'
                : 'Traduire le chapitre sélectionné'
            }
          >
            {chapitreActuel?.statut === 'a_traduire'
              ? 'Traduire ce chapitre'
              : chapitreActuel?.statut === 'erreur'
                ? 'Reprendre ce chapitre'
                : 'Traduire ce chapitre'}
          </button>
          <button
            type="button"
            onClick={onToutTraduire}
            disabled={compteurs !== null && compteurs.total === compteurs.faits}
            className="bouton-fantome text-sm"
          >
            Tout traduire
          </button>
          {chapitreActuel && (
            <span
              className={`text-[11px] uppercase tracking-wider rounded-full px-2.5 py-1 ${
                chapitreActuel.statut === 'traduit'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : chapitreActuel.statut === 'en_traduction'
                    ? 'bg-grenat-500/15 text-grenat-300'
                    : chapitreActuel.statut === 'erreur'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-encre-500/15 text-encre-300'
              }`}
            >
              {ETIQUETTE_STATUT_CHAPITRE[chapitreActuel.statut]}
            </span>
          )}
        </div>
      )}

      {/* Bascule source / traduction */}
      {texteTraduitDisponible && (
        <div className="flex rounded-full bg-nuit-800 p-1 w-fit border border-nuit-700">
          <button
            type="button"
            onClick={() => onLecture('source')}
            className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
              lecture === 'source'
                ? 'bg-nuit-700 text-encre-100'
                : 'text-encre-500 hover:text-encre-300'
            }`}
          >
            {LANGUES[langueSource as CodeLangue]}
          </button>
          <button
            type="button"
            onClick={() => onLecture('traduit')}
            className={`px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
              lecture === 'traduit'
                ? 'bg-nuit-700 text-encre-100'
                : 'text-encre-500 hover:text-encre-300'
            }`}
          >
            {LANGUES[langueCible as CodeLangue]}
          </button>
        </div>
      )}
    </>
  );
}

export default memo(CommandesTraduction);
