// ============================================================
// lecture.ts — Préférences de lecture.
//
// Rôle : les PREFERENCES de confort de lecture (thème, police,
// taille, interligne, largeur, justification) appliquées au
// lecteur et MÉMORISÉES dans localStorage — l'utilisateur
// retrouve son confort à chaque visite.
//
// Les fonctions sont pures (entrées/sorties sérialisables) afin
// d'être testables en Node, sans DOM. Les wrappers React (hooks,
// persistance) vivent dans components/.
// ============================================================

export type ThemeLecture = 'nuit' | 'encre' | 'parchemin';
export type PoliceLecture = 'lora' | 'systeme' | 'monospace';

export interface PreferencesLecture {
  /** Thème de fond du lecteur. */
  theme: ThemeLecture;
  /** Police du corps de texte. */
  police: PoliceLecture;
  /** Taille de police en px (14 → 24). */
  taille: number;
  /** Interligne (1.5 → 2.4). */
  interligne: number;
  /** Largeur de colonne en « ch » (50 → 85). */
  largeur: number;
  /** Justifier le texte plutôt que de le garder aligné à gauche. */
  justifie: boolean;
}

export const PREFERENCES_PAR_DEFAUT: PreferencesLecture = {
  theme: 'nuit',
  police: 'lora',
  taille: 17,
  interligne: 1.75,
  largeur: 65,
  justifie: false,
};

/** Bornes des réglages (évite de stocker / appliquer des valeurs absurdes). */
export const BORNES = {
  taille: { min: 14, max: 24 },
  interligne: { min: 1.5, max: 2.4 },
  largeur: { min: 50, max: 85 },
} as const;

/** Clef localStorage des préférences (unique, versionnée). */
export const CLEF_PREFERENCES = 'plume.dombres.prefs.v1';

const THEMES_VALIDES: readonly ThemeLecture[] = ['nuit', 'encre', 'parchemin'];
const POLICES_VALIDES: readonly PoliceLecture[] = [
  'lora',
  'systeme',
  'monospace',
];

function borner(
  valeur: unknown,
  defaut: number,
  plage: { min: number; max: number }
): number {
  if (typeof valeur !== 'number' || !isFinite(valeur)) return defaut;
  return Math.min(Math.max(valeur, plage.min), plage.max);
}

/**
 * Assainit / fusionne une préférence lue (localStorage, partage…)
 * avec les valeurs par défaut. Protège des clés manquantes ou
 * corrompues : on retombe toujours sur des valeurs valides.
 */
export function assainirPreferences(entree: unknown): PreferencesLecture {
  const brut = (entree ?? {}) as Partial<PreferencesLecture>;
  return {
    theme: THEMES_VALIDES.includes(brut.theme as ThemeLecture)
      ? (brut.theme as ThemeLecture)
      : PREFERENCES_PAR_DEFAUT.theme,
    police: POLICES_VALIDES.includes(brut.police as PoliceLecture)
      ? (brut.police as PoliceLecture)
      : PREFERENCES_PAR_DEFAUT.police,
    taille: borner(brut.taille, PREFERENCES_PAR_DEFAUT.taille, BORNES.taille),
    interligne: borner(
      brut.interligne,
      PREFERENCES_PAR_DEFAUT.interligne,
      BORNES.interligne
    ),
    largeur: borner(brut.largeur, PREFERENCES_PAR_DEFAUT.largeur, BORNES.largeur),
    justifie: typeof brut.justifie === 'boolean' ? brut.justifie : false,
  };
}

/**
 * Convertit les préférences en variables CSS, posées sur l'élément
 * du lecteur (style={{ ... }}). Le lecteur consomme ces variables,
 * ce qui permet d'appliquer les réglages sans toucher au code.
 */
export function preferencesEnCss(
  pref: PreferencesLecture
): Record<string, string> {
  const polices: Record<PoliceLecture, string> = {
    lora: 'var(--font-lora), Georgia, serif',
    systeme: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    monospace: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  };
  const fonds: Record<ThemeLecture, string> = {
    nuit: 'var(--color-nuit-900)',
    encre: '#0d0b10',
    parchemin: '#f5eddd',
  };
  return {
    '--pref-police': polices[pref.police],
    '--pref-taille': `${pref.taille}px`,
    '--pref-interligne': String(pref.interligne),
    '--pref-largeur': `${pref.largeur}ch`,
    '--pref-alignment': pref.justifie ? 'justify' : 'left',
    '--pref-fond': fonds[pref.theme],
    // Le thème parchemin est clair : le texte passe en encre sombre.
    '--pref-encre':
      pref.theme === 'parchemin' ? '#2e2430' : 'var(--color-encre-100)',
  };
}