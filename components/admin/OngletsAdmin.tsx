'use client';

// ============================================================
// components/admin/OngletsAdmin.tsx — Barre d'onglets accessible du
// tableau de bord administrateur.
//
// MOTIF ARIA « tabs » (WAI-ARIA Authoring Practices) :
//   role="tablist" / role="tab" / role="tabpanel",
//   aria-selected, aria-controls ↔ aria-labelledby reliés par des id,
//   navigation clavier Flèche gauche/droite (+ Origine/Fin) et
//   tabindex flottant (seul l'onglet actif vaut tabIndex=0).
//
// UN SEUL PANNEAU EST MONTÉ À LA FOIS (rendu conditionnel, jamais de
// `hidden` ni de `display:none`) : c'est ce qui raccourcit réellement
// la page et évite de mesurer du contenu invisible.
//
// LIENS PROFONDS : l'onglet ouvert est reflété dans l'URL
// (/admin?onglet=cles) et l'URL est lue au montage — un lien reçu du
// bandeau de santé, de la palette ou d'un autre écran ouvre le bon
// onglet directement.
//
// Composant CLIENT sans état serveur : le composant serveur appelant
// (app/admin/page.tsx) reste le propriétaire des données et lui passe,
// pour chaque onglet, le JSX déjà rendu (éléments React en props).
// ============================================================

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface PastilleOnglet {
  /** Nombre affiché dans la pastille. */
  nombre: number;
  /** Unité lue par les lecteurs d'écran (ex. « comptes », « anomalies »). */
  libelle: string;
  /** Teinte d'alerte (grenat) au lieu de la teinte neutre. */
  alerte?: boolean;
}

export interface OngletAdmin {
  /** Slug stable : porte les id ARIA et sert de repère aux sondes. */
  id: string;
  /** Libellé visible de l'onglet. */
  libelle: string;
  /** Compteur discret (facultatif) : pastille à droite du libellé. */
  pastille?: PastilleOnglet;
  /** Contenu du panneau (JSX du composant serveur). */
  contenu: ReactNode;
}

interface Props {
  onglets: readonly OngletAdmin[];
  /** Nom accessible de la barre d'onglets. */
  libelleBarre?: string;
}

export default function OngletsAdmin({
  onglets,
  libelleBarre = 'Sections du tableau de bord',
}: Props) {
  const suffixe = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [actif, setActif] = useState(0);
  const boutons = useRef<Array<HTMLButtonElement | null>>([]);
  // Devient vrai après la lecture du lien profond (montage client).
  const initialise = useRef(false);

  const idOnglet = (o: OngletAdmin) => `onglet-${o.id}-${suffixe}`;
  const idPanneau = (o: OngletAdmin) => `panneau-${o.id}-${suffixe}`;

  /** Active un onglet (index borné) et y déplace le focus. */
  function aller(index: number) {
    const n = onglets.length;
    if (n === 0) return;
    const cible = ((index % n) + n) % n;
    setActif(cible);
    boutons.current[cible]?.focus();
  }

  function surTouche(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      aller(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      aller(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      aller(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      aller(onglets.length - 1);
    }
  }

  // Ouverture d'un onglet depuis l'extérieur (palette Ctrl+K, voyants
  // d'exploitation du bandeau de santé) : ces composants n'ont pas accès
  // à l'état interne de la barre, ils publient donc l'identifiant de
  // l'onglet et la barre s'en charge.
  useEffect(() => {
    function surDemande(evenement: Event) {
      const slug = String((evenement as CustomEvent<string>).detail ?? '');
      const index = onglets.findIndex((onglet) => onglet.id === slug);
      if (index < 0) return;
      setActif(index);
      const bouton = boutons.current[index];
      bouton?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      bouton?.focus({ preventScroll: true });
    }
    window.addEventListener('plume:onglet', surDemande);
    return () => window.removeEventListener('plume:onglet', surDemande);
  }, [onglets]);

  // Lien profond ENTRANT : /admin?onglet=cles ouvre l'onglet « Clés ».
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('onglet');
    if (slug) {
      const index = onglets.findIndex((onglet) => onglet.id === slug);
      if (index >= 0) setActif(index);
    }
    initialise.current = true;
  }, [onglets]);

  // Lien profond SORTANT : l'onglet actif est reflété dans l'URL
  // (replaceState : pas d'entrée d'historique par clic d'onglet).
  useEffect(() => {
    if (!initialise.current) return;
    const slug = onglets[actif]?.id;
    if (!slug) return;
    const url = new URL(window.location.href);
    url.searchParams.set('onglet', slug);
    window.history.replaceState(null, '', url.toString());
  }, [actif, onglets]);

  if (onglets.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-[12px] border border-nuit-700/70 bg-nuit-800/50 p-1.5 sm:p-2">
        {/* Retour à la ligne à TOUTE largeur (jamais de défilement
            horizontal) : sur 360 px les 5 onglets passent sur 3 lignes et
            la page s'allonge en hauteur. Aucun libellé n'est tronqué et
            aucun élément ne peut sortir du cadre. */}
        <div
          role="tablist"
          aria-label={libelleBarre}
          aria-orientation="horizontal"
          className="flex flex-wrap items-center gap-1.5 sm:gap-2"
        >
          {onglets.map((o, i) => {
            const selectionne = i === actif;
            return (
              <button
                key={o.id}
                ref={(el) => {
                  boutons.current[i] = el;
                }}
                type="button"
                role="tab"
                id={idOnglet(o)}
                aria-selected={selectionne}
                aria-controls={idPanneau(o)}
                tabIndex={selectionne ? 0 : -1}
                onClick={() => setActif(i)}
                onKeyDown={(e) => surTouche(e, i)}
                className={`${selectionne ? 'bouton-principal' : 'bouton-fantome'} min-w-[44px] shrink-0 whitespace-nowrap !px-3 sm:!px-4`}
              >
                <span>{o.libelle}</span>
                {o.pastille && (
                  <>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums ${
                        o.pastille.alerte
                          ? 'border-grenat-500/50 bg-grenat-500/25 text-grenat-300'
                          : 'border-nuit-700 bg-nuit-850 text-encre-300'
                      }`}
                    >
                      {o.pastille.nombre}
                    </span>
                    <span className="inline-block h-px w-px overflow-hidden whitespace-nowrap">
                      {' '}
                      — {o.pastille.nombre} {o.pastille.libelle}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {onglets.map((o, i) =>
        i === actif ? (
          <div
            key={o.id}
            role="tabpanel"
            id={idPanneau(o)}
            aria-labelledby={idOnglet(o)}
            tabIndex={0}
            data-reveler="haut"
            className="rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-grenat-400 focus-visible:outline-offset-2"
          >
            <h2 className="sr-only">{o.libelle}</h2>
            <div className="space-y-6">{o.contenu}</div>
          </div>
        ) : null
      )}
    </div>
  );
}
