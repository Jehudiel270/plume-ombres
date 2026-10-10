// ============================================================
// lecture.ts — Préférences de confort de lecture (F5).
//
// Rôle : les PREFERENCES de confort du lecteur — thème, police,
// taille, interligne, mesure (largeur de colonne), justification,
// espacement de paragraphe, retrait de première ligne, césure,
// deux colonnes, marges et lettrine — appliquées au lecteur sous
// forme de variables CSS et MÉMORISÉES dans localStorage :
// l'utilisateur retrouve son confort à chaque visite.
//
// Rétrocompatibilité : la clef de stockage ne change pas et
// `assainirPreferences` FUSIONNE les valeurs lues avec les valeurs
// par défaut — une préférence enregistrée par une version
// antérieure (sans les nouveaux réglages) reste donc honorée, et
// les six réglages d'origine (theme, police, taille, interligne,
// largeur, justifie) gardent leur nom, leur type et leur sens.
//
// La MESURE est exprimée en CARACTÈRES réels : le nombre demandé
// est converti en longueur via le facteur de largeur moyenne de la
// police choisie (`FACTEUR_CARACTERE`) — « 68 » donne bien ~68
// caractères par ligne, quelle que soit la taille de police.
// (Un `ch` CSS vaut la largeur du « 0 » : ~15 % de trop.)
//
// Les fonctions sont pures (entrées/sorties sérialisables) afin
// d'être testables en Node, sans DOM. Les wrappers React (état,
// persistance) vivent dans components/lecteur/.
// ============================================================

export type ThemeLecture = 'nuit' | 'encre' | 'parchemin';
/**
 * Polices du corps de texte du lecteur.
 *
 * Les trois valeurs d'ORIGINE (`lora`, `systeme`, `monospace`) sont
 * conservées à l'identique (rétrocompatibilité des préférences
 * enregistrées). Les six suivantes sont les familles auto-hébergées
 * ajoutées au chantier typographie — leur corps du texte, et non un
 * couple titre+corps (ce dernier vit dans lib/theme.ts).
 */
export type PoliceLecture =
  | 'lora'
  | 'systeme'
  | 'monospace'
  | 'ebGaramond'
  | 'spectral'
  | 'libreBaskerville'
  | 'playfair'
  | 'prata'
  | 'atkinson';
export type MargesLecture = 'compacte' | 'normale' | 'large';
export type ColonnesLecture = 1 | 2;

export interface PreferencesLecture {
  /** Thème de fond du lecteur. */
  theme: ThemeLecture;
  /** Police du corps de texte. */
  police: PoliceLecture;
  /** Taille de police en px (14 → 24). */
  taille: number;
  /** Interligne (1.5 → 2.4). */
  interligne: number;
  /** Largeur de colonne en CARACTÈRES par ligne (50 → 85). */
  largeur: number;
  /** Justifier le texte plutôt que de le garder aligné à gauche. */
  justifie: boolean;
  /** Espace vertical entre deux paragraphes, en em (0 → 1.6). */
  espacement: number;
  /** Première ligne des paragraphes en retrait (style livre). */
  retrait: boolean;
  /** Césure automatique (`hyphens: auto`) — indispensable pour justifier. */
  cesure: boolean;
  /** Nombre de colonnes de texte (2 = deux colonnes sur grand écran). */
  colonnes: ColonnesLecture;
  /** Marges latérales de la surface de lecture. */
  marges: MargesLecture;
  /** Lettrine (grande initiale) au premier paragraphe du chapitre. */
  lettrine: boolean;
}

export const PREFERENCES_PAR_DEFAUT: PreferencesLecture = {
  theme: 'nuit',
  police: 'lora',
  taille: 17,
  interligne: 1.75,
  largeur: 68,
  justifie: false,
  espacement: 0.9,
  retrait: false,
  cesure: true,
  colonnes: 1,
  marges: 'normale',
  lettrine: true,
};

/** Bornes des réglages (évite de stocker / appliquer des valeurs absurdes). */
export const BORNES = {
  taille: { min: 14, max: 24 },
  interligne: { min: 1.5, max: 2.4 },
  largeur: { min: 50, max: 85 },
  espacement: { min: 0, max: 1.6 },
} as const;

