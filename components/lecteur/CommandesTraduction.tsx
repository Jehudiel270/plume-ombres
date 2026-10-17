'use client';

// ============================================================
// CommandesTraduction.tsx — Commandes de traduction : bandeau de
// progression (lot en cours + annulation), boutons « Traduire ce
// chapitre » / « Tout traduire » et bascule source ↔ traduction.
// Mémoïsé.
//
// Mobile (C3) : commandes condensées — les deux boutons se
// partagent la largeur, la bascule source/traduit passe en pleine
// largeur avec des cibles de 44 px (atteignables au pouce) ;
// la pastille de statut passe à la ligne. Le pourcentage de
// progression est mémoïsé (pas recalculé à chaque rendu).
// ============================================================

import { memo, useMemo } from 'react';
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
  /**
   * Ce qui reste à traduire dans le livre, mesuré AVANT lancement
   * (segments non traduits + somme réelle des caractères source).
   * `null` tant que la mesure n'a pas abouti — on n'affiche alors rien
   * plutôt qu'un chiffre inventé.
   */
  aTraduire: { segments: number; caracteres: number } | null;
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
  aTraduire,
  onTraduireSelection,
  onToutTraduire,
  lecture,
  onLecture,
  texteTraduitDisponible,
  langueSource,
  langueCible,
}: Props) {
  // Pourcentage du lot courant — mémoïsé sur la seule progression.
  const pourcentage = useMemo(
    () =>
      progression.total > 0
        ? Math.round(
            ((progression.faits + progression.erreurs) / progression.total) * 100
          )
        : 4,
    [progression.total, progression.faits, progression.erreurs]
  );

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
                  style={{ width: `${pourcentage}%` }}
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
              className="bouton-fantome !border-amber-500/50 text-amber-300 text-xs min-h-11"
            >
              ■ Annuler
            </button>
          </div>
        </div>
      )}

      {/* Commandes de traduction — condensées sur mobile */}
      {!actif && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Ce que la traduction va coûter, AVANT de la lancer : le quota
              se facture au caractère, l'utilisateur doit le voir ici. */}
          {aTraduire && aTraduire.segments > 0 && (
            <p
              className="w-full text-xs text-encre-500"
              data-testid="a-traduire"
            >
              {aTraduire.segments.toLocaleString('fr-FR')}{' '}
              {aTraduire.segments > 1 ? 'segments' : 'segment'} ·{' '}
              {aTraduire.caracteres.toLocaleString('fr-FR')} caractères à
              traduire
            </p>
          )}
          <button
            type="button"
            onClick={onTraduireSelection}
            disabled={!chapitreActuel || chapitreActuel.statut === 'traduit'}
            className="bouton-principal text-sm flex-1 sm:flex-none min-h-11"
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
            className="bouton-fantome text-sm flex-1 sm:flex-none min-h-11"
          >
            Tout traduire
          </button>
          {chapitreActuel && (
            <span
              className={`w-full sm:w-auto text-center sm:text-left text-[11px] uppercase tracking-wider rounded-full px-2.5 py-1 ${
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

      {/* Bascule source / traduction — pleine largeur au pouce */}
      {texteTraduitDisponible && (
        <div className="flex rounded-full bg-nuit-800 p-1 w-full sm:w-fit border border-nuit-700">
          <button
            type="button"
            onClick={() => onLecture('source')}
            className={`flex-1 sm:flex-none min-h-11 px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
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
            className={`flex-1 sm:flex-none min-h-11 px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
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
