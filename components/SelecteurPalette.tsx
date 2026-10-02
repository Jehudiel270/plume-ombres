// ============================================================
// SelecteurPalette.tsx — Choix de la palette (groupes de radios).
//
// Accessibilité : vrais <input type="radio"> (nom commun) → flèches
// du clavier, lecture d'écran et cibles tactiles natives ; le style
// passe par peer-checked / peer-focus-visible.
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
    <fieldset className="mb-3">
      <legend className="text-micro text-encre-500 mb-1.5">Palette</legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-1.5">
        {ORDRE_PALETTES.map((id) => {
          const p = PALETTES[id];
          const actif = valeur === id;
          return (
            <label
              key={id}
              className={`relative flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${
                actif
                  ? 'border-grenat-600'
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
              {/* Aperçu : fond + surface + accent réels de la palette */}
              <span
                aria-hidden="true"
                className="relative h-7 w-7 shrink-0 rounded-md border border-black/30 overflow-hidden peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-grenat-400"
                style={{ background: p.apercu.fond }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 h-2.5"
                  style={{ background: p.apercu.surface }}
                />
                <span
                  className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: p.apercu.accent }}
                />
              </span>
              <span
                className={`min-w-0 text-micro leading-tight truncate ${
                  actif ? 'text-encre-100' : 'text-encre-300'
                }`}
                style={{
                  borderLeft: `2px solid ${p.apercu.accent}`,
                  paddingLeft: '0.35rem',
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
