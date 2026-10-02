// ============================================================
// SelecteurTypo.tsx — Choix de la typographie du site.
//
// Chaque option s'affiche DANS la police réelle (aperçu visuel) :
// « Aa » en police de titre, « Abc » en police de corps. Vrais
// radios → navigation clavier native + cibles tactiles.
// ============================================================

'use client';

import { ORDRE_TYPOS, TYPOS, type TypoId } from '@/lib/theme';

export default function SelecteurTypo({
  valeur,
  onChoix,
  nom = 'typo-plume',
}: {
  valeur: TypoId;
  onChoix: (t: TypoId) => void;
  nom?: string;
}) {
  return (
    <fieldset className="mb-3">
      <legend className="text-micro text-encre-500 mb-1.5">
        Typographie
      </legend>
      <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
        {ORDRE_TYPOS.map((id) => {
          const t = TYPOS[id];
          const actif = valeur === id;
          return (
            <label
              key={id}
              className={`relative flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2 cursor-pointer transition-colors ${
                actif
                  ? 'border-grenat-600 bg-nuit-700/50'
                  : 'border-nuit-700 hover:border-grenat-600/70'
              }`}
              title={t.description}
            >
              <input
                type="radio"
                name={nom}
                value={id}
                checked={actif}
                onChange={() => onChoix(id)}
                className="sr-only peer"
              />
              <span
                aria-hidden="true"
                className="text-lg leading-none text-encre-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-grenat-400 rounded-sm"
                style={{ fontFamily: t.titre }}
              >
                Aa
              </span>
              <span
                aria-hidden="true"
                className="text-nano leading-none text-encre-500"
                style={{ fontFamily: t.corps }}
              >
                Abc 123
              </span>
              <span
                className={`text-nano leading-tight mt-0.5 ${
                  actif ? 'text-encre-100' : 'text-encre-500'
                }`}
              >
                {t.nom}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-nano text-encre-500 mt-1.5 leading-snug">
        {TYPOS[valeur].description}
      </p>
    </fieldset>
  );
}
