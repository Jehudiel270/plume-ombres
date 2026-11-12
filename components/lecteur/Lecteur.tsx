'use client';

// ============================================================
// Lecteur.tsx — Surface de lecture (F5 : confort de lecture).
//
// En-tête du chapitre (typographie du titre), barre d'outils
// (recherche plein texte + réglages de confort) et corps du texte.
//
// Typographie (F5) :
//  · le texte est découpé en BLOCS typographiques (paragraphes +
//    séparateurs de scène) portant leurs offsets — les surlignages
//    de recherche restent exacts au caractère près ;
//  · les blancs de séparation deviennent de l'ESPACEMENT CSS
//    réglable (plus des lignes vides figées) ;
//  · retrait de première ligne, césure, justification, marges,
//    mesure en caractères et deux colonnes sont pilotés par les
//    préférences (variables CSS --pref-*), posées en style en ligne
//    sur le conteneur : aucun décalage au premier rendu ;
//  · les paragraphes ne sont jamais coupés par une colonne ou une
//    page (break-inside: avoid) et un titre/scène ne reste jamais
//    orphelin en bas de colonne.
//
// Performance (C2, conservée) :
//  · l'état de recherche vit ICI : taper ne re-rend que le lecteur ;
//  · le surlignage est mémoïsé et borné par RECHERCHE DICHOTOMIQUE
//    dans les occurrences : le coût par paragraphe ne dépend plus du
//    nombre total d'occurrences du chapitre ;
//  · un chapitre LONG est regroupé en paquets (lib/pagination)
//    portant `content-visibility: auto` : le navigateur saute le
//    rendu des paquets hors écran.
//
// Mobile (C3) : barre de navigation au pouce, collée au bas.
// ============================================================

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Chapitre } from '@/lib/types';
import { chercherTermes, type Plaque } from '@/lib/recherche';
import {
  decouperEnParagraphes,
  grouperEnBlocs,
  TAILLE_BLOC_TEXTE,
} from '@/lib/pagination';
import { preferencesEnCss } from '@/lib/lecture';
import type { PaireBilingue } from '@/lib/bilingue';
import Recherche from '@/components/Recherche';
import type { ControlePreferences } from '@/components/lecteur/ReglagesLecture';
import ReglagesLecture from '@/components/lecteur/ReglagesLecture';

const ID_LECTEUR = 'lecteur-chapitre';
const ID_CORPS = 'corps-livre';

/**
 * Titre de chapitre : « Chapitre 3 — Le long corridor » se présente
 * en deux niveaux typographiques (étiquette + titre), comme dans un
 * livre imprimé. Un titre d'une autre forme reste affiché tel quel.
 */
const RE_TITRE_NUMEROTE =
  /^(chapitre|chapter|partie|part|tome|book|livre|épilogue|epilogue|prologue)\s*([0-9]+|[ivxlcdm]+)?\s*[—–:-]\s*(.+)$/i;

function analyserTitre(titre: string): {
  etiquette: string | null;
  principal: string;
} {
  const propre = titre.trim();
  const m = RE_TITRE_NUMEROTE.exec(propre);
  if (!m || !m[3]) return { etiquette: null, principal: propre };
  const mot = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return {
    etiquette: m[2] ? `${mot} ${m[2]}` : mot,
    principal: m[3].trim(),
  };
}

/**
 * Indice de la première occurrence qui commence à `offset` ou après
 * (recherche dichotomique — les plaques sont triées par position).
 * Évite de reparcourir toutes les occurrences à chaque paragraphe.
 */