/**
 * Largeur moyenne d'un caractère, en fraction de la taille de
 * police, pour chaque police du lecteur. Sert à convertir la
 * mesure demandée (en caractères) en longueur CSS réelle.
 * Valeurs mesurées sur le texte affiché dans le lecteur : Literata
 * (police par défaut) ≈ 0,50 em, monospace ≈ 0,60 em. Les familles
 * ajoutées reprennent la largeur moyenne observée à l'écran
 * (garalde repliée de EB Garamond ≈ 0,47 em ; serif large de Libre
 * Baskerville ≈ 0,53 em ; sans-serif d'Atkinson ≈ 0,53 em).
 */
export const FACTEUR_CARACTERE: Record<PoliceLecture, number> = {
  lora: 0.5,
  systeme: 0.5,
  monospace: 0.6,
  ebGaramond: 0.47,
  spectral: 0.5,
  libreBaskerville: 0.53,
  playfair: 0.5,
  prata: 0.52,
  atkinson: 0.53,
};

/**
 * TABLE DE PROJECTION CSS : chaque police du lecteur vers la pile
 * `font-family` réellement posée sur `--pref-police`. Les familles
 * auto-hébergées sont référencées par leur variable `next/font/local`
 * (voir lib/polices.ts), suivie des replis système.
 */
