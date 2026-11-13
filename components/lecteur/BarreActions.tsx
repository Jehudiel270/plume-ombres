'use client';

// ============================================================
// BarreActions.tsx — Bandeau du haut : retour, titre du livre,
// langues (sélecteurs source → cible), temps de lecture et
// boutons d'export (`Exports`). Mémoïsé.
//
// Mobile (C3) : bandeau CONDENSÉ — seuls le titre et l'état de
// lecture restent visibles ; langues et exports sont repliés
// derrière « Options ». Le repli vit dans l'état LOCAL du composant :
// l'ouvrir/le fermer ne re-rend pas l'espace de travail (mémoïsation).
// ============================================================

import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import { LANGUES } from '@/lib/types';
import type { CodeLangue, Livre } from '@/lib/types';
import Exports from './Exports';
import type { EtatExports } from './partages';

const CODES = Object.keys(LANGUES) as CodeLangue[];

interface Props extends EtatExports {
  livre: Livre;
  /** Estimation du temps de lecture du livre entier ('' si inconnue). */
  tempsEstime: string;
  /** Temps déjà passé sur ce livre, ou null. */
  tempsLecture: string | null;
  /** Un chapitre est chargé (active l'export du chapitre courant). */
  chapitreDisponible: boolean;
  /** Interrupteur `graphe` (F25) évalué côté serveur : lien masqué si fermé. */
  grapheOuvert?: boolean;
  onChangerLangues: (source: string, cible: string) => void;
  onExporterChapitre: () => void;
  onExporterLivre: () => void;
  onExporterLivreDocx: () => void;
  onImprimerLivrePdf: () => void;
  onTelechargerPdfTraduit: () => void;
  onTelechargerFidele: () => void;
}

function BarreActions({
  livre,
  tempsEstime,
  tempsLecture,
  chapitreDisponible,
  grapheOuvert = false,
  onChangerLangues,
  onExporterChapitre,
  onExporterLivre,
  onExporterLivreDocx,
  onImprimerLivrePdf,
  onTelechargerPdfTraduit,
  onTelechargerFidele,
  exportEnCours,
  genPdf,
  exportFidele,
}: Props) {
  // Repli du bandeau sur mobile — état LOCAL (aucun impact sur le parent).
  const [optionsOuvertes, setOptionsOuvertes] = useState(false);
  const basculerOptions = useCallback(
    () => setOptionsOuvertes((ouvertes) => !ouvertes),
    []
  );

  return (
    <div className="velours p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 mr-auto">
        <Link
          href="/bibliotheque"
          className="text-[11px] text-encre-500 hover:text-grenat-300 transition-colors"
        >
          ← Bibliothèque
        </Link>
        <h1 className="font-display text-xl text-encre-100 truncate leading-snug">
          {livre.titre}
        </h1>
        <p className="text-[11px] text-encre-500">
          {LANGUES[livre.langue_source as CodeLangue]} →{' '}
          {LANGUES[livre.langue_cible as CodeLangue]}
          {grapheOuvert && (
            <>
              {' · '}
              <Link
                href={`/livres/${livre.id}/graphe`}
                className="hover:text-grenat-300 underline decoration-dotted"
              >
                Graphe narratif
              </Link>
            </>
          )}
          {tempsEstime && (
            <span title="Temps estimé de lecture du livre entier">
              {' '}
              · ⏱ ~{tempsEstime}
            </span>
          )}
          {tempsLecture && (
            <span title="Temps que vous y avez consacré">
              {' '}
              · lu : {tempsLecture}
            </span>
          )}
        </p>
      </div>

      {/* Langues toujours visibles : sur mobile, elles étaient repliées
          derrière « Options », ce qui donnait l'impression que l'anglais
          ne pouvait pas être changé. */}
      <div className="flex items-center gap-2 w-full sm:w-auto order-last sm:order-none">
        <select
          className="select-sombre text-xs flex-1 sm:flex-none min-w-0"
          value={livre.langue_source}
          onChange={(e) => onChangerLangues(e.target.value, livre.langue_cible)}
          title="Langue source"
          aria-label="Langue source"
        >
          {CODES.map((c) => (
            <option key={c} value={c}>
              {LANGUES[c]}
            </option>
          ))}
        </select>
        <span className="text-encre-500 text-xs" aria-hidden="true">
          →
        </span>
        <select
          className="select-sombre text-xs flex-1 sm:flex-none min-w-0"
          value={livre.langue_cible}
          onChange={(e) => onChangerLangues(livre.langue_source, e.target.value)}
          title="Langue cible"
          aria-label="Langue cible"
        >
          {CODES.map((c) => (
            <option key={c} value={c}>
              {LANGUES[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Bandeau condensé : le repli ne concerne plus que les exports. */}
      <div className="w-full sm:hidden">
        <button
          type="button"
          onClick={basculerOptions}
          aria-expanded={optionsOuvertes}
          aria-controls="options-livre"
          className="bouton-fantome w-full text-xs"
        >
          {optionsOuvertes ? '− Masquer les exports' : '⚙︎ Exports'}
        </button>
      </div>

      <div
        id="options-livre"
        className={`${
          optionsOuvertes ? 'flex' : 'hidden'
        } sm:flex w-full sm:w-auto flex-wrap items-center gap-3`}
      >
        <Exports
          livre={livre}
          exportEnCours={exportEnCours}
          genPdf={genPdf}
          exportFidele={exportFidele}
          chapitreDisponible={chapitreDisponible}
          onExporterChapitre={onExporterChapitre}
          onExporterLivre={onExporterLivre}
          onExporterLivreDocx={onExporterLivreDocx}
          onImprimerLivrePdf={onImprimerLivrePdf}
          onTelechargerPdfTraduit={onTelechargerPdfTraduit}
          onTelechargerFidele={onTelechargerFidele}
        />
      </div>
    </div>
  );
}

export default memo(BarreActions);
