// ============================================================
// ReglagesLecture.tsx — Réglages de confort de lecture (F5).
//
//  · `usePreferencesLecture()` : l'état des préférences (chargé
//    depuis localStorage, persisté à chaque changement) ;
//  · `ReglagesLecture` : le panneau de réglages, CONTRÔLÉ (il ne
//    détient aucun état de préférence) — il reçoit les préférences
//    et un `maj(patch)`.
//
// Le panneau est entièrement pilotable au CLAVIER :
//  · bouton « Aa » : aria-expanded / aria-haspopup / aria-controls ;
//  · groupes exclusifs (police, thème, colonnes…) en `radiogroup`
//    avec navigation par flèches, Home/End et tabindex mobile ;
//  · glissières natives (flèches, Home/End, Page↑/Page↓) doublées
//    d'un `aria-valuetext` lisible (« 17 px », « 0,9 em »…) ;
//  · Échap ferme et REND LE FOCUS au bouton d'ouverture ; un focus
//    qui sort du panneau le referme (jamais de panneau fantôme).
//
// Présentation : feuille ancrée à droite sur grand écran, feuille
// du bas sur mobile (au pouce, jamais hors écran).
// ============================================================
'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as EvenementClavier,
  type ReactNode,
} from 'react';
import {
  assainirPreferences,
  BORNES,
  CLEF_PREFERENCES,
  espacementEffectif,
  PREFERENCES_PAR_DEFAUT,
  type ColonnesLecture,
  type MargesLecture,
  type PoliceLecture,
  type PreferencesLecture,
  type ThemeLecture,
} from '@/lib/lecture';
import { useTheme } from '@/components/ProviderTheme';
import SelecteurPalette from '@/components/SelecteurPalette';
import SelecteurTypo from '@/components/SelecteurTypo';

// ------------------------------------------------------------
// État des préférences (localStorage)
// ------------------------------------------------------------

function chargerPreferences(): PreferencesLecture {
  if (typeof window === 'undefined') return PREFERENCES_PAR_DEFAUT;
  try {
    const brut = window.localStorage.getItem(CLEF_PREFERENCES);
    return assainirPreferences(brut ? JSON.parse(brut) : undefined);
  } catch {
    return PREFERENCES_PAR_DEFAUT;
  }
}

function sauverPreferences(pref: PreferencesLecture): void {
  try {
    window.localStorage.setItem(CLEF_PREFERENCES, JSON.stringify(pref));
  } catch {
    /* stockage plein / navigation privée : non bloquant */
  }
}

/** Préférences de lecture : lecture au montage, écriture à chaque
 *  changement. Les identités de `maj` et `reinitialiser` sont
 *  STABLES (callbacks sans dépendance) : les consommateurs mémoïsés
 *  ne se réveillent pas pour rien. */
export function usePreferencesLecture(): {
  prefs: PreferencesLecture;
  maj: (patch: Partial<PreferencesLecture>) => void;
  reinitialiser: () => void;
} {
  const [prefs, setPrefs] = useState<PreferencesLecture>(chargerPreferences);
  useEffect(() => {
    sauverPreferences(prefs);
  }, [prefs]);
  const maj = useCallback((patch: Partial<PreferencesLecture>) => {
    setPrefs((p) => assainirPreferences({ ...p, ...patch }));
  }, []);
  const reinitialiser = useCallback(
    () => setPrefs(PREFERENCES_PAR_DEFAUT),
    []
  );
  return useMemo(() => ({ prefs, maj, reinitialiser }), [prefs, maj, reinitialiser]);
}

/** Contrôleur de préférences, tel que consommé par le lecteur. */
export type ControlePreferences = ReturnType<typeof usePreferencesLecture>;

// ------------------------------------------------------------
// Briques de réglage (clavier + lecteur d'écran)
// ------------------------------------------------------------

const ID_PANNEAU = 'reglages-lecture';

interface Option<T> {
  valeur: T;
  libelle: string;
  titre?: string;
}

