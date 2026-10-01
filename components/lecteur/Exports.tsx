'use client';

// ============================================================
// Exports.tsx — Boutons d'export du livre (chapitre .md,
// livre .md, Word, impression PDF, PDF re-paginé, PDF fidèle).
// Mémoïsé ; renvoie un fragment pour rester enfant direct du
// bandeau `flex-wrap` (mise en page inchangée).
// ============================================================

import { memo } from 'react';
import { Download, FileDown, FileText, Printer, Save, Sparkles } from 'lucide-react';
import type { Livre } from '@/lib/types';
import type { EtatExports } from './partages';

interface Props extends EtatExports {
  livre: Livre;
  /** Un chapitre est chargé : l'export du chapitre courant est possible. */
  chapitreDisponible: boolean;
  onExporterChapitre: () => void;
  onExporterLivre: () => void;
  onExporterLivreDocx: () => void;
  onImprimerLivrePdf: () => void;
  onTelechargerPdfTraduit: () => void;
  onTelechargerFidele: () => void;
}

function Exports({
  livre,
  exportEnCours,
  genPdf,
  exportFidele,
  chapitreDisponible,
  onExporterChapitre,
  onExporterLivre,
  onExporterLivreDocx,
  onImprimerLivrePdf,
  onTelechargerPdfTraduit,
  onTelechargerFidele,
}: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onExporterChapitre}
        disabled={!chapitreDisponible || exportEnCours}
        className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
        title="Exporter le chapitre courant (.md)"
      >
        <FileDown size={14} aria-hidden />
        <span>Chapitre</span>
      </button>
      <button
        type="button"
        onClick={onExporterLivre}
        disabled={exportEnCours}
        className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
        title="Exporter le livre entier (.md)"
      >
        <FileText size={14} aria-hidden />
        <span>Livre (.md)</span>
      </button>
      <button
        type="button"
        onClick={onExporterLivreDocx}
        disabled={exportEnCours}
        className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
        title="Télécharger le livre mis en forme (Word)"
      >
        <Save size={14} aria-hidden />
        <span>Word (.docx)</span>
      </button>
      <button
        type="button"
        onClick={onImprimerLivrePdf}
        disabled={exportEnCours}
        className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
        title="Mise en page puis « Enregistrer en PDF »"
      >
        <Printer size={14} aria-hidden />
        <span>Imprimer en PDF</span>
      </button>
      <button
        type="button"
        onClick={onTelechargerPdfTraduit}
        disabled={!!genPdf || exportEnCours}
        className="bouton-fantome inline-flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs"
        title="Télécharger le livre TRADUIT, re-paginé, même gabarit que l'original"
      >
        <Download size={14} aria-hidden />
        <span>
          {genPdf
            ? `PDF re-paginé… ${genPdf.fait}/${genPdf.total === 2 ? '…' : genPdf.total}`
            : 'PDF traduit (re-paginé)'}
        </span>
      </button>
      {livre.fichier_original &&
        ((livre.nom_fichier ?? '').toLowerCase().endsWith('.pdf') ? (
          <button
            type="button"
            onClick={onTelechargerFidele}
            disabled={!!exportFidele || exportEnCours || !!genPdf}
            className="bouton-fidele mt-2 flex w-full items-center justify-center gap-2.5 !px-4 !py-2.5 text-sm"
            title="Même PDF que l'original (couleur de page, marges, polices, images, ornement) avec le corps en français"
          >
            <Sparkles size={17} aria-hidden />
            <span
              className={exportFidele ? 'flex items-center gap-2 flex-col text-left' : ''}
            >
              {exportFidele ? (
                <>
                  <span>
                    {exportFidele.libelle} ({exportFidele.etape}/{exportFidele.total})…
                  </span>
                  <span className="progression-export w-4/5 h-1 bg-white/15 overflow-hidden rounded-full">
                    <span
                      className="block h-full bg-grenat-400 transition-all"
                      style={{
                        width: `${Math.round(
                          ((exportFidele.etape - 1) / exportFidele.total) * 100
                        )}%`,
                      }}
                    />
                  </span>
                </>
              ) : (
                <span>PDF — mise en page d’origine, contenu FR</span>
              )}
            </span>
          </button>
        ) : (
          // Original .txt / .md / .epub : il n’y a pas de mise en
          // page d’origine à conserver (pas de PDF source). On
          // n’affiche plus un bouton qui échouait binairement
          // (« No PDF header found ») — on oriente vers les deux
          // alternatives qui produisent bien un PDF lisible.
          <p className="mt-2 text-[11px] text-encre-500 bg-nuit-800/40 border border-nuit-700/40 rounded-xl px-3 py-2">
            ✦ Original <code className="text-grenat-300">{(livre.nom_fichier ?? 'texte').match(/\.[a-z0-9]+$/i)?.[0] ?? ''}</code> —
            la mise en page d’origine n’existe pas. PDF à vous :
            « PDF traduit (re-paginé) » ou « Imprimer en PDF ».
          </p>
        ))}
    </>
  );
}

export default memo(Exports);
