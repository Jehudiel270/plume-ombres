'use client';

// ============================================================
// components/admin/Pagination.tsx — Pagination accessible et
// responsive d'une liste (tableau des comptes).
//
// Aucun numéro de page « collant » : chaque bouton fait au moins
// 44 px (garanti par .bouton-fantome) et porte un libellé explicite
// pour les lecteurs d'écran. Le sélecteur de taille utilise
// .select-sombre (même garantie de hauteur).
// ============================================================

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  nbPages: number;
  total: number;
  /** Index (0-based) du premier élément affiché. */
  debut: number;
  /** Nombre d'éléments réellement affichés. */
  affiches: number;
  taillePage: number;
  onPage: (page: number) => void;
  onTaillePage: (taille: number) => void;
  taillesPage: readonly number[];
}

/** Fenêtre glissante de numéros (au plus 5). */
function numeros(page: number, nbPages: number): number[] {
  const largeur = 5;
  let debut = Math.max(1, page - Math.floor(largeur / 2));
  const fin = Math.min(nbPages, debut + largeur - 1);
  debut = Math.max(1, fin - largeur + 1);
  const sortie: number[] = [];
  for (let i = debut; i <= fin; i += 1) sortie.push(i);
  return sortie;
}

export default function Pagination({
  page,
  nbPages,
  total,
  debut,
  affiches,
  taillePage,
  onPage,
  onTaillePage,
  taillesPage,
}: Props) {
  if (total === 0) return null;

  const premier = total === 0 ? 0 : debut + 1;
  const dernier = debut + affiches;

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-encre-500 text-xs" aria-live="polite">
        {premier}–{dernier} sur {total} compte{total > 1 ? 's' : ''}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-encre-500 text-xs">
          <span className="whitespace-nowrap">Par page</span>
          <select
            className="select-sombre"
            value={taillePage}
            onChange={(e) => onTaillePage(Number(e.target.value))}
            aria-label="Nombre de comptes par page"
          >
            {taillesPage.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {nbPages > 1 && (
          <nav aria-label="Pagination des comptes" className="flex items-center gap-1.5">
            <button
              type="button"
              className="bouton-fantome !px-3 min-w-[44px]"
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Précédent</span>
            </button>

            {numeros(page, nbPages).map((n) => (
              <button
                key={n}
                type="button"
                className={
                  n === page
                    ? 'bouton-principal !px-3 min-w-[44px]'
                    : 'bouton-fantome !px-3 min-w-[44px]'
                }
                onClick={() => onPage(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
              >
                {n}
              </button>
            ))}

            <button
              type="button"
              className="bouton-fantome !px-3 min-w-[44px]"
              onClick={() => onPage(page + 1)}
              disabled={page >= nbPages}
              aria-label="Page suivante"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
