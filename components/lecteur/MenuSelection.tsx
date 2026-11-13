'use client';

// ============================================================
// components/lecteur/MenuSelection.tsx — Actions sur la sélection
// de texte, portage de la maquette (ReaderSelectionMenu.vue) :
//   * « Surligner » : cinq couleurs (or, rouge, azur, menthe, lilas)
//     posées sur la sélection et conservées au carnet ;
//   * « Ajouter une note » : édition en place (extrait + note +
//     couleur), comme dans la maquette ;
//   * actions propres au lecteur : Copier la sélection, Comparer le
//     terme dans toute la traduction (F19), Chercher dans le
//     chapitre — en plus des commandes natives du navigateur, qui
//     restent disponibles (le menu ne bloque pas la sélection).
// ============================================================

import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { COULEURS_CARNET, type CouleurCarnet } from '@/lib/carnet';

const nePasSouscrire = () => () => {};

function useMontage(): boolean {
  return useSyncExternalStore(
    nePasSouscrire,
    () => true,
    () => false
  );
}

// ------------------------------------------------------------
// Menu de sélection (portage de ReaderSelectionMenu)
// ------------------------------------------------------------

interface PropsMenuSelection {
  x: number;
  y: number;
  extrait: string;
  /** Modules ouverts (évalués côté serveur) : actions filtrées. */
  comparerOuvert: boolean;
  surSurligner: (couleur: CouleurCarnet) => void;
  surNote: (texte: string, couleur: CouleurCarnet) => void;
  surCopier: () => void;
  surComparer: () => void;
  surChercher: () => void;
}

export function MenuSelection({
  x,
  y,
  extrait,
  comparerOuvert,
  surSurligner,
  surNote,
  surCopier,
  surComparer,
  surChercher,
}: PropsMenuSelection) {
  // mode « idle » = actions ; sinon édition de la note en place.
  const [mode, setMode] = useState<'idle' | 'note'>('idle');
  const [texte, setTexte] = useState('');
  const [couleur, setCouleur] = useState<CouleurCarnet>('azur');
  const monte = useMontage();

  // Nouvelle sélection : l'édition repart de zéro (comme la maquette).
  // Ajustement d'état PENDANT le rendu (pattern officiel React, même
  // convention que useVoix pour le changement de chapitre).
  const [extraitVu, setExtraitVu] = useState(extrait);
  if (extraitVu !== extrait) {
    setExtraitVu(extrait);
    setMode('idle');
    setTexte('');
  }

  const court = extrait.length > 90 ? `${extrait.slice(0, 90)}…` : extrait;

  const enregistrer = () => {
    if (!texte.trim()) return;
    surNote(texte.trim(), couleur);
    setMode('idle');
    setTexte('');
  };

  if (!monte) return null;

  return createPortal(
    <div
      className="fixed z-50 w-[min(320px,calc(100vw-16px))] -translate-x-1/2 rounded-xl border border-nuit-600 bg-nuit-900 p-2.5 text-encre-100 shadow-pop animate-fondu-monte"
      style={{ left: `${x}px`, top: `${y}px` }}
      role="toolbar"
      aria-label="Actions sur la sélection"
      // La sélection native doit SURVIVRE au clic sur le menu
      // (copie, surlignage) : on bloque le mousedown sur la boîte.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {mode === 'idle' ? (
        <>
          <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-encre-500">
            Surligner
          </p>
          <div className="flex items-center gap-1">
            {COULEURS_CARNET.map((c) => (
              <button
                key={c.valeur}
                type="button"
                className="grid h-9 min-w-9 flex-1 cursor-pointer place-items-center rounded-lg border border-nuit-700 hover:border-nuit-600"
                aria-label={`Surligner en ${c.label.toLowerCase()}`}
                onClick={() => surSurligner(c.valeur)}
              >
                <span className={`h-4 w-4 rounded-full ${c.pastille}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className="bouton-fantome flex-1 min-h-9 text-xs"
              onClick={() => setMode('note')}
            >
              Ajouter une note
            </button>
            <button
              type="button"
              className="bouton-fantome flex-1 min-h-9 text-xs"
              onClick={surCopier}
            >
              Copier
            </button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {comparerOuvert && (
              <button
                type="button"
                className="bouton-fantome flex-1 min-h-9 text-xs"
                title="Voir comment ce terme est traduit dans tout le livre"
                onClick={surComparer}
              >
                Comparer
              </button>
            )}
            <button
              type="button"
              className="bouton-fantome flex-1 min-h-9 text-xs"
              onClick={surChercher}
            >
              Chercher
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 line-clamp-2 border-l-2 border-grenat-700/60 pl-2 text-[12px] italic text-encre-400">
            {court}
          </p>
          <label htmlFor="menu-selection-note" className="sr-only">
            Votre note sur ce passage
          </label>
          <textarea
            id="menu-selection-note"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={3}
            placeholder="Votre note sur ce passage"
            className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
          <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Couleur">
            {COULEURS_CARNET.map((c) => (
              <button
                key={c.valeur}
                type="button"
                role="radio"
                aria-checked={couleur === c.valeur}
                aria-label={c.label}
                onClick={() => setCouleur(c.valeur)}
                className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full border ${
                  couleur === c.valeur ? 'border-encre-200' : 'border-transparent'
                }`}
              >
                <span className={`h-4 w-4 rounded-full ${c.pastille}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              className="bouton-fantome min-h-9 px-3 text-xs"
              onClick={() => setMode('idle')}
            >
              Retour
            </button>
            <button
              type="button"
              disabled={!texte.trim()}
              onClick={enregistrer}
              className="bouton-principal min-h-9 px-3 text-xs disabled:opacity-40"
            >
              Enregistrer
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

// ------------------------------------------------------------
// Bulle d'un surlignage existant (clic dans le texte) : copier,
// annoter, retirer. Extension naturelle du portage : la maquette
// garde ses surlignages dans le carnet ; ici le retrait est
// possible sans quitter la lecture.
// ------------------------------------------------------------

interface PropsBulle {
  x: number;
  y: number;
  surCopier: () => void;
  surAnnoter: () => void;
  surRetirer: () => void;
  surFermer: () => void;
}

export function BulleSurlignage({
  x,
  y,
  surCopier,
  surAnnoter,
  surRetirer,
  surFermer,
}: PropsBulle) {
  const monte = useMontage();
  if (!monte) return null;

  return createPortal(
    <>
      {/* Fond invisible cliquable : ferme la bulle au clic extérieur,
          sans écouteur global (règles React Compiler). */}
      <div className="fixed inset-0 z-40" onClick={surFermer} aria-hidden="true" />
      <div
        className="fixed z-50 -translate-x-1/2 rounded-xl border border-nuit-600 bg-nuit-900 p-1.5 text-encre-100 shadow-pop animate-fondu-monte"
        style={{ left: `${x}px`, top: `${y}px` }}
        role="toolbar"
        aria-label="Surlignage"
      >
        <div className="flex gap-1">
          <button
            type="button"
            className="bouton-fantome min-h-9 px-3 text-xs"
            onClick={surCopier}
          >
            Copier
          </button>
          <button
            type="button"
            className="bouton-fantome min-h-9 px-3 text-xs"
            onClick={surAnnoter}
          >
            Annoter
          </button>
          <button
            type="button"
            className="min-h-9 rounded-lg px-3 text-xs text-grenat-300 hover:bg-white/[0.06] cursor-pointer"
            onClick={surRetirer}
          >
            Retirer
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
