'use client';

// ============================================================
// components/clubs/SelecteurEmojis.tsx — Palette d'émojis du salon
// (F11 v3). Deux usages :
//   • insérer un émoji dans le message en cours de composition ;
//   • réagir à un message (liste blanche courte).
//
// Vrais émojis Unicode, AUCUNE dépendance externe : rendu par la
// police du système, comme dans n'importe quelle messagerie. La
// palette s'ouvre sous le bouton qui l'appelle ; Échap ou un clic
// au-dehors la referment.
// ============================================================

import { useEffect, useRef } from 'react';

import { EMOJIS_REACTIONS } from '@/lib/clubs';

/** Palette étendue pour la COMPOSITION, par familles. */
export const PALETTE_COMPOSITION: ReadonlyArray<{
  famille: string;
  emojis: string[];
}> = [
  {
    famille: 'Émotions',
    emojis: [
      '😀', '😄', '😁', '😅', '🤣', '😂', '🙂', '😉',
      '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜',
      '🤪', '🤗', '🤭', '🤫', '🤔', '😐', '😴', '🥱',
      '😌', '😔', '😪', '🥲', '😢', '😭', '😤', '😱',
      '🤯', '🥳', '😎', '🤓', '🧐', '😲', '🥺', '😬',
    ],
  },
  {
    famille: 'Gestes',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏',
      '🙌', '🤝', '🙏', '💪', '👋', '🫡', '🤌', '🫶',
    ],
  },
  {
    famille: 'Cœurs',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '💔', '💕', '💓', '💗', '💖', '💘', '💝', '✨',
    ],
  },
  {
    famille: 'Lecture',
    emojis: [
      '📚', '📖', '📕', '📗', '📘', '📙', '📝', '✍️',
      '🕯️', '☕', '🫖', '🍷', '🌙', '⭐', '🔥', '🎧',
    ],
  },
];

export default function SelecteurEmojis({
  mode,
  titre,
  onChoisir,
  onFermer,
}: {
  /** 'composition' : palette complète par familles ; 'reaction' : liste blanche. */
  mode: 'composition' | 'reaction';
  titre: string;
  onChoisir: (emoji: string) => void;
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement | null>(null);
  const boutonFermer = useRef<HTMLButtonElement | null>(null);

  // Fermeture au clic au-dehors + touche Échap.
  useEffect(() => {
    const clicDehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) {
        onFermer();
      }
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    document.addEventListener('mousedown', clicDehors);
    document.addEventListener('keydown', echap);
    boutonFermer.current?.focus();
    return () => {
      document.removeEventListener('mousedown', clicDehors);
      document.removeEventListener('keydown', echap);
    };
  }, [onFermer]);

  // Composition : palette complète regroupée par familles.
  // Réaction : la liste blanche, plate, directe.
  const familles = mode === 'composition' ? PALETTE_COMPOSITION : null;
  const liste = mode === 'reaction' ? EMOJIS_REACTIONS : null;

  return (
    <div
      ref={boite}
      role="dialog"
      aria-label={titre}
      className="z-30 rounded-2xl border border-nuit-700 bg-nuit-850 p-3 shadow-xl shadow-black/40 animate-fondu-monte"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="sur-titre text-xs text-encre-400">{titre}</p>
        <button
          ref={boutonFermer}
          type="button"
          onClick={onFermer}
          aria-label="Fermer la palette d’émojis"
          className="rounded-full border border-nuit-700 px-2 py-0.5 text-xs text-encre-400 hover:text-encre-100 transition-colors cursor-pointer"
        >
          Fermer
        </button>
      </div>

      {familles ? (
        <div className="max-h-64 overflow-y-auto pr-1">
          {familles.map((famille) => (
            <div key={famille.famille} className="mb-2 last:mb-0">
              <p className="text-[11px] uppercase tracking-wide text-encre-500 mb-1">
                {famille.famille}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {famille.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onChoisir(emoji)}
                    aria-label={`Insérer ${famille.famille.toLowerCase()} ${emoji}`}
                    className="rounded-lg px-1 py-1 text-xl leading-none hover:bg-nuit-800 active:scale-90 transition cursor-pointer"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-8 gap-1">
          {(liste ?? []).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChoisir(emoji)}
              aria-label={`Réagir avec ${emoji}`}
              className="rounded-lg px-1 py-1 text-xl leading-none hover:bg-nuit-800 active:scale-90 transition cursor-pointer"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
