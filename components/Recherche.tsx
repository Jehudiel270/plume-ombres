// ============================================================
// Recherche.tsx — Barre de recherche plein texte du chapitre.
// Composant CONTRÔLÉ : l'état (terme, index actif) vit dans le
// lecteur (EspaceLivre), qui détient aussi le texte surligné.
// Ici : la saisie, le compteur, la navigation, la liste des
// résultats (contexte cliquable).
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Plaque } from '@/lib/recherche';

interface Props {
  /** Termes de la requête en cours (maîtrisé par le lecteur). */
  term: string;
  /** Texte du chapitre affiché (pour les extraits de contexte). */
  texte: string;
  /** Plaques [debut, fin) trouvées dans le texte affiché. */
  plaques: Plaque[];
  /** Index de la plaque active. */
  indexActif: number;
  /** Callbacks d'écriture (le lecteur réagit : défilement). */
  onTerm: (terme: string) => void;
  onIndexActif: (index: number) => void;
}

/** Contexte d'une plaque, la zone trouvée surlignée. */
function ContexteSurligne({
  texte,
  plaque,
}: {
  texte: string;
  plaque: Plaque;
}) {
  const marge = 70;
  const debut = Math.max(0, plaque.debut - marge);
  const fin = Math.min(texte.length, plaque.fin + marge);
  const milieu = texte.slice(debut, fin);
  const markDebut = plaque.debut - debut;
  const markFin = plaque.fin - debut;
  return (
    <>
      {debut > 0 ? '…' : ''}
      {milieu.slice(0, markDebut)}
      <mark className="bg-grenat-700/50 rounded-[3px] px-0.5 text-inherit">
        {milieu.slice(markDebut, markFin)}
      </mark>
      {milieu.slice(markFin)}
      {fin < texte.length ? '…' : ''}
    </>
  );
}

export default function Recherche({
  term,
  texte,
  plaques,
  indexActif,
  onTerm,
  onIndexActif,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);
  const boiteRef = useRef<HTMLDivElement>(null);

  // Ferme la liste au clic extérieur.
  useEffect(() => {
    function horsClic(e: MouseEvent) {
      if (boiteRef.current && !boiteRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener('mousedown', horsClic);
    return () => document.removeEventListener('mousedown', horsClic);
  }, []);

  function naviguer(delta: number) {
    if (plaques.length === 0) return;
    onIndexActif((indexActif + delta + plaques.length) % plaques.length);
  }

  return (
    <div ref={boiteRef} className="relative flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-encre-500 text-sm shrink-0" aria-hidden>
          &#128269;
        </span>
        <input
          ref={champRef}
          type="search"
          value={term}
          onChange={(e) => {
            onTerm(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          placeholder="Chercher dans ce chapitre…"
          className="flex-1 min-w-0 bg-nuit-800 border border-nuit-700 rounded-xl px-3 py-1.5 text-sm text-encre-100 placeholder:text-encre-600 focus:border-grenat-600 focus:outline-none"
          aria-label="Rechercher dans le chapitre"
        />
        <span
          className="shrink-0 text-[11px] text-encre-500 tabular-nums text-center"
          aria-live="polite"
        >
          {plaques.length > 0
            ? `${indexActif + 1}/${plaques.length}`
            : term.trim().length >= 2
              ? '0'
              : '\u00a0'}
        </span>
        <button
          type="button"
          onClick={() => naviguer(-1)}
          disabled={plaques.length === 0}
          className="bouton-fantome !px-2.5 !py-1.5 text-xs shrink-0"
          title="Occurrence précédente"
          aria-label="Occurrence précédente"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => naviguer(1)}
          disabled={plaques.length === 0}
          className="bouton-fantome !px-2.5 !py-1.5 text-xs shrink-0"
          title="Occurrence suivante"
          aria-label="Occurrence suivante"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            onTerm('');
            champRef.current?.blur();
          }}
          className="bouton-fantome !px-2.5 !py-1.5 text-[11px] shrink-0"
          title="Fermer la recherche"
          aria-label="Fermer la recherche"
        >
          ✕
        </button>
      </div>

      {ouvert && plaques.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 max-h-64 overflow-y-auto border border-nuit-700 rounded-xl bg-nuit-900/95 backdrop-blur-md shadow-2xl shadow-black/60">
          {plaques.map((p, i) => (
            <button
              key={`${p.debut}-${i}`}
              type="button"
              onClick={() => onIndexActif(i)}
              className={`block w-full text-left px-4 py-2.5 text-xs leading-relaxed border-b border-nuit-700/60 last:border-0 cursor-pointer transition-colors ${
                i === indexActif
                  ? 'bg-grenat-700/20 text-encre-100'
                  : 'text-encre-400 hover:bg-nuit-800/70'
              }`}
            >
              <ContexteSurligne texte={texte} plaque={p} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}