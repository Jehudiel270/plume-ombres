'use client';

// ============================================================
// Sommaire.tsx — Liste des chapitres (statut, sélection) et
// progression globale du livre.
//
// Mémoïsé : ne se re-rend que si `chapitres`, `selection`,
// `compteurs` ou l'état du tiroir changent — un changement de
// recherche, de réglage de lecture ou d'export ne le réveille plus.
//
// Mobile (C3) : la colonne devient un TIROIR (slide-over) fermé par
// défaut : le texte de lecture reste en premier à l'écran, la liste
// ne s'ouvre que sur demande (bouton « Chapitres » de la barre du bas).
// Chaque ligne est mémoïsée et porte `content-visibility: auto` :
// sur un livre à plusieurs centaines de chapitres, seules les lignes
// visibles sont mises en page.
// ============================================================

import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ETIQUETTE_STATUT_CHAPITRE,
  POINT_STATUT,
  type ChapitreLeger,
  type Compteurs,
} from './partages';

interface Props {
  chapitres: ChapitreLeger[];
  selection: string | null;
  /** Change le chapitre affiché (stable : `setSelection`). */
  onSelection: (id: string) => void;
  compteurs: Compteurs | null;
  /** Tiroir ouvert (mobile ; sans effet sur grand écran). */
  tiroirOuvert: boolean;
  /** Referme le tiroir (stable). */
  onFermerTiroir: () => void;
}

/** Une ligne de chapitre — mémoïsée : changer de chapitre ne re-rend
 *  que les deux lignes concernées (l'ancienne et la nouvelle). */
const LigneChapitre = memo(function LigneChapitre({
  chapitre,
  actif,
  onChoisir,
}: {
  chapitre: ChapitreLeger;
  actif: boolean;
  onChoisir: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoisir(chapitre.id)}
      className={`[content-visibility:auto] [contain-intrinsic-size:auto_2.6rem] w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer border ${
        actif
          ? 'bg-nuit-700/60 border-grenat-700 text-encre-100'
          : 'border-transparent hover:bg-nuit-700/40 text-encre-300'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${POINT_STATUT[chapitre.statut]}`}
        title={ETIQUETTE_STATUT_CHAPITRE[chapitre.statut]}
      />
      <span className="truncate text-sm">{chapitre.titre}</span>
    </button>
  );
});

function Sommaire({
  chapitres,
  selection,
  onSelection,
  compteurs,
  tiroirOuvert,
  onFermerTiroir,
}: Props) {
  const pourcentage =
    compteurs && compteurs.total > 0
      ? Math.round((compteurs.faits / compteurs.total) * 100)
      : 0;

  // Grand écran (≥ 1024 px) : la colonne reste DANS le flux, à sa place.
  // Petit écran : le tiroir est rendu dans <body> (portail). Un `position:
  // fixed` posé sous un ancêtre transformé (c'est le cas de `main`, dont
  // l'animation d'entrée laisse un `transform: translateY(0)`) prend cet
  // ancêtre comme bloc conteneur : le tiroir s'étirerait sur la hauteur du
  // contenu au lieu de la fenêtre. Valeur initiale = grand écran : le rendu
  // serveur et le premier rendu client sont identiques (le tiroir est fermé,
  // donc invisible, au moment du basculement).
  const [grandEcran, setGrandEcran] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const maj = () => setGrandEcran(media.matches);
    maj();
    media.addEventListener('change', maj);
    return () => media.removeEventListener('change', maj);
  }, []);

  // Choisir un chapitre ferme aussi le tiroir (sur grand écran, fermer
  // un tiroir déjà fermé ne provoque aucun rendu). Identité stable.
  const choisir = useCallback(
    (id: string) => {
      onSelection(id);
      onFermerTiroir();
    },
    [onSelection, onFermerTiroir]
  );

  const voileEtTiroir = (
    <>
      {/* Voile de fermeture (mobile) */}
      {tiroirOuvert && (
        <button
          type="button"
          aria-label="Fermer le sommaire"
          onClick={onFermerTiroir}
          className="lg:hidden fixed inset-0 z-40 cursor-default bg-black/60 backdrop-blur-[2px]"
        />
      )}

      <aside
        id="sommaire-chapitres"
        className={`fixed inset-y-0 left-0 z-50 w-[86vw] max-w-xs shrink-0 p-3 transition-transform duration-300 ease-out lg:static lg:inset-auto lg:z-auto lg:w-80 lg:max-w-none lg:p-0 ${
          tiroirOuvert
            ? 'translate-x-0 visible pointer-events-auto'
            : '-translate-x-full invisible pointer-events-none lg:visible lg:translate-x-0 lg:pointer-events-auto'
        }`}
      >
        <div className="velours p-4 flex flex-col h-full max-h-none lg:max-h-[75vh] lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs uppercase tracking-[0.25em] text-encre-500">
              Chapitres
            </h2>
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-encre-500">
                {chapitres.length}
              </span>
              {/* Fermeture du tiroir — petit écran uniquement (le `lg:hidden`
                  doit vivre sur un élément neutre : `.bouton-fantome` est du
                  CSS hors couche, son `display` gagnerait). */}
              <span className="lg:hidden">
                <button
                  type="button"
                  onClick={onFermerTiroir}
                  aria-label="Fermer le sommaire"
                  className="bouton-fantome !px-2.5 !py-1 text-[11px]"
                >
                  ✕
                </button>
              </span>
            </span>
          </div>

          <nav className="space-y-1 overflow-y-auto pr-1 flex-1">
            {chapitres.map((chapitre) => (
              <LigneChapitre
                key={chapitre.id}
                chapitre={chapitre}
                actif={selection === chapitre.id}
                onChoisir={choisir}
              />
            ))}
          </nav>

          {/* Progression globale */}
          {compteurs && compteurs.total > 0 && (
            <div className="mt-4 pt-4 border-t border-nuit-700/60 px-1">
              <div className="flex justify-between text-[11px] text-encre-500 mb-1.5">
                <span>
                  {compteurs.faits} / {compteurs.total} segments
                </span>
                <span>{pourcentage} %</span>
              </div>
              <div className="h-1.5 rounded-full bg-nuit-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-grenat-500 to-violet-rom-500 transition-all duration-500"
                  style={{ width: `${pourcentage}%` }}
                />
              </div>
              {compteurs.erreurs > 0 && (
                <p className="text-[11px] text-amber-300 mt-1.5">
                  ⚠ {compteurs.erreurs} segment(s) en erreur — relance une
                  traduction pour réessayer.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );

  return grandEcran
    ? voileEtTiroir
    : createPortal(voileEtTiroir, document.body);
}

export default memo(Sommaire);
