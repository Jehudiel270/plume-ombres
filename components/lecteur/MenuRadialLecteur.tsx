'use client';

// ============================================================
// components/lecteur/MenuRadialLecteur.tsx — Bouton unique en bas à
// droite qui RÉVÈLE les outils du lecteur en arc de cercle.
//
// Remplace la barre d'outils horizontale (trop encombrante) :
//   * un seul bouton rond (la plume), fixe en bas à droite,
//     atteignable au pouce pendant tout le défilement ;
//   * au toucher, les outils BLOOMENT en quart de disque — trois
//     arcs concentriques (r = 96 / 160 / 224 px, angles 90°, 135°,
//     180°), chaque outil = pastille ronde de 44 px + libellé ;
//   * fermeture : toucher ailleurs, ou Échap, ou re-toucherc le
//     bouton (le fond invisble couvre l'écran) ;
//   * outils montés seulement si le module est ouvert (serveur) ;
//   * portail sur le corps du document (même raison que la feuille).
// ============================================================

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { createPortal } from 'react-dom';
import { Feather, X } from 'lucide-react';

export interface OutilLecteur {
  cle: string;
  libelle: string;
  icone: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** État enfoncé (bilingue actif, lecture en cours…). */
  actif?: boolean;
  onPress: () => void;
}

const nePasSouscrire = () => () => {};

/** Arcs concentriques (px depuis le centre du bouton) et angles (degrés
 *  depuis l'horizontale : 90 = droit au-dessus, 180 = gauche). */
const ARCS = [96, 160, 224] as const;
const ANGLES = [90, 135, 180] as const;

/** Position (dx, dy) du n-ième outil RELATIVEMENT au centre du
 *  bouton, en remplissant l'arc intérieur d'abord (dx négatif = à
 *  gauche, dy positif = au-dessus). */
function positionOutil(n: number): { dx: number; dy: number } {
  const r = ARCS[Math.floor(n / 3)] ?? ARCS[2];
  const angle = (ANGLES[n % 3] ?? 90) * (Math.PI / 180);
  return { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r) };
}

export default function MenuRadialLecteur({ outils }: { outils: OutilLecteur[] }) {
  const monte = useSyncExternalStore(
    nePasSouscrire,
    () => true,
    () => false
  );
  const [ouvert, setOuvert] = useState(false);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const premierItemRef = useRef<HTMLButtonElement>(null);

  // Échap ferme et rend le focus au bouton ; à l'ouverture, le focus
  // va au premier outil (navigation clavier cohérente).
  useEffect(() => {
    if (!ouvert) return;
    premierItemRef.current?.focus();
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false);
        boutonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  if (!monte || outils.length === 0) return null;

  const fermer = () => setOuvert(false);

  return createPortal(
    <>
      {ouvert && (
        <div
          className="fixed inset-0 z-40"
          onClick={fermer}
          aria-hidden="true"
        />
      )}

      {/* Les outils, en quart de disque autour du bouton. */}
      {ouvert && (
        <div
          role="menu"
          aria-label="Outils de lecture"
          className="fixed inset-0 z-50 pointer-events-none"
        >
          {outils.map((o, i) => {
            const Icone = o.icone;
            const { dx, dy } = positionOutil(i);
            return (
              <div
                key={o.cle}
                role="none"
                className="pointer-events-auto absolute animate-pousse-radial"
                style={{
                  // Centre du bouton : 1rem (right-4) + 1.75rem (rayon)
                  // du bord droit ; 4.25rem + 1.75rem du bas (plus la
                  // safe-area iOS). Puis déplacement radial (dx, dy).
                  right: `calc(2.75rem - ${dx}px)`,
                  bottom: `calc(6rem + env(safe-area-inset-bottom) + ${dy}px)`,
                  animationDelay: `${i * 24}ms`,
                }}
              >
                <button
                  ref={i === 0 ? premierItemRef : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    o.onPress();
                    fermer();
                  }}
                  aria-label={`${o.libelle}${o.actif ? ' — actif' : ''}`}
                  className={`outil-radial grid h-11 w-11 cursor-pointer place-items-center rounded-full border shadow-xl backdrop-blur transition-colors ${
                    o.actif
                      ? 'border-grenat-500 bg-grenat-900/80 text-grenat-200'
                      : 'border-nuit-600 bg-nuit-900/95 text-encre-200 hover:border-nuit-500'
                  }`}
                >
                  <Icone size={18} aria-hidden />
                </button>
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-nuit-700 bg-nuit-950/90 px-1.5 py-0.5 text-[10px] leading-none text-encre-400">
                  {o.libelle}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Le bouton unique, bas à droite. Sous la feuille (z-40) :
          une feuille ouverte le recouvre, comme l'ancienne barre. */}
      <button
        ref={boutonRef}
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        aria-label={ouvert ? 'Fermer les outils de lecture' : 'Ouvrir les outils de lecture'}
        className="fixed right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 grid h-14 w-14 cursor-pointer place-items-center rounded-full border border-grenat-700/80 bg-gradient-to-b from-grenat-800 to-nuit-900 text-encre-100 shadow-2xl shadow-black/50 backdrop-blur transition-transform active:scale-95"
      >
        {ouvert ? <X size={22} aria-hidden /> : <Feather size={22} aria-hidden />}
      </button>
    </>,
    document.body
  );
}