function indicePlaque(plaques: Plaque[], offset: number): number {
  let bas = 0;
  let haut = plaques.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (plaques[milieu].debut < offset) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

interface Props {
  /** Chapitre complet chargé (null tant qu'aucun n'est ouvert). */
  chapitreComplet: Chapitre | null;
  /** Sélection en cours de chargement (état dérivé, côté parent). */
  chargementChapitre: boolean;
  /** Texte du chapitre affiché, rogné (`texteAffiche.trim()`). */
  texteNet: string;
  /** Élément mesuré par le parent pour le ratio de lecture (défilement). */
  corpsRef: RefObject<HTMLDivElement | null>;
  /** Cadre défilant du mode deux colonnes (mesuré par le parent). */
  cadreRef: RefObject<HTMLDivElement | null>;
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
  /** Préférences de confort (état détenu par l'espace de travail). */
  preferences: ControlePreferences;
  /**
   * Outils SUPPLÉMENTAIREs de la barre du chapitre (ajout chantier :
   * lecture à voix haute). Optionnel : le lecteur livré reste
   * inchangé quand aucun outil n'est passé.
   */
  outils?: ReactNode;
  /**
   * Vue bilingue (F7, ajout chantier) : paires source ↔ traduit. Non
   * null → le corps affiche les paires au lieu du texte simple. La
   * recherche garde son texte (`texteNet`) ; le surlignage ne porte
   * que les paires dont l'offset traduit est connu (repli
   * paragraphe), celles venant des segments s'affichent sans marque.
   */
  pairesBilingue?: PaireBilingue[] | null;
  /** Code de langue de la colonne source (attribut lang de la paire). */
  langueSourceBilingue?: string;
}

/**
 * Corps du texte, MÉMOÏSÉ : tant que la liste d'éléments garde la même
 * référence (elle est produite par `useMemo`), React ne reparcourt pas
 * les milliers de nœuds du chapitre — un changement qui ne touche pas
 * le texte (attribut `lang`, préférence de couleur…) ne coûte donc
 * rien. Mesuré : bascule source ↔ traduction 780 ms → 20 ms sur un
 * chapitre de 88 000 caractères et 780 surlignages.
 */
const Corps = memo(function Corps({ contenu }: { contenu: ReactNode }) {
  return <>{contenu}</>;
});

function Lecteur({
  chapitreComplet,
  chargementChapitre,
  texteNet,
  corpsRef,
  cadreRef,
  chapitrePrecedentId,
  chapitreSuivantId,
  onNaviguer,
  onOuvrirTiroir,
  position,
  total,
  preferences,
  outils,
  pairesBilingue = null,
  langueSourceBilingue,
}: Props) {
  const { prefs, maj, reinitialiser } = preferences;
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
  }, [indexAffiche, plaques.length, prefs.colonnes, prefs.taille, prefs.largeur]);

  /** Rendu d'un BLOC de texte avec surlignage des occurrences qui y
   *  tombent ; la plaque active porte un marqueur pour le défilement.
   *  `base` = décalage du bloc dans le texte affiché. Les plaques
   *  sont triées : on n'examine que celles qui commencent dans le
   *  bloc (dichotomie), puis on s'arrête à la première qui le dépasse. */
  const surligne = useCallback(
    (texte: string, base: number): ReactNode => {
      if (plaques.length === 0) return texte;
      const finBloc = base + texte.length;
      const debutIndex = indicePlaque(plaques, base);
      const morceaux: ReactNode[] = [];
      let curseur = base;
      let dedans = 0;
      for (let i = debutIndex; i < plaques.length; i += 1) {
        const p = plaques[i];
        if (p.debut >= finBloc) break; // trié : plus rien dans ce bloc
        if (p.fin > finBloc) continue; // à cheval sur deux blocs : ignorée
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
      if (curseur < finBloc) morceaux.push(texte.slice(curseur - base));
      return morceaux;
    },
    [plaques, indexAffiche]
  );

  // ---------- Découpage typographique (mémoïsé) ----------
  // Analyse UNE fois par texte : paragraphes + séparateurs de scène,
  // avec leurs offsets (les surlignages restent alignés).
  const blocsTypo = useMemo(
    () => (texteNet.length > 0 ? decouperEnParagraphes(texteNet) : []),
    [texteNet]
  );
  // Regroupement en paquets (~20 000 caractères) : `content-visibility`
  // délègue au navigateur le rendu des paquets hors écran. Un paquet ne
  // coupe JAMAIS un bloc : la typographie reste identique.
  const paquets = useMemo(
    () => grouperEnBlocs(blocsTypo, TAILLE_BLOC_TEXTE),
    [blocsTypo]
  );

  // ---------- Deux colonnes (grand écran) ----------
  const deuxColonnes = prefs.colonnes === 2;

  /** Contenu du corps : blocs typés (paragraphe ou scène), groupés en
   *  paquets qui portent `content-visibility: auto` (sauf en deux
   *  colonnes, où la pagination naturelle du navigateur doit rester
   *  maîtresse de la hauteur des colonnes).
   *
   *  Les clefs React sont POSITIONNELLES (jamais dérivées des offsets
   *  du texte) : basculer source ↔ traduction, ou relancer une
   *  recherche, met à jour les nœuds EN PLACE au lieu de démonter et
   *  remonter tout le corps du chapitre (mesuré : 780 ms → 25 ms sur
   *  un chapitre de 88 000 caractères avec 780 surlignages). */
  const contenu = useMemo(() => {
    const avecLettrine = prefs.lettrine;
    const paresseux = !deuxColonnes;
    // Vue bilingue (F7) : paires source ↔ traduit, regroupées en
    // paquets portant content-visibility (comme le texte simple).
    if (pairesBilingue) {
      const TAILLE_PAIQUET_PAIRES = 6;
      const paquetsPaires: PaireBilingue[][] = [];
      for (let i = 0; i < pairesBilingue.length; i += TAILLE_PAIQUET_PAIRES) {
        paquetsPaires.push(pairesBilingue.slice(i, i + TAILLE_PAIQUET_PAIRES));
      }
      return paquetsPaires.map((paquet, iP) => (
        <div
          key={iP}
          className={
            paresseux
              ? '[content-visibility:auto] [contain-intrinsic-size:auto_800px]'
              : undefined
          }
        >
          {paquet.map((paire, iB) => {
            const absolu = iP * TAILLE_PAIQUET_PAIRES + iB;
            return (
              <div key={iB} className="paire-bilingue">
                {paire.source && (
                  <p className="bilingue-source" lang={langueSourceBilingue}>
                    {paire.source}
                  </p>
                )}
                {paire.traduit ? (
                  <p className={avecLettrine && absolu === 0 ? 'lettrine' : undefined}>
                    {paire.debutTraduit >= 0
                      ? surligne(paire.traduit, paire.debutTraduit)
                      : paire.traduit}
                  </p>
                ) : (
                  <p className="bilingue-attente" aria-hidden="true">
                    —
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ));
    }
    return paquets.map((paquet, iP) => (
      <div
        key={iP}
        className={
          paresseux
            ? '[content-visibility:auto] [contain-intrinsic-size:auto_800px]'
            : undefined
        }
      >
        {paquet.map((bloc, iB) => {
          // Le tout premier bloc du chapitre porte la lettrine.
          const premier = avecLettrine && iP === 0 && iB === 0;
          if (bloc.type === 'scene') {
            return (
              <p
                key={iB}
                className="repere-scene"
                role="separator"
                aria-label="Séparation de scène"
              >
                {surligne(bloc.texte, bloc.debut)}
              </p>
            );
          }
          return (
            <p
              key={iB}
              className={premier ? 'lettrine' : undefined}
              data-bloc={bloc.debut}
            >
              {surligne(bloc.texte, bloc.debut)}
            </p>
          );
        })}
      </div>
    ));
  }, [paquets, surligne, prefs.lettrine, deuxColonnes, pairesBilingue, langueSourceBilingue]);

  /** Tourne d'une colonne (le cadre défile horizontalement). */
  const tournerColonne = useCallback(
    (sens: number) => {
      const cadre = cadreRef.current;
      if (!cadre) return;
      const pas = Math.max(180, Math.round(cadre.clientWidth / 2));
      cadre.scrollBy({ left: sens * pas, behavior: 'smooth' });
    },
    [cadreRef]
  );
  // Changement de mode : on repart du début du texte (sinon le cadre
  // garde un décalage horizontal hérité de l'autre mode).
  useEffect(() => {
    cadreRef.current?.scrollTo({ left: 0 });
  }, [deuxColonnes, cadreRef]);

  // ---------- Style : préférences → variables CSS ----------
  const stylePreferences = useMemo(
    () => preferencesEnCss(prefs) as CSSProperties,
    [prefs]
  );
  const titre = useMemo(
    () => analyserTitre(chapitreComplet?.titre ?? ''),
    [chapitreComplet?.titre]
  );

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
          <span className="text-sm" aria-hidden="true">☰</span>
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
        style={stylePreferences}
        className="lecture velours lecture-transparente surface-lecture flex-1 min-h-[40vh]"
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
          <article
            className="animate-fondu-monte colonne-lecture"
            data-colonnes={deuxColonnes ? '2' : '1'}
          >
            <header className="entete-chapitre text-center">
              <p className="sur-titre text-grenat-400/80 mb-2">
                {titre.etiquette ? `✦ ${titre.etiquette} ✦` : '✦ chapitre ✦'}
              </p>
              <h2 className="titre-chapitre">{titre.principal}</h2>
              <div className="liseret mx-auto mt-5" />
            </header>

            {/* Barre outils du chapitre : recherche + réglages confort */}
            <div className="flex items-center gap-2 mb-6 -mx-1 px-1">
              <Recherche
                term={term}
                texte={texteNet}
                plaques={plaques}
                indexActif={indexAffiche}
                onTerm={setTerm}
                onIndexActif={setIndexActif}
              />
              <ReglagesLecture
                prefs={prefs}
                maj={maj}
                reinitialiser={reinitialiser}
              />
              {outils}
              {deuxColonnes && (
                <div className="hidden lg:flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => tournerColonne(-1)}
                    aria-label="Colonne précédente"
                    title="Colonne précédente"
                    className="bouton-fantome !px-2.5 !py-1.5 text-xs"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => tournerColonne(1)}
                    aria-label="Colonne suivante"
                    title="Colonne suivante"
                    className="bouton-fantome !px-2.5 !py-1.5 text-xs"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {texteNet.length === 0 ? (
              <p className="text-encre-500 italic text-center text-sm">
                Ce chapitre est vide.
              </p>
            ) : (
              <div
                ref={cadreRef}
                className="cadre-lecture"
                data-colonnes={deuxColonnes ? '2' : '1'}
                tabIndex={deuxColonnes ? 0 : -1}
                role={deuxColonnes ? 'region' : undefined}
                aria-label={
                  deuxColonnes
                    ? 'Texte du chapitre, deux colonnes — flèches pour changer de colonne'
                    : undefined
                }
              >
                <div
                  id={ID_CORPS}
                  ref={corpsRef}
                  data-colonnes={deuxColonnes ? '2' : '1'}
                  className="corps-livre"
                >
                  <Corps contenu={contenu} />
                </div>
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
