// ============================================================
// SelecteurPalette.tsx — Choix de la palette (grille de radios).
//
// Accessibilité : vrais <input type="radio"> (nom commun) → flèches
// du clavier, lecture d'écran et cibles tactiles natives ; le style
// passe par peer-checked / peer-focus-visible.
//
// w8w9 : la grille passe à 3 colonnes avec aperçu compact et sa
// propre zone de défilement — nécessaire dès lors qu'il y a ~18
// palettes. Aucun changement de la navigation clavier.
// ============================================================

'use client';

import { ORDRE_PALETTES, PALETTES, type PaletteId } from '@/lib/theme';

export default function SelecteurPalette({
  valeur,
  onChoix,
  nom = 'palette-plume',
}: {
  valeur: PaletteId;
  onChoix: (p: PaletteId) => void;
  nom?: string;
}) {
  return (
    <fieldset className="mb-3 min-w-0">
      <legend className="text-micro text-encre-500 mb-1.5">Palette</legend>
      <div
        role="radiogroup"
        aria-label="Palette de couleurs"
        className="grid grid-cols-3 gap-1.5 max-h-[38vh] overflow-y-auto pr-1"
      >
        {ORDRE_PALETTES.map((id) => {
          const p = PALETTES[id];
          const actif = valeur === id;
          return (
            <label
              key={id}
              title={p.nom}
              className={`relative flex min-w-0 flex-col gap-1 rounded-lg border p-1 cursor-pointer transition-colors ${
                actif
                  ? 'border-grenat-600 bg-nuit-700/40'
                  : 'border-nuit-700 hover:border-grenat-600/70'
              }`}
            >
              <input
                type="radio"
                name={nom}
                value={id}
                checked={actif}
                onChange={() => onChoix(id)}
                className="sr-only peer"
              />
              {/* Aperçu compact : fond + surface + accent réels */}
              <span
                aria-hidden="true"
                className="relative block h-6 w-full shrink-0 overflow-hidden rounded border border-black/30 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-grenat-400"
                style={{ background: p.apercu.fond }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 h-2"
                  style={{ background: p.apercu.surface }}
                />
                <span
                  className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: p.apercu.accent }}
                />
              </span>
              <span
                className={`min-w-0 truncate text-center text-nano leading-tight ${
                  actif ? 'text-encre-100' : 'text-encre-300'
                }`}
                style={{
                  borderTop: `2px solid ${p.apercu.accent}`,
                  paddingTop: '0.15rem',
                }}
              >
                {p.nom}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-nano text-encre-500 mt-1.5 leading-snug">
        {PALETTES[valeur].description}
      </p>
    </fieldset>
  );
}
