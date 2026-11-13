'use client';

// ============================================================
// components/progression/ChoixFamilier.tsx — Choix du compagnon de
// lecture (A17). Préférence d'AFFICHAGE locale (localStorage) :
// purement cosmétique, rien ne quitte le compte.
//
// Lecture par useSyncExternalStore (pattern du dépôt, comme la
// voix préférée) : pas de setState dans un effet, pas d'écart
// d'hydratation (le rendu serveur voit `null`), synchronisation
// immédiate après le clic.
// ============================================================

import { useSyncExternalStore } from 'react';

import type { Familier } from '@/lib/plume';

const CLE = 'plume:familier';

// Mini-magasin localStorage : abonnés notifiés à la même fenêtre
// (onglet) et aux événements `storage` des autres onglets.
const ecouteurs = new Set<() => void>();

function souscrire(retour: () => void): () => void {
  ecouteurs.add(retour);
  window.addEventListener('storage', retour);
  return () => {
    ecouteurs.delete(retour);
    window.removeEventListener('storage', retour);
  };
}

function lire(): string | null {
  try {
    return window.localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export default function ChoixFamilier({
  familiers,
  debloques,
}: {
  familiers: readonly Familier[];
  debloques: readonly string[];
}) {
  const choisi = useSyncExternalStore(souscrire, lire, () => null);

  const choisir = (code: string) => {
    try {
      window.localStorage.setItem(CLE, code);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    for (const e of ecouteurs) e();
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {familiers.map((f) => {
        const ouvert = debloques.includes(f.code);
        const estChoisi = choisi === f.code;
        return (
          <li
            key={f.code}
            className={`p-4 rounded-2xl border ${
              estChoisi
                ? 'border-grenat-600 velours'
                : ouvert
                  ? 'border-nuit-700'
                  : 'border-nuit-800 opacity-50'
            }`}
          >
            <p className="text-sm text-encre-100">
              {f.nom}{' '}
              <span className="text-xs text-encre-500">
                {ouvert
                  ? estChoisi
                    ? '· à vos côtés'
                    : '· débloqué'
                  : `· rang ${f.rangRequis}`}
              </span>
            </p>
            <p className="mt-1 text-xs text-encre-500 italic">{f.legende}</p>
            {ouvert && (
              <button
                type="button"
                onClick={() => choisir(f.code)}
                className={`mt-2 min-h-8 rounded-lg px-2 text-xs cursor-pointer ${
                  estChoisi ? 'bouton-fantome' : 'text-grenat-300 hover:bg-white/[0.06]'
                }`}
              >
                {estChoisi ? 'Laisser ici' : 'Prendre à vos côtés'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
