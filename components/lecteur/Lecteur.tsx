'use client';

// ============================================================
// Lecteur.tsx — Surface de lecture : en-tête du chapitre,
// barre d'outils (recherche plein texte + réglages de confort)
// et corps du texte (surlignage des occurrences).
//
// L'état de recherche (terme, occurrence active, plaques) vit ICI :
// taper dans la recherche ne re-rend plus l'espace de travail
// entier, seulement le lecteur. Mémoïsé sur ses entrées.
// ============================================================

import {
  memo,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Chapitre } from '@/lib/types';
import { chercherTermes } from '@/lib/recherche';
import Recherche from '@/components/Recherche';
import RegleLecture from '@/components/RegleLecture';

const ID_LECTEUR = 'lecteur-chapitre';

interface Props {
  /** Chapitre complet chargé (null tant qu'aucun n'est ouvert). */
  chapitreComplet: Chapitre | null;
  /** Sélection en cours de chargement (état dérivé, côté parent). */
  chargementChapitre: boolean;
  /** Texte du chapitre affiché, rogné (`texteAffiche.trim()`). */
  texteNet: string;
  /** Élément mesuré par le parent pour le ratio de lecture (défilement). */
  corpsRef: RefObject<HTMLDivElement | null>;
}

function Lecteur({ chapitreComplet, chargementChapitre, texteNet, corpsRef }: Props) {
  // ---------- Recherche plein texte (chapitre affiché) ----------
  const [term, setTerm] = useState('');
  const [indexActif, setIndexActif] = useState(0);
  const plaques = useMemo(
    () =>
      term.trim().length >= 2 && texteNet.length > 0
        ? chercherTermes(texteNet, term)
        : [],
    [texteNet, term]
  );
  // Clé de la source (chapitre + langue affichée) : le retour à zéro est
  // détecté au RENDU par comparaison avec la clé précédente (état
  // « à réinitialiser »), pattern toléré par les règles React Compiler —
  // aucun setState synchrone dans un effet.
  const cleRecherche = `${texteNet.length}:${term}`;
  const [clePrec, setClePrec] = useState(cleRecherche);
  const [reinit, setReinit] = useState(false);
  if (reinit) {
    setIndexActif(0);
    setReinit(false);
  } else if (cleRecherche !== clePrec) {
    setClePrec(cleRecherche);
    setReinit(true);
  }
  // Garde-fou défensif : si les plaques ont rétréci, on borne l'index.
  const indexAffiche =
    plaques.length > 0 ? Math.min(indexActif, plaques.length - 1) : 0;
  // La plaque active est ramenée à l'écran (marque spéciale montée
  // dans le corps du chapitre).
  useEffect(() => {
    if (plaques.length === 0) return;
    const marque = document.querySelector('[data-ligne-recherche-active]');
    marque?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [indexAffiche, plaques.length]);

  /** Rendu du texte avec surlignage des occurrences recherchées ;
   * la plaque active porte un marqueur pour le défilement. */
  const surligne = (texte: string) => {
    if (plaques.length === 0) return texte;
    const morceaux: ReactNode[] = [];
    let curseur = 0;
    plaques.forEach((p, i) => {
      if (p.debut < curseur) return; // anomalie défensive
      if (p.debut > curseur) morceaux.push(texte.slice(curseur, p.debut));
      const contenu = texte.slice(p.debut, p.fin);
      morceaux.push(
        i === indexAffiche ? (
          <mark key={`actif-${i}`} data-ligne-recherche-active="">
            {contenu}
          </mark>
        ) : (
          <mark key={`occ-${i}`}>{contenu}</mark>
        )
      );
      curseur = p.fin;
    });
    if (curseur < texte.length) morceaux.push(texte.slice(curseur));
    return morceaux;
  };

  return (
    <div
      id={ID_LECTEUR}
      className="lecture velours lecture-transparente p-6 sm:p-12 flex-1 min-h-[40vh]"
    >
      {chargementChapitre ? (
        <p className="text-encre-500 text-sm animate-pouls-doux text-center">
          Ouverture du chapitre…
        </p>
      ) : !chapitreComplet ? (
        <p className="text-encre-500 text-sm italic text-center">
          Choisissez un chapitre dans la liste.
        </p>
      ) : (
        <article className="animate-fondu-monte colonne-lecture">
          <header className="text-center mb-10">
            <p className="sur-titre text-grenat-400/80 mb-2">✦ chapitre ✦</p>
            <h2 className="font-display text-2xl sm:text-4xl text-encre-100 leading-snug">
              {chapitreComplet.titre}
            </h2>
            <div className="liseret mx-auto mt-5" />
          </header>

          {/* Barre outils du chapitre : recherche + réglages confort */}
          <div className="flex items-center gap-2 mb-8 -mx-1 px-1">
            <Recherche
              term={term}
              texte={texteNet}
              plaques={plaques}
              indexActif={indexAffiche}
              onTerm={setTerm}
              onIndexActif={setIndexActif}
            />
            <RegleLecture idLecteur={ID_LECTEUR} />
          </div>

          {texteNet.length === 0 ? (
            <p className="text-encre-500 italic text-center text-sm">
              Ce chapitre est vide.
            </p>
          ) : (
            <div
              id="corps-livre"
              ref={corpsRef}
              className="corps-livre whitespace-pre-wrap text-inherit/95 first-letter:float-left first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:pr-3 first-letter:text-grenat-400"
            >
              {surligne(texteNet)}
            </div>
          )}
        </article>
      )}
    </div>
  );
}

export default memo(Lecteur);