/**
 * Groupe de boutons exclusifs en `radiogroup` : une seule case de
 * tabulation (tabindex mobile), navigation par flèches/Home/End.
 */
function GroupeRadio<T extends string | number>({
  legende,
  options,
  valeur,
  onChoix,
}: {
  legende: string;
  options: Array<Option<T>>;
  valeur: T;
  onChoix: (v: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const indexActif = Math.max(
    0,
    options.findIndex((o) => o.valeur === valeur)
  );

  function surTouche(e: EvenementClavier, i: number) {
    let cible: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        cible = (i + 1) % options.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        cible = (i - 1 + options.length) % options.length;
        break;
      case 'Home':
        cible = 0;
        break;
      case 'End':
        cible = options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChoix(options[cible].valeur);
    refs.current[cible]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={legende} className="flex gap-1.5">
      {options.map((o, i) => (
        <button
          key={String(o.valeur)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.valeur === valeur}
          tabIndex={i === indexActif ? 0 : -1}
          title={o.titre}
          onClick={() => onChoix(o.valeur)}
          onKeyDown={(e) => surTouche(e, i)}
          className={`flex-1 min-h-11 rounded-lg px-2 py-1.5 text-micro border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-grenat-400 ${
            o.valeur === valeur
              ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
              : 'border-nuit-700 text-encre-500 hover:text-encre-300'
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Glissière étiquetée, avec valeur annoncée en clair. */
function Glissiere({
  libelle,
  valeur,
  valeurTexte,
  min,
  max,
  pas,
  onValeur,
  aide,
}: {
  libelle: string;
  valeur: number;
  valeurTexte: string;
  min: number;
  max: number;
  pas: number;
  onValeur: (v: number) => void;
  aide?: string;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <div className="flex justify-between text-micro text-encre-500 mb-1">
        <label htmlFor={id}>{libelle}</label>
        <span aria-hidden="true">{valeurTexte}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        aria-valuetext={valeurTexte}
        aria-describedby={aide ? `${id}-aide` : undefined}
        onChange={(e) => onValeur(Number(e.target.value))}
        className="regl-lecture w-full"
      />
      {aide && (
        <p id={`${id}-aide`} className="text-micro text-encre-500/80 mt-1">
          {aide}
        </p>
      )}
    </div>
  );
}

/** Case à cocher étiquetée (libellé cliquable, focus natif). */
function Bascule({
  libelle,
  actif,
  onBascule,
  aide,
}: {
  libelle: string;
  actif: boolean;
  onBascule: (v: boolean) => void;
  aide?: string;
}) {
  const id = useId();
  return (
    <div className="mb-2">
      <label
        htmlFor={id}
        className="flex items-center gap-2 min-h-11 cursor-pointer select-none"
      >
        <input
          id={id}
          type="checkbox"
          checked={actif}
          aria-describedby={aide ? `${id}-aide` : undefined}
          onChange={(e) => onBascule(e.target.checked)}
          className="accent-grenat-500 h-4 w-4 cursor-pointer"
        />
        <span className="text-xs text-encre-300">{libelle}</span>
      </label>
      {aide && (
        <p id={`${id}-aide`} className="text-micro text-encre-500/80 ml-6">
          {aide}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Panneau
// ------------------------------------------------------------

const THEMES: Array<Option<ThemeLecture>> = [
  { valeur: 'nuit', libelle: 'Nuit' },
  { valeur: 'encre', libelle: 'Encre' },
  { valeur: 'parchemin', libelle: 'Parchemin' },
];

const POLICES: Array<Option<PoliceLecture>> = [
  { valeur: 'lora', libelle: 'Lora', titre: 'Lora (romain) — police par défaut' },
  { valeur: 'systeme', libelle: 'Système', titre: 'Police système (aucun téléchargement)' },
  { valeur: 'monospace', libelle: 'Mono', titre: 'Monospace' },
];

const COLONNES: Array<Option<ColonnesLecture>> = [
  { valeur: 1, libelle: '1 colonne' },
  { valeur: 2, libelle: '2 colonnes', titre: 'Deux colonnes sur grand écran' },
];

const MARGES_OPTIONS: Array<Option<MargesLecture>> = [
  { valeur: 'compacte', libelle: 'Compactes' },
  { valeur: 'normale', libelle: 'Normales' },
  { valeur: 'large', libelle: 'Larges' },
];

const SEPARATEUR = <div className="h-px bg-nuit-700 my-3" aria-hidden="true" />;

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="text-micro uppercase tracking-[0.18em] text-encre-500/90 mb-2">
        {titre}
      </h3>
      {children}
    </section>
  );
}

/**
 * Panneau de réglages de lecture. CONTRÔLÉ : les préférences et
 * leur mise à jour viennent du parent (le lecteur), qui les
 * applique en style en ligne — l'affichage ne peut donc pas
 * diverger du réglage.
 */
export default function ReglagesLecture({
  prefs,
  maj,
  reinitialiser,
  extra,
}: {
  prefs: PreferencesLecture;
  maj: (patch: Partial<PreferencesLecture>) => void;
  reinitialiser: () => void;
  /** Contenu additionnel inséré en bas (ex. identité visuelle). */
  extra?: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { palette, typo, choisirPalette, choisirTypo } = useTheme();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);

  /** Ferme le panneau et rend le focus au bouton d'ouverture. */
  const fermer = useCallback((rendreFocus = true) => {
    setOuvert(false);
    if (rendreFocus) boutonRef.current?.focus();
  }, []);

  // Ouverture : le focus entre dans le panneau (premier réglage).
  useEffect(() => {
    if (!ouvert) return;
    const premier = panneauRef.current?.querySelector<HTMLElement>(
      'input, button, select, [tabindex]:not([tabindex="-1"])'
    );
    premier?.focus();
  }, [ouvert]);

  // Échap (fermeture) + clic/toucher extérieur + focus sortant.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fermer();
      }
    };
    const surPointeur = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!panneauRef.current?.contains(cible) && !boutonRef.current?.contains(cible)) {
        fermer(false);
      }
    };
    const surFocus = (e: FocusEvent) => {
      const cible = e.target as Node;
      if (!panneauRef.current?.contains(cible) && cible !== boutonRef.current) {
        fermer(false);
      }
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('pointerdown', surPointeur);
    document.addEventListener('focusin', surFocus);
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('pointerdown', surPointeur);
      document.removeEventListener('focusin', surFocus);
    };
  }, [ouvert, fermer]);

  const espacementForce =
    !prefs.retrait && prefs.espacement < espacementEffectif(prefs);

  return (
    <div className="relative" ref={conteneurRef}>
      <button
        ref={boutonRef}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={`bouton-fantome !px-3 !py-1.5 text-xs ${
          ouvert ? '!border-grenat-600 text-grenat-300' : ''
        }`}
        title="Réglages de lecture (police, taille, espacement, thème…)"
        aria-label="Réglages de lecture"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-controls={ouvert ? ID_PANNEAU : undefined}
      >
        <span className="font-display text-sm" aria-hidden="true">
          Aa
        </span>
      </button>

      {ouvert && (
        <div
          id={ID_PANNEAU}
          ref={panneauRef}
          role="dialog"
          aria-label="Réglages de lecture"
          // Ancrée au bouton « Aa », à toutes les tailles : le lecteur
          // porte `backdrop-filter`, qui fait de lui le bloc conteneur
          // des descendants `position: fixed` — une feuille « fixe »
          // glisserait donc avec le texte et sortirait de l'écran sur
          // un chapitre long. Ancrage absolu + défilement interne =
          // panneau toujours visible, du pouce comme à la souris.
          className="absolute right-0 top-full z-40 mt-2 velours !bg-nuit-800/95 backdrop-blur-md p-4 text-left animate-fondu-monte w-[min(21rem,calc(100vw-2.5rem))] max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-encre-500">
              Confort de lecture
            </p>
            <button
              type="button"
              onClick={() => fermer()}
              className="grid place-items-center min-h-11 min-w-11 -mr-1 rounded text-encre-500 hover:text-encre-100 text-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400"
              aria-label="Fermer les réglages"
            >
              ✕
            </button>
          </div>

          <Section titre="Texte">
            <div className="mb-3">
              <p className="text-micro text-encre-500 mb-1.5">Police du texte</p>
              <GroupeRadio
                legende="Police du texte"
                options={POLICES}
                valeur={prefs.police}
                onChoix={(police) => maj({ police })}
              />
            </div>
            <Glissiere
              libelle="Taille du texte"
              valeur={prefs.taille}
              valeurTexte={`${prefs.taille} px`}
              min={BORNES.taille.min}
              max={BORNES.taille.max}
              pas={1}
              onValeur={(taille) => maj({ taille })}
            />
            <Glissiere
              libelle="Interligne"
              valeur={prefs.interligne}
              valeurTexte={prefs.interligne.toFixed(2).replace('.', ',')}
              min={BORNES.interligne.min}
              max={BORNES.interligne.max}
              pas={0.05}
              onValeur={(interligne) => maj({ interligne })}
            />
          </Section>

          {SEPARATEUR}

          <Section titre="Mise en page">
            <Glissiere
              libelle="Largeur de ligne"
              valeur={prefs.largeur}
              valeurTexte={`${prefs.largeur} car.`}
              min={BORNES.largeur.min}
              max={BORNES.largeur.max}
              pas={1}
              onValeur={(largeur) => maj({ largeur })}
              aide="Entre 65 et 75 caractères, la lecture est la plus confortable."
            />
            <div className="mb-3">
              <p className="text-micro text-encre-500 mb-1.5">Marges</p>
              <GroupeRadio
                legende="Marges de la surface de lecture"
                options={MARGES_OPTIONS}
                valeur={prefs.marges}
                onChoix={(marges) => maj({ marges })}
              />
            </div>
            <Glissiere
              libelle="Espace entre paragraphes"
              valeur={prefs.espacement}
              valeurTexte={`${prefs.espacement.toFixed(2).replace('.', ',')} em`}
              min={BORNES.espacement.min}
              max={BORNES.espacement.max}
              pas={0.05}
              onValeur={(espacement) => maj({ espacement })}
              aide={
                espacementForce
                  ? 'Sans retrait de première ligne, un espace minimal est conservé pour rester lisible.'
                  : undefined
              }
            />
            <Bascule
              libelle="Première ligne en retrait"
              actif={prefs.retrait}
              onBascule={(retrait) => maj({ retrait })}
            />
            <Bascule
              libelle="Texte justifié"
              actif={prefs.justifie}
              onBascule={(justifie) => maj({ justifie })}
            />
            <Bascule
              libelle="Césure automatique"
              actif={prefs.cesure}
              onBascule={(cesure) => maj({ cesure })}
              aide="Recommandée avec le texte justifié : évite les grands trous entre les mots."
            />
            <div className="mt-2">
              <p className="text-micro text-encre-500 mb-1.5">Colonnes</p>
              <GroupeRadio
                legende="Nombre de colonnes"
                options={COLONNES}
                valeur={prefs.colonnes}
                onChoix={(colonnes) => maj({ colonnes })}
              />
            </div>
          </Section>

          {SEPARATEUR}

          <Section titre="Thème du lecteur">
            <GroupeRadio
              legende="Thème du lecteur"
              options={THEMES}
              valeur={prefs.theme}
              onChoix={(theme) => maj({ theme })}
            />
          </Section>

          {SEPARATEUR}

          <SelecteurPalette valeur={palette} onChoix={choisirPalette} />
          <SelecteurTypo valeur={typo} onChoix={choisirTypo} />

          {extra}

          <button
            type="button"
            onClick={reinitialiser}
            className="w-full mt-2 inline-flex items-center justify-center min-h-11 text-micro text-encre-500 hover:text-grenat-300 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 rounded"
          >
            Réinitialiser les réglages
          </button>
        </div>
      )}
    </div>
  );
}