export const POLICES_CSS: Record<PoliceLecture, string> = {
  lora: 'var(--font-lora), Georgia, serif',
  systeme: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  monospace: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  ebGaramond: 'var(--font-eb-garamond), Georgia, "Times New Roman", serif',
  spectral: 'var(--font-spectral), Georgia, "Times New Roman", serif',
  libreBaskerville:
    'var(--font-libre-baskerville), Georgia, "Times New Roman", serif',
  playfair: 'var(--font-playfair), Georgia, "Times New Roman", serif',
  prata: 'var(--font-prata), Georgia, "Times New Roman", serif',
  atkinson:
    'var(--font-atkinson), "Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

/** Option de police proposée dans les réglages du lecteur. */
export interface OptionPolice {
  valeur: PoliceLecture;
  /** Libellé court affiché sur le bouton. */
  libelle: string;
  /** Libellé long (infobulle) décrivant le caractère de la police. */
  titre: string;
}

/**
 * LISTE PROPOSÉE À L'UTILISATEUR (réglages du lecteur). Les trois
 * entrées d'origine (Lora, Système, Mono) ouvrent la liste, puis les
 * six familles ajoutées. L'ordre est celui du catalogue
 * (lib/polices-familles.ts) : le test le vérifie.
 */
export const POLICES_LECTURE: readonly OptionPolice[] = [
  { valeur: 'lora', libelle: 'Lora', titre: 'Lora (romain) — police par défaut' },
  {
    valeur: 'systeme',
    libelle: 'Système',
    titre: 'Police système (aucun téléchargement)',
  },
  { valeur: 'monospace', libelle: 'Mono', titre: 'Monospace' },
  {
    valeur: 'ebGaramond',
    libelle: 'Garamond',
    titre: 'EB Garamond — garalde humaniste, très confortable en lecture longue',
  },
  {
    valeur: 'spectral',
    libelle: 'Spectral',
    titre: 'Spectral — serif d’écran à faible contraste',
  },
  {
    valeur: 'libreBaskerville',
    libelle: 'Baskerville',
    titre: 'Libre Baskerville — serif transitionnel robuste',
  },
  {
    valeur: 'playfair',
    libelle: 'Playfair',
    titre: 'Playfair Display — titres à fort contraste (caractère éditorial)',
  },
  {
    valeur: 'prata',
    libelle: 'Prata',
    titre: 'Prata — didone élégant, réservé aux titres',
  },
  {
    valeur: 'atkinson',
    libelle: 'Atkinson',
    titre: 'Atkinson Hyperlegible — sans-serif d’accessibilité (Braille Institute)',
  },
];

/** Marges latérales de la surface de lecture, en CSS. */
export const MARGE_LECTURE: Record<MargesLecture, string> = {
  compacte: '0.75rem',
  normale: '1.75rem',
  large: '3.25rem',
};

/** Ordre d'affichage des marges dans les réglages. */
export const MARGES_LECTURE: readonly MargesLecture[] = [
  'compacte',
  'normale',
  'large',
];

/**
 * Espacement minimal entre paragraphes quand la première ligne
 * n'est PAS en retrait : sans retrait ni espace, deux paragraphes
 * se touchent et le texte devient illisible.
 */
export const ESPACEMENT_MINI_SANS_RETRAIT = 0.45;

/** Clef localStorage des préférences (inchangée : rétrocompatibilité). */
export const CLEF_PREFERENCES = 'plume.dombres.prefs.v1';

const THEMES_VALIDES: readonly ThemeLecture[] = ['nuit', 'encre', 'parchemin'];

/**
 * TABLEAU DE VALIDATION des polices du lecteur. Sert à `assainirPreferences`
 * pour qu'une préférence inconnue (version antérieure, valeur corrompue…)
 * retombe TOUJOURS sur le défaut, sans jamais casser. Les trois valeurs
 * d'origine sont conservées ; les six familles ajoutées les suivent.
 */
export const POLICES_VALIDES: readonly PoliceLecture[] = [
  'lora',
  'systeme',
  'monospace',
  'ebGaramond',
  'spectral',
  'libreBaskerville',
  'playfair',
  'prata',
  'atkinson',
];

function borner(
  valeur: unknown,
  defaut: number,
  plage: { min: number; max: number }
): number {
  if (typeof valeur !== 'number' || !isFinite(valeur)) return defaut;
  return Math.min(Math.max(valeur, plage.min), plage.max);
}

function lister<T extends string>(
  valeur: unknown,
  valides: readonly T[],
  defaut: T
): T {
  return valides.includes(valeur as T) ? (valeur as T) : defaut;
}

/**
 * Assainit / fusionne une préférence lue (localStorage, partage…)
 * avec les valeurs par défaut. Protège des clefs manquantes ou
 * corrompues : on retombe toujours sur des valeurs valides.
 */
export function assainirPreferences(entree: unknown): PreferencesLecture {
  const brut = (entree ?? {}) as Partial<PreferencesLecture>;
  return {
    theme: lister(brut.theme, THEMES_VALIDES, PREFERENCES_PAR_DEFAUT.theme),
    police: lister(brut.police, POLICES_VALIDES, PREFERENCES_PAR_DEFAUT.police),
    taille: borner(brut.taille, PREFERENCES_PAR_DEFAUT.taille, BORNES.taille),
    interligne: borner(
      brut.interligne,
      PREFERENCES_PAR_DEFAUT.interligne,
      BORNES.interligne
    ),
    largeur: borner(
      brut.largeur,
      PREFERENCES_PAR_DEFAUT.largeur,
      BORNES.largeur
    ),
    justifie: typeof brut.justifie === 'boolean' ? brut.justifie : false,
    espacement: borner(
      brut.espacement,
      PREFERENCES_PAR_DEFAUT.espacement,
      BORNES.espacement
    ),
    retrait: typeof brut.retrait === 'boolean' ? brut.retrait : false,
    cesure: typeof brut.cesure === 'boolean' ? brut.cesure : true,
    colonnes: brut.colonnes === 2 ? 2 : 1,
    marges: lister(brut.marges, MARGES_LECTURE, PREFERENCES_PAR_DEFAUT.marges),
    lettrine: typeof brut.lettrine === 'boolean' ? brut.lettrine : true,
  };
}

/**
 * Espacement de paragraphe RÉELLEMENT appliqué (em) : quand la
 * première ligne n'est pas en retrait, on garantit un minimum,
 * sinon deux paragraphes se collent.
 */
export function espacementEffectif(pref: PreferencesLecture): number {
  if (pref.retrait) return pref.espacement;
  return Math.max(pref.espacement, ESPACEMENT_MINI_SANS_RETRAIT);
}

/**
 * Convertit les préférences en variables CSS, posées en style
 * EN LIGNE sur l'élément du lecteur : aucun décalage au premier
 * rendu, aucune écriture impérative dans le DOM.
 */
export function preferencesEnCss(
  pref: PreferencesLecture
): Record<string, string> {
  const fonds: Record<ThemeLecture, string> = {
    nuit: 'var(--color-nuit-900)',
    encre: '#0d0b10',
    parchemin: '#f5eddd',
  };
  // Mesure : nombre de caractères × largeur moyenne d'un caractère,
  // exprimée en multiples de la taille de police (donc sensible à
  // `--pref-taille` ET à la police choisie).
  const multiples = pref.largeur * FACTEUR_CARACTERE[pref.police];
  return {
    '--pref-police': POLICES_CSS[pref.police],
    '--pref-taille': `${pref.taille}px`,
    '--pref-interligne': String(pref.interligne),
    '--pref-largeur': `calc(var(--pref-taille) * ${multiples.toFixed(3)})`,
    '--pref-alignment': pref.justifie ? 'justify' : 'left',
    // Espacement de paragraphe réellement appliqué (garanti lisible
    // même sans retrait de première ligne).
    '--pref-espacement': `${espacementEffectif(pref).toFixed(2)}em`,
    '--pref-retrait': pref.retrait ? '1.6em' : '0px',
    '--pref-cesure': pref.cesure ? 'auto' : 'manual',
    '--pref-colonnes': String(pref.colonnes),
    '--pref-gouttiere': pref.colonnes === 2 ? '3rem' : '0px',
    '--pref-marges': MARGE_LECTURE[pref.marges],
    '--pref-lettrine': pref.lettrine ? '1' : '0',
    '--pref-fond': fonds[pref.theme],
    // Le thème parchemin est clair : le texte passe en encre sombre.
    '--pref-encre':
      pref.theme === 'parchemin' ? '#2e2430' : 'var(--color-encre-100)',
  };
}

/**
 * Lit les préférences depuis localStorage (valeurs assainies).
 * Sans `window` (rendu serveur), renvoie les valeurs par défaut.
 */
export function lirePreferences(): PreferencesLecture {
  if (typeof window === 'undefined') return PREFERENCES_PAR_DEFAUT;
  try {
    const brut = window.localStorage.getItem(CLEF_PREFERENCES);
    return assainirPreferences(brut ? JSON.parse(brut) : undefined);
  } catch {
    return PREFERENCES_PAR_DEFAUT;
  }
}

/** Persiste les préférences (silencieux si le stockage est indisponible). */
export function ecrirePreferences(pref: PreferencesLecture): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLEF_PREFERENCES, JSON.stringify(pref));
  } catch {
    /* stockage plein / navigation privée : non bloquant */
  }
}

