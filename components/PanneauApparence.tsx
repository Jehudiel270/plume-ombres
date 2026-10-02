// ============================================================
// PanneauApparence.tsx — Réglages d'apparence DU SITE ENTIER.
//
// Monté UNE SEULE FOIS dans app/layout.tsx : le bouton flottant
// (bas droite) est donc présent sur TOUTES les pages, pas seulement
// dans le lecteur. Il s'ouvre aussi à la demande depuis n'importe
// quel menu via l'événement global :
//     window.dispatchEvent(new Event(EVENEMENT_APPARENCE))
//     (ou le raccourci ouvrirApparence() de lib/theme.ts)
//
// Le panneau réutilise le contexte ProviderTheme (palette et
// typographie persistées dans localStorage) et les sélecteurs
// accessibles SelecteurPalette / SelecteurTypo — exactement les
// mêmes composants que le panneau du lecteur, donc aucun doublon.
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ProviderTheme';
import SelecteurPalette from '@/components/SelecteurPalette';
import SelecteurTypo from '@/components/SelecteurTypo';
import { EVENEMENT_APPARENCE } from '@/lib/theme';

export default function PanneauApparence({
  variante = 'flottant',
}: {
  /**
   * `flottant` (défaut) : bouton fixe en bas à droite, sur toutes
   * les pages. `integre` : le composant s'insère dans son parent
   * (utile dans une barre de navigation), sans position fixe.
   */
  variante?: 'flottant' | 'integre';
}) {
  const { palette, typo, choisirPalette, choisirTypo, reinitialiser } =
    useTheme();
  const [ouvert, setOuvert] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const flottant = variante === 'flottant';

  // Ouverture depuis n'importe quelle page / n'importe quel menu.
  useEffect(() => {
    const ouvrir = () => setOuvert(true);
    window.addEventListener(EVENEMENT_APPARENCE, ouvrir);
    return () => window.removeEventListener(EVENEMENT_APPARENCE, ouvrir);
  }, []);

  // Fermeture : touche Échap et clic/toucher en dehors du panneau.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    const surPointeur = (e: PointerEvent) => {
      if (!zoneRef.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('pointerdown', surPointeur);
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('pointerdown', surPointeur);
    };
  }, [ouvert]);

  // À l'ouverture, le focus entre dans le panneau (clavier/lecteur
  // d'écran) ; Échap le rend à la page.
  useEffect(() => {
    if (ouvert) panneauRef.current?.focus();
  }, [ouvert]);

  const fermer = useCallback(() => setOuvert(false), []);

  return (
    <div
      ref={zoneRef}
      className={flottant ? 'zone-apparence' : 'relative'}
    >
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={`bouton-apparence bouton-fantome !px-3 !py-2 text-xs shadow-lg ${
          ouvert ? '!border-grenat-600 text-grenat-300' : ''
        }`}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-controls="panneau-apparence"
        title="Apparence du site (palette et typographie)"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ◐
        </span>
        <span className={flottant ? 'hidden sm:inline' : ''}>Apparence</span>
      </button>

      {ouvert && (
        <div
          ref={panneauRef}
          id="panneau-apparence"
          role="dialog"
          aria-label="Apparence du site"
          tabIndex={-1}
          className={`absolute z-40 velours p-4 text-left animate-fondu-monte max-h-[80vh] overflow-y-auto w-[min(20rem,calc(100vw-2.5rem))] outline-none ${
            flottant ? 'left-0 bottom-full mb-2' : 'right-0 top-full mt-2'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="sur-titre text-grenat-400">Apparence</p>
            <button
              type="button"
              onClick={fermer}
              className="text-encre-500 hover:text-encre-100 text-xs cursor-pointer"
              aria-label="Fermer le panneau Apparence"
            >
              ✕
            </button>
          </div>

          {/* Identité visuelle : palette puis typographie du site,
              appliquées à <html> — donc à toutes les pages d'un coup. */}
          <SelecteurPalette valeur={palette} onChoix={choisirPalette} />
          <SelecteurTypo valeur={typo} onChoix={choisirTypo} />

          <div className="flex items-center justify-between gap-3 mt-3">
            <p className="text-nano text-encre-500 leading-snug">
              Appliqué à tout le site. Vos choix restent sur cet appareil.
            </p>
            <button
              type="button"
              onClick={() => {
                reinitialiser();
                fermer();
              }}
              className="shrink-0 text-micro text-encre-500 hover:text-grenat-300 transition-colors cursor-pointer underline decoration-dotted"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
