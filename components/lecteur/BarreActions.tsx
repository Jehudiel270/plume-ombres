'use client';

// ============================================================
// BarreActions.tsx — Bandeau du haut : retour, titre du livre,
// langues (sélecteurs source → cible), temps de lecture et
// boutons d'export (`Exports`). Mémoïsé.
// ============================================================

import { memo } from 'react';
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

      <select
        className="select-sombre text-xs"
        value={livre.langue_source}
        onChange={(e) => onChangerLangues(e.target.value, livre.langue_cible)}
        title="Langue source"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {LANGUES[c]}
          </option>
        ))}
      </select>
      <span className="text-encre-500 text-xs">→</span>
      <select
        className="select-sombre text-xs"
        value={livre.langue_cible}
        onChange={(e) => onChangerLangues(livre.langue_source, e.target.value)}
        title="Langue cible"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {LANGUES[c]}
          </option>
        ))}
      </select>

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
  );
}

export default memo(BarreActions);
