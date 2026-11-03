'use client';

// ============================================================
// components/admin/CommandPalette.tsx — Recherche-commande du tableau
// de bord (Ctrl+K / ⌘K).
//
// Problème résolu : avec six onglets et des milliers de comptes, il
// fallait cliquer, défiler, puis filtrer deux fois pour atteindre un
// compte précis. Ici : Ctrl+K, trois lettres du pseudo, Entrée.
//
// Aucune dépendance : un champ, une liste filtrée, trois touches.
// L'ouverture d'un onglet passe par l'événement `plume:onglet`, écouté
// par OngletsAdmin ; la recherche est déposée dans l'onglet cible via
// `plume:recherche` (écouté par TableauComptes et PaiementsFiltrables).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';

export interface EntreePalette {
  /** Identifiant interne (clé React). */
  id: string;
  /** Texte principal affiché. */
  libelle: string;
  /** Texte secondaire discret (rôle, montant, date…). */
  detail?: string;
  /** Onglet à ouvrir. */
  onglet: string;
  /** Texte à déposer dans la recherche de l'onglet cible. */
  recherche?: string;
  /** Groupe d'affichage. */
  groupe: 'Onglets' | 'Comptes' | 'Paiements';
}

/** Minuscules sans accents, pour une recherche tolérante. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CommandPalette({ entrees }: { entrees: readonly EntreePalette[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState('');
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  const resultats = useMemo(() => {
    const q = normaliser(requete.trim());
    const liste =
      q === ''
        ? entrees.filter((entree) => entree.groupe === 'Onglets')
        : entrees.filter(
            (entree) =>
              normaliser(entree.libelle).includes(q) ||
              normaliser(entree.detail ?? '').includes(q)
          );
    return liste.slice(0, 12);
  }, [entrees, requete]);

  // Raccourci global : Ctrl+K (Windows/Linux) ou ⌘K (macOS).
  // On garde un miroir de l'état d'ouverture dans une ref : l'écouteur
  // global n'a ainsi aucune dépendance et n'est posé qu'une fois.
  const ouvertRef = useRef(false);

  useEffect(() => {
    function ouvrir() {
      setRequete('');
      setActif(0);
      ouvertRef.current = true;
      setOuvert(true);
      // Le champ n'existe qu'après le rendu : on focalise juste après.
      setTimeout(() => champ.current?.focus(), 30);
    }
    function fermer() {
      ouvertRef.current = false;
      setOuvert(false);
    }
    function surTouche(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (ouvertRef.current) fermer();
        else ouvrir();
      } else if (e.key === 'Escape' && ouvertRef.current) {
        fermer();
      }
    }
    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
    };
  }, []);

  // Ouverture depuis le bouton : même remise à zéro, sans passer par un
  // effet (un setState dans un effet provoquerait un rendu en cascade).
  function ouvrirDepuisBouton() {
    setRequete('');
    setActif(0);
    ouvertRef.current = true;
    setOuvert(true);
    setTimeout(() => champ.current?.focus(), 30);
  }

  function fermerPalette() {
    ouvertRef.current = false;
    setOuvert(false);
  }

  function executer(entree: EntreePalette | undefined) {
    if (!entree) return;
    fermerPalette();
    window.dispatchEvent(new CustomEvent('plume:onglet', { detail: entree.onglet }));
    if (entree.recherche) {
      // Laisse le temps à l'onglet cible de se monter avant de lui
      // déposer la recherche.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('plume:recherche', { detail: { onglet: entree.onglet, texte: entree.recherche } })
        );
      }, 90);
    }
  }

  function surToucheChamp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActif((i) => Math.min(i + 1, resultats.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executer(resultats[actif]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fermerPalette();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={ouvrirDepuisBouton}
        className="bouton-fantome gap-2 text-xs"
        aria-keyshortcuts="Control+K"
      >
        <span aria-hidden="true">⌕</span>
        <span>Rechercher</span>
        <kbd className="ml-1 rounded border border-nuit-700 px-1.5 py-0.5 text-[10px] text-encre-500">
          Ctrl K
        </kbd>
      </button>

      {ouvert ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-nuit-950/75 px-3 pt-[10vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fermerPalette();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche rapide du tableau de bord"
            className="velours w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-nuit-700 px-4 py-3">
              <span aria-hidden="true" className="text-encre-500">
                ⌕
              </span>
              <input
                ref={champ}
                value={requete}
                onChange={(e) => {
                  setRequete(e.target.value);
                  setActif(0);
                }}
                onKeyDown={surToucheChamp}
                placeholder="Un compte, une référence de paiement, un onglet…"
                aria-label="Rechercher"
                role="combobox"
                aria-expanded={resultats.length > 0}
                aria-controls="liste-palette"
                aria-activedescendant={resultats[actif] ? `palette-${resultats[actif].id}` : undefined}
                className="w-full bg-transparent text-sm text-encre-100 outline-none placeholder:text-encre-500"
              />
              <kbd className="rounded border border-nuit-700 px-1.5 py-0.5 text-[10px] text-encre-500">
                Échap
              </kbd>
            </div>

            <ul id="liste-palette" role="listbox" aria-label="Résultats" className="max-h-[52vh] overflow-y-auto py-1">
              {resultats.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-encre-500">
                  Aucun résultat. Essayez un pseudo, une référence <span className="text-encre-300">PLU-…</span> ou le nom d’un onglet.
                </li>
              ) : (
                resultats.map((entree, index) => (
                  <li
                    key={`${entree.groupe}-${entree.id}`}
                    id={`palette-${entree.id}`}
                    role="option"
                    aria-selected={index === actif}
                    onMouseEnter={() => setActif(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      executer(entree);
                    }}
                    className={`mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                      index === actif ? 'bg-nuit-850 text-encre-100' : 'text-encre-300'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{entree.libelle}</span>
                      {entree.detail ? (
                        <span className="block truncate text-[11px] text-encre-500">{entree.detail}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-encre-500">
                      {entree.groupe}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
