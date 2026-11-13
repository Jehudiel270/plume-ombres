'use client';

// ============================================================
// components/lecteur/BarreOutilsLecteur.tsx — Barre d'outils fixe
// du bas du lecteur, portage direct de la maquette
// (pages/lire/[id]/[n].vue, barre rd-tool) :
//   * chaque outil = icône + libellé, cible tactile de 44 px ;
//   * FIXE en bas de l'écran : « Écouter », « Carnet », « Chercher »
//     restent atteignables pendant le défilement — plus besoin de
//     remonter en haut du chapitre pour arrêter une lecture ;
//   * défilement horizontal quand les outils débordent (petit
//     écran), comme la maquette (`scroll-x`) ;
//   * outils montés seulement si le module est ouvert (serveur).
//
// Rendu par PORTAIL sur le corps du document (les filtres du lecteur
// feraient d'un fixed interne un ancrage sur le chapitre). Sur
// mobile, la barre se place AU-DESSUS de la navigation de chapitre.
// ============================================================

import { useSyncExternalStore, type ComponentType } from 'react';
import { createPortal } from 'react-dom';

export interface OutilLecteur {
  cle: string;
  libelle: string;
  icone: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** État enfoncé (bilingue actif, lecture en cours…). */
  actif?: boolean;
  onPress: () => void;
}

const nePasSouscrire = () => () => {};

export default function BarreOutilsLecteur({ outils }: { outils: OutilLecteur[] }) {
  // Monté ? (rendu serveur : non — le portail n'existe qu'au navigateur,
  // pattern useSyncExternalStore comme useVoix, sans setState d'effet.)
  const monte = useSyncExternalStore(
    nePasSouscrire,
    () => true,
    () => false
  );

  if (!monte || outils.length === 0) return null;

  return createPortal(
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-nuit-700/60 bg-nuit-950/90 backdrop-blur-md lg:bottom-0">
      <div className="outil-scroll mx-auto flex max-w-4xl items-stretch justify-start gap-1 overflow-x-auto px-2 py-1.5 sm:justify-center sm:px-5">
        {outils.map((o) => {
          const Icone = o.icone;
          return (
            <button
              key={o.cle}
              type="button"
              onClick={o.onPress}
              aria-pressed={o.actif === true}
              className={`outil-lecteur ${o.actif ? 'outil-lecteur-actif' : ''}`}
            >
              <Icone size={18} aria-hidden />
              <span>{o.libelle}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