// ============================================================
// Allègement des données (chantier B1 / B10) — les SEGMENTS sont la
// source de vérité unique du texte. Les colonnes
// `chapitres.texte_source` et `chapitres.texte_traduit` sont
// REDONDANTES : on cesse de les écrire à l'import et on recalcule
// tout (estimation de lecture, exports, détection de repères)
// depuis les segments. Fonctions PURES, sans DOM (Node-testables),
// qui remplacent toute lecture de ces deux colonnes.
// ============================================================

/** Segment minimal suffisant pour reconstruire un texte complet. */
export interface SegmentReconstructible {
  source: string;
  suite: string;
  traduit?: string | null;
}

/**
 * Nombre de caractères « utiles » d'un chapitre, recalculé depuis
 * ses segments (source + espacement). Remplace le comptage sur
 * `chapitres.texte_source` qui servait à l'estimation de lecture.
 */
export function caracteresDepuisSegments(
  segments: readonly SegmentReconstructible[]
): number {
  let total = 0;
  for (const s of segments) {
    total += (s.source ?? '').length + (s.suite ?? '').length;
  }
  return total;
}

/**
 * Reconstitue le texte source d'un chapitre depuis ses segments
 * (concaténation 1:1 `source + suite`). Égal au texte NORMALISÉ de
 * l'import (les retours à la ligne « mous » y sont devenus des
 * espaces) — c'est précisément le texte traduit et lu à l'écran.
 */
export function reconstituerSourceDepuisSegments(
  segments: readonly SegmentReconstructible[]
): string {
  return segments.map((s) => (s.source ?? '') + (s.suite ?? '')).join('');
}

/**
 * Reconstitue le texte traduit assemblé d'un chapitre depuis ses
 * segments (`traduit + suite`). Retourne `null` si aucun segment
 * n'est traduit — équivalent de `chapitres.texte_traduit` NULL.
 */
export function reconstituerTraduitDepuisSegments(
  segments: readonly SegmentReconstructible[]
): string | null {
  if (!segments.some((s) => (s.traduit ?? '').length > 0)) return null;
  return segments.map((s) => (s.traduit ?? '') + (s.suite ?? '')).join('');
}

/**
 * Estimation du temps de lecture d'un chapitre, recalculée depuis
 * ses segments. Même formule que `lib/stats.ts` (≈ 250 mots/min,
 * un mot français ≈ 6 caractères) afin de rester cohérente avec
 * `estimerSecondesLecture` — sans dépendre de `texte_source`.
 */
export function estimerSecondesLectureDepuisSegments(
  segments: readonly SegmentReconstructible[],
  motsParMinute = 250
): number {
  const caracteres = caracteresDepuisSegments(segments);
  if (caracteres <= 0) return 0;
  const mots = caracteres / 6;
  return Math.max(60, Math.round((mots / motsParMinute) * 60));
}
