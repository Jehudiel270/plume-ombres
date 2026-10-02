'use client';

// ============================================================
// Lecteur.tsx — Surface de lecture : en-tête du chapitre,
// barre d'outils (recherche plein texte + réglages de confort)
// et corps du texte (surlignage des occurrences).
//
// Performance (vague 2 / C2) :
//  - l'état de recherche vit ICI : taper ne re-rend que le lecteur ;
//  - le surlignage est mémoïsé (`useCallback` + `useMemo`) : il n'est
//    recalculé que si le texte, les occurrences ou l'occurrence active
//    changent — pas à chaque rendu du composant ;
//  - un chapitre LONG est découpé en blocs (lib/pagination) portant
//    `content-visibility: auto` : le navigateur saute le rendu des
//    blocs hors écran. Le texte affiché reste identique au caractère
//    près (le découpage ne coupe que sur les lignes vides).
//
// Mobile (C3) : barre de navigation au pouce (chapitre précédent /
// suivant + tiroir des chapitres), collée au bas de l'écran.
// ============================================================

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Chapitre } from '@/lib/types';
import { chercherTermes } from '@/lib/recherche';
import { decouperEnBlocs, SEUIL_CHAPITRE_LONG } from '@/lib/pagination';
import Recherche from '@/components/Recherche';
import RegleLecture from '@/components/RegleLecture';

const ID_LECTEUR = 'lecteur-chapitre';

/** Taille visée d'un bloc de chapitre long (caractères). */
const TAILLE_BLOC = 20_000;

/** Classes de la lettrine (première lettre du chapitre). */
const LETTRINE =
  'first-letter:float-left first-letter:font-display first-letter:text-6xl first-letter:leading-[0.8] first-letter:pr-3 first-letter:text-grenat-400';

interface Props {
  /** Chapitre complet chargé (null tant qu'aucun n'est ouvert). */
  chapitreComplet: Chapitre | null;
  /** Sélection en cours de chargement (état dérivé, côté parent). */
  chargementChapitre: boolean;
  /** Texte du chapitre affiché, rogné (`texteAffiche.trim()`). */
  texteNet: string;
  /** Élément mesuré par le parent pour le ratio de lecture (défilement). */
  corpsRef: RefObject<HTMLDivElement | null>;
  /** Chapitre précédent / suivant (null aux extrémités de la liste). */
  chapitrePrecedentId: string | null;
  chapitreSuivantId: string | null;
  /** Ouvre un chapitre par son id (navigation au pouce). */
  onNaviguer: (id: string) => void;
  /** Ouvre le tiroir des chapitres (mobile). */
  onOuvrirTiroir: () => void;
  /** Position du chapitre affiché (1 → total) et nombre total. */
  position: number;
  total: number;
}

