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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 *  que les deux lignes concernées (l'ancienne et la nouvelle).
 *
 *  P1.3 : un chapitre en erreur est SIGNALÉ ici (badge « à reprendre »),
 *  pas seulement par un point de couleur. Le statut vient de la base et
 *  a été calculé par `chapitreEntierementTraduit()` (lib/types.ts, via
 *  lib/useMoteurTraduction.ts) : on n'invente aucune règle de
 *  complétude, on se contente d'afficher ce verdict.
 *  Cible tactile ≥ 44 px (C8) : `min-h-11`. */
const LigneChapitre = memo(function LigneChapitre({
  chapitre,
  actif,
  onChoisir,
}: {
  chapitre: ChapitreLeger;
  actif: boolean;
  onChoisir: (id: string) => void;
}) {
  const enErreur = chapitre.statut === 'erreur';
  const libelleStatut = ETIQUETTE_STATUT_CHAPITRE[chapitre.statut];
  return (
    <button
      type="button"
      onClick={() => onChoisir(chapitre.id)}
      aria-current={actif ? 'true' : undefined}
      className={`[content-visibility:auto] [contain-intrinsic-size:auto_2.6rem] w-full min-h-11 text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer border ${
        actif
          ? 'bg-nuit-700/60 border-grenat-700 text-encre-100'
          : 'border-transparent hover:bg-nuit-700/40 text-encre-300'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${POINT_STATUT[chapitre.statut]}`}
        aria-hidden
      />
      <span className="truncate text-sm flex-1">{chapitre.titre}</span>
      {/* Statut lisible par les lecteurs d'écran (le point seul ne
          portait l'information que par la couleur + `title`). */}
      <span className="sr-only">— {libelleStatut}</span>
      {enErreur && (
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
        >
          ⚠ à reprendre
        </span>
      )}
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

  // ---------------- Accessibilité du tiroir mobile (C8) ----------------
  // Sur petit écran, un tiroir ouvert est un VRAI dialogue modal :
  //  · `role="dialog"` + `aria-modal` quand il est ouvert ;
  //  · `aria-hidden` quand il est fermé (hors arbre d'accessibilité) ;
  //  · le focus ENTRE dans le tiroir à l'ouverture et REVIENT au
  //    déclencheur à la fermeture ;
  //  · `Échap` ferme, et `Tab` ne sort pas du panneau (piège de focus).
  // Sur grand écran, la colonne reste dans le flux : aucune de ces
  // règles ne s'applique (le panneau n'est jamais « modal »).
  const tiroirModal = !grandEcran && tiroirOuvert;
  const tiroirMasque = !grandEcran && !tiroirOuvert;

  const panneauRef = useRef<HTMLElement | null>(null);
  /** Élément qui avait le focus AVANT l'ouverture (le bouton « ☰ »). */
  const declencheurRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!tiroirModal) return;
    declencheurRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panneau = panneauRef.current;
    const cible =
      panneau?.querySelector<HTMLElement>('[data-focus-initial]') ?? panneau;
    cible?.focus();
    // Restitution du focus au déclencheur quand le tiroir se referme.
    return () => {
      declencheurRef.current?.focus?.();
    };
  }, [tiroirModal]);

  useEffect(() => {
    if (!tiroirModal) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onFermerTiroir();
        return;
      }
      if (e.key !== 'Tab') return;
      const panneau = panneauRef.current;
      if (!panneau) return;
      const focusables = panneau.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }
    document.addEventListener('keydown', surTouche, true);
    return () => document.removeEventListener('keydown', surTouche, true);
  }, [tiroirModal, onFermerTiroir]);

  // Choisir un chapitre ferme aussi le tiroir (sur grand écran, fermer
  // un tiroir déjà fermé ne provoque aucun rendu). Identité stable.
  const choisir = useCallback(
    (id: string) => {
      onSelection(id);
      onFermerTiroir();
    },
    [onSelection, onFermerTiroir]
  );

  // P1.3 : chapitres à reprendre, pour un compte visible en tête du
  // sommaire et un accès direct (« ouvrir le premier à reprendre »).
  const chapitresEnErreur = useMemo(
    () => chapitres.filter((c) => c.statut === 'erreur'),
    [chapitres]
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
        ref={panneauRef}
        tabIndex={-1}
        role={tiroirModal ? 'dialog' : undefined}
        aria-modal={tiroirModal ? true : undefined}
        aria-hidden={tiroirMasque ? true : undefined}
        aria-label={tiroirModal ? 'Sommaire des chapitres' : undefined}
        className={`fixed inset-y-0 left-0 z-50 w-[86vw] max-w-xs shrink-0 p-3 transition-transform duration-300 ease-out lg:static lg:inset-auto lg:z-auto lg:w-80 lg:max-w-none lg:p-0 focus:outline-none ${
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
            {/* Compte « à reprendre » annoncé aux lecteurs d'écran quand il
                change (C8 / P1.3) : le badge ci-dessous ne portait que
                l'information visuelle + son aria-label. */}
            <span className="sr-only" aria-live="polite">
              {chapitresEnErreur.length > 0
                ? `${chapitresEnErreur.length} chapitre${
                    chapitresEnErreur.length > 1 ? 's' : ''
                  } à reprendre.`
                : ''}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-encre-500">
                {chapitres.length}
              </span>
              {/* P1.3 : compte des chapitres à reprendre + accès direct
                  au premier (cible tactile ≥ 44 px, C8). */}
              {chapitresEnErreur.length > 0 && (
                <button
                  type="button"
                  onClick={() => choisir(chapitresEnErreur[0].id)}
                  aria-label={`${chapitresEnErreur.length} chapitre${
                    chapitresEnErreur.length > 1 ? 's' : ''
                  } à reprendre — ouvrir le premier`}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 min-h-11 text-[10px] font-semibold uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer"
                >
                  <span aria-hidden>⚠</span>
                  <span aria-hidden>{chapitresEnErreur.length}</span>
                </button>
              )}
              {/* Fermeture du tiroir — petit écran uniquement (le `lg:hidden`
                  doit vivre sur un élément neutre : `.bouton-fantome` est du
                  CSS hors couche, son `display` gagnerait). */}
              <span className="lg:hidden">
                <button
                  type="button"
                  data-focus-initial
                  onClick={onFermerTiroir}
                  aria-label="Fermer le sommaire"
                  className="bouton-fantome !px-2.5 !py-1 text-[11px]"
                >
                  ✕
                </button>
              </span>
            </span>
          </div>

          <nav
            aria-label="Chapitres du livre"
            className="space-y-1 overflow-y-auto pr-1 flex-1"
          >
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
                <p role="status" className="text-[11px] text-amber-300 mt-1.5">
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
