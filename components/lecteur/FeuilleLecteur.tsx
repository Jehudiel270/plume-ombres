'use client';

// ============================================================
// components/lecteur/FeuilleLecteur.tsx — Feuille du lecteur.
//
// Portage direct de la maquette (components/reader/ReaderSheet.vue) :
//   * sur mobile : feuille du BAS, pleine largeur, arrondie en haut ;
//   * sur grand écran : carte ancrée en bas à droite (400 px) ;
//   * fond assombri cliquable pour fermer, Échap, focus initial ;
//   * non modale (aria-modal="false") : le texte reste lisible
//     derrière, la lecture vocale ne s'interrompt pas.
//
// Rendu par PORTAIL sur le corps du document : le lecteur porte des
// filtres d'arrière-plan qui feraient d'un `position: fixed` interne
// un ancrage sur le chapitre (et non sur l'écran).
// ============================================================

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  ouvert: boolean;
  titre: string;
  surtitre?: string;
  surFermer: () => void;
  children: ReactNode;
}

const nePasSouscrire = () => () => {};

export default function FeuilleLecteur({
  ouvert,
  titre,
  surtitre,
  surFermer,
  children,
}: Props) {
  // Le portail n'existe qu'au navigateur (rendu serveur : rien), sans
  // setState d'effet (pattern useSyncExternalStore).
  const monte = useSyncExternalStore(
    nePasSouscrire,
    () => true,
    () => false
  );

  const boiteRef = useRef<HTMLElement>(null);

  // Échap ferme ; l'ouverture pose le focus sur la feuille.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') surFermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert, surFermer]);

  useEffect(() => {
    if (ouvert) boiteRef.current?.focus();
  }, [ouvert]);

  if (!monte || !ouvert) return null;

  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="false" aria-label={titre}>
      <div className="absolute inset-0 bg-black/50" onClick={surFermer} aria-hidden="true" />
      <section
        ref={boiteRef}
        tabIndex={-1}
        className="velours absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-2xl outline-none animate-feuille-monte sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-h-[calc(100vh-2rem)] sm:w-[400px] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-nuit-700/70 px-5 py-4">
          <div className="min-w-0">
            {surtitre && (
              <p className="sur-titre text-encre-500 mb-1 truncate">{surtitre}</p>
            )}
            <h2 className="font-display text-2xl leading-tight text-encre-100">{titre}</h2>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-encre-500 hover:bg-white/[0.06] hover:text-encre-100 cursor-pointer"
            aria-label="Fermer le panneau"
            onClick={surFermer}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </section>
    </div>,
    document.body
  );
}