function Lecteur({
  chapitreComplet,
  chargementChapitre,
  texteNet,
  corpsRef,
  chapitrePrecedentId,
  chapitreSuivantId,
  onNaviguer,
  onOuvrirTiroir,
  position,
  total,
}: Props) {
  // ---------- Recherche plein texte (chapitre affiché) ----------
  const [term, setTerm] = useState('');
  const [indexActif, setIndexActif] = useState(0);
  // Le terme qui déclenche les CALCULS est différé de 200 ms : le champ
  // garde la frappe immédiate (aucune latence à la saisie), mais le
  // balayage du chapitre et le surlignage ne se recalculent plus à chaque
  // caractère — sur un chapitre long, c'est le poste de calcul dominant.
  const [termDiffere, setTermDiffere] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTermDiffere(term), 200);
    return () => window.clearTimeout(timer);
  }, [term]);

  const plaques = useMemo(
    () =>
      termDiffere.trim().length >= 2 && texteNet.length > 0
        ? chercherTermes(texteNet, termDiffere)
        : [],
    [texteNet, termDiffere]
  );
  // Clé de la source (chapitre + occurrence recherchée) : le retour à zéro
  // est détecté au RENDU par comparaison avec la clé précédente (état
  // « à réinitialiser »), pattern toléré par les règles React Compiler —
  // aucun setState synchrone dans un effet.
  const cleRecherche = `${texteNet.length}:${termDiffere}`;
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

  /** Rendu du texte d'un SEGMENT avec surlignage des occurrences qui y
   *  tombent ; la plaque active porte un marqueur pour le défilement.
   *  `base` = décalage du segment dans le texte affiché. */
  const surligne = useCallback(
    (texte: string, base: number): ReactNode => {
      if (plaques.length === 0) return texte;
      const finSegment = base + texte.length;
      const morceaux: ReactNode[] = [];
      let curseur = base;
      let dedans = 0;
      for (let i = 0; i < plaques.length; i += 1) {
        const p = plaques[i];
        if (p.debut < base || p.fin > finSegment) continue; // hors segment
        if (p.debut < curseur) continue; // anomalie défensive
        dedans += 1;
        if (p.debut > curseur) {
          morceaux.push(texte.slice(curseur - base, p.debut - base));
        }
        const contenu = texte.slice(p.debut - base, p.fin - base);
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
      }
      if (dedans === 0) return texte;
      if (curseur < finSegment) morceaux.push(texte.slice(curseur - base));
      return morceaux;
    },
    [plaques, indexAffiche]
  );

  // ---------- Chapitre long : blocs + content-visibility (C2) ----------
  // Découpage seulement au-delà du seuil : les chapitres courts gardent
  // exactement la structure d'avant (un seul bloc de texte).
  const blocs = useMemo(
    () =>
      texteNet.length > SEUIL_CHAPITRE_LONG
        ? decouperEnBlocs(texteNet, TAILLE_BLOC)
        : null,
    [texteNet]
  );

  /** Contenu du corps : un seul texte, ou des blocs paresseux. */
  const contenu = useMemo(() => {
    if (blocs === null) return surligne(texteNet, 0);
    let base = 0;
    return blocs.map((bloc, i) => {
      const debut = base;
      base += bloc.length;
      return (
        <div
          key={`bloc-${i}`}
          className={`[content-visibility:auto] [contain-intrinsic-size:auto_800px]${
            i === 0 ? ` ${LETTRINE}` : ''
          }`}
        >
          {surligne(bloc, debut)}
        </div>
      );
    });
  }, [blocs, texteNet, surligne]);

  const basDePage = (
    <nav
      aria-label="Navigation de chapitre"
      className="lg:hidden sticky bottom-0 z-30 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-stretch gap-2 rounded-2xl border border-nuit-700 bg-nuit-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
        <button
          type="button"
          onClick={() => chapitrePrecedentId && onNaviguer(chapitrePrecedentId)}
          disabled={!chapitrePrecedentId}
          aria-label="Chapitre précédent"
          className="bouton-fantome flex-1 min-h-12 text-xs disabled:opacity-35"
        >
          ‹ Précédent
        </button>
        <button
          type="button"
          onClick={onOuvrirTiroir}
          aria-label="Ouvrir le sommaire"
          className="bouton-fantome flex-1 min-h-12 flex flex-col items-center justify-center leading-none"
        >
          <span className="text-sm">☰</span>
          <span className="text-[10px] text-encre-500 mt-0.5">
            {position}/{total}
          </span>
        </button>
        <button
          type="button"
          onClick={() => chapitreSuivantId && onNaviguer(chapitreSuivantId)}
          disabled={!chapitreSuivantId}
          aria-label="Chapitre suivant"
          className="bouton-principal flex-1 min-h-12 text-xs disabled:opacity-35"
        >
          Suivant ›
        </button>
      </div>
    </nav>
  );

  return (
    <>
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
                className={`corps-livre whitespace-pre-wrap text-inherit/95 ${LETTRINE}`}
              >
                {contenu}
              </div>
            )}
          </article>
        )}
      </div>
      {basDePage}
    </>
  );
}

export default memo(Lecteur);
