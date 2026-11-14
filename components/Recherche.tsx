// ============================================================
// Recherche.tsx — Barre de recherche plein texte du chapitre.
// Composant CONTRÔLÉ : l'état (terme, index actif) vit dans le
// lecteur (EspaceLivre), qui détient aussi le texte surligné.
// Ici : la saisie, le compteur, la navigation, la liste des
// résultats (contexte cliquable).
// ============================================================
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { chercherTermes, type Plaque, type ResultatRechercheLivre } from '@/lib/recherche';

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
  /**
   * Résultats de la recherche PLEIN LIVRE (`chercherDansLivre`).
   * Facultatif et rétrocompatible : si fourni et non vide, la liste
   * déroulante affiche les résultats groupés PAR CHAPITRE (au lieu
   * des seules occurrences du chapitre courant).
   */
  resultatsLivre?: ResultatRechercheLivre | null;
  /** Saut vers un chapitre (position) — appelé au clic sur un extrait. */
  onAllerChapitre?: (position: number) => void;
}

/** Surligne le terme recherché dans un extrait (réutilise le moteur). */
function ExtraitSurligne({ contexte, terme }: { contexte: string; terme: string }) {
  const plaques = terme.trim().length >= 2 ? chercherTermes(contexte, terme) : [];
  if (plaques.length === 0) return <>{contexte}</>;
  const morceaux: ReactNode[] = [];
  let curseur = 0;
  plaques.forEach((p, i) => {
    if (p.debut > curseur) morceaux.push(contexte.slice(curseur, p.debut));
    morceaux.push(
      <mark key={i} className="bg-grenat-700/50 rounded-[3px] px-0.5 text-inherit">
        {contexte.slice(p.debut, p.fin)}
      </mark>
    );
    curseur = p.fin;
  });
  if (curseur < contexte.length) morceaux.push(contexte.slice(curseur));
  return <>{morceaux}</>;
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
  resultatsLivre,
  onAllerChapitre,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);
  const boiteRef = useRef<HTMLDivElement>(null);

  // Mode « plein livre » : résultats groupés par chapitre.
  const modeLivre =
    !!resultatsLivre &&
    resultatsLivre.terme.trim().length >= 2 &&
    resultatsLivre.totalOccurrences > 0;

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
          id="champ-recherche-chapitre"
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
          {modeLivre
            ? resultatsLivre?.totalOccurrences
            : plaques.length > 0
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
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => naviguer(1)}
          disabled={plaques.length === 0}
          className="bouton-fantome !px-2.5 !py-1.5 text-xs shrink-0"
          title="Occurrence suivante"
          aria-label="Occurrence suivante"
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
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
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {ouvert && modeLivre && resultatsLivre && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 max-h-64 overflow-y-auto border border-nuit-700 rounded-xl bg-nuit-900/95 backdrop-blur-md shadow-2xl shadow-black/60">
          {resultatsLivre.chapitres.map((ch) => (
            <div
              key={ch.chapitreId}
              className="border-b border-nuit-700/60 last:border-0"
            >
              <div className="flex items-baseline justify-between gap-2 px-4 pt-2.5 pb-1">
                <a
                  href={`#${ch.ancre}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onAllerChapitre?.(ch.position);
                    setOuvert(false);
                  }}
                  className="truncate text-[11px] font-semibold uppercase tracking-wide text-grenat-300 hover:text-grenat-200"
                  title={`Aller au chapitre : ${ch.titre}`}
                >
                  {ch.titre}
                </a>
                <span className="shrink-0 text-[10px] text-encre-500 tabular-nums">
                  {ch.nbOccurrences}
                </span>
              </div>
              {ch.extraits.map((ex, i) => (
                <button
                  key={`${ex.plaque.debut}-${i}`}
                  type="button"
                  onClick={() => {
                    onAllerChapitre?.(ch.position);
                    setOuvert(false);
                  }}
                  className="block w-full cursor-pointer px-4 py-2 text-left text-xs leading-relaxed text-encre-400 transition-colors hover:bg-nuit-800/70"
                  title={`Chapitre ${ch.position + 1}`}
                >
                  <ExtraitSurligne
                    contexte={ex.contexte}
                    terme={resultatsLivre.terme}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {ouvert && !modeLivre && plaques.length > 0 && (
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