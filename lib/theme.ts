// ============================================================
// theme.ts — Identité visuelle : palettes + typographies.
//
// SOURCE DE VÉRITÉ DES COULEURS : app/globals.css
//   Les valeurs hexadécimales vivent dans les blocs
//   `html[data-palette="…"] { --color-… }` (contrôlés par
//   scripts/verifier-contraste.mjs, qui les lit réellement).
//   Ici : l'identité, la persistance et les paramètres du shader.
//
// Choix persistant dans localStorage ; défaut selon
// prefers-color-scheme (clair → « claire », sombre → « brume »).
// ============================================================

export type PaletteId = 'brume' | 'orage' | 'encre' | 'sangOr' | 'claire';
export type TypoId = 'plume' | 'velin' | 'native';

/** Paramètres passés au shader du fond d'ambiance (0..1 par canal). */
export interface PaletteWebgl {
  /** Couleur de fond de base. */
  base: [number, number, number];
  /** Lueur fixe haut-gauche. */
  lueurA: [number, number, number];
  /** Lueur fixe haut-droite. */
  lueurB: [number, number, number];
  /** Teinte de brume A / B (mélangées par le bruit). */
  brumeA: [number, number, number];
  brumeB: [number, number, number];
  /** Couleur des braises (2 teintes tirées par colonne). */
  braiseA: [number, number, number];
  braiseB: [number, number, number];
  /** Énergie globale des lueurs (0 = plat). */
  energie: number;
  /** Intensité des braises (0 = aucune, pour le thème clair). */
  braise: number;
  /** Force de la vignette (0 = aucune). */
  vignette: number;
  /** Amplitude du grain fin. */
  grain: number;
}

export interface Palette {
  id: PaletteId;
  nom: string;
  description: string;
  /** Palette claire (papier) — pilote color-scheme et le fond fixe. */
  sombre: boolean;
  /** Couleurs d'aperçu des pastilles du sélecteur (valeurs réelles). */
  apercu: { fond: string; surface: string; accent: string; texte: string };
  webgl: PaletteWebgl;
}

const v = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
};

export const PALETTES: Record<PaletteId, Palette> = {
  brume: {
    id: 'brume',
    nom: 'Brume & braises',
    description: 'Noir chaud, brume bordeaux et plum. L’ambiance d’origine.',
    sombre: true,
    apercu: { fond: '#0a0608', surface: '#1b1216', accent: '#e0607f', texte: '#f2e6eb' },
    webgl: {
      base: v('#0a0608'),
      lueurA: v('#6b1e2d'),
      lueurB: v('#663a93'),
      brumeA: v('#6b1e2d'),
      brumeB: v('#663a93'),
      braiseA: v('#e8c4a0'),
      braiseB: v('#e0607f'),
      energie: 1,
      braise: 1,
      vignette: 1,
      grain: 0.02,
    },
  },
  orage: {
    id: 'orage',
    nom: 'Nuit d’orage',
    description: 'Bleu d’encre froid, éclairs pâles, violet d’averse.',
    sombre: true,
    apercu: { fond: '#06080e', surface: '#10141d', accent: '#7ea6ff', texte: '#e9eefb' },
    webgl: {
      base: v('#06080e'),
      lueurA: v('#1e3468'),
      lueurB: v('#4a2fa0'),
      brumeA: v('#2b4a8f'),
      brumeB: v('#4a2fa0'),
      braiseA: v('#cfe0ff'),
      braiseB: v('#8fb4ff'),
      energie: 0.95,
      braise: 0.9,
      vignette: 1.05,
      grain: 0.018,
    },
  },
  encre: {
    id: 'encre',
    nom: 'Encre',
    description: 'Graphite bleuté, presque monochrome, sobre et net.',
    sombre: true,
    apercu: { fond: '#0a0b0d', surface: '#15181d', accent: '#93a6bd', texte: '#eceff3' },
    webgl: {
      base: v('#0a0b0d'),
      lueurA: v('#24384f'),
      lueurB: v('#4a3d78'),
      brumeA: v('#2b3746'),
      brumeB: v('#3d3a5c'),
      braiseA: v('#d6cfbe'),
      braiseB: v('#9b8fc4'),
      energie: 0.8,
      braise: 0.7,
      vignette: 0.95,
      grain: 0.016,
    },
  },
  sangOr: {
    id: 'sangOr',
    nom: 'Sang & Or',
    description: 'Rouge profond et or vieilli — la plus théâtrale.',
    sombre: true,
    apercu: { fond: '#0c0406', surface: '#1c0d11', accent: '#e0a94a', texte: '#f7e8df' },
    webgl: {
      base: v('#0c0406'),
      lueurA: v('#4a0812'),
      lueurB: v('#6b4c14'),
      brumeA: v('#7d0f1f'),
      brumeB: v('#9a7530'),
      braiseA: v('#f2d79b'),
      braiseB: v('#e0a94a'),
      energie: 1.1,
      braise: 1.1,
      vignette: 1.1,
      grain: 0.022,
    },
  },
  claire: {
    id: 'claire',
    nom: 'Claire',
    description: 'Papier chaud et encre prune — pour lire en plein jour.',
    sombre: false,
    apercu: { fond: '#f4efe9', surface: '#fdfaf6', accent: '#8f2440', texte: '#241a20' },
    webgl: {
      base: v('#f4efe9'),
      lueurA: v('#e6cfc2'),
      lueurB: v('#d9cfe6'),
      brumeA: v('#e9d3c6'),
      brumeB: v('#dcd2ea'),
      braiseA: v('#c9a15e'),
      braiseB: v('#8f2440'),
      energie: 0.6,
      braise: 0,
      vignette: 0.35,
      grain: 0.012,
    },
  },
};

export const ORDRE_PALETTES: PaletteId[] = [
  'brume',
  'orage',
  'encre',
  'sangOr',
  'claire',
];

export const PALETTE_SOMBRE_DEFAUT: PaletteId = 'brume';
export const PALETTE_CLAIRE_DEFAUT: PaletteId = 'claire';

export interface Typo {
  id: TypoId;
  nom: string;
  description: string;
  titre: string;
  corps: string;
}

export const TYPOS: Record<TypoId, Typo> = {
  plume: {
    id: 'plume',
    nom: 'Plume',
    description: 'Bodoni Moda aux titres, Literata au corps. Défaut.',
    titre: 'var(--font-bodoni), Georgia, "Times New Roman", serif',
    corps: 'var(--font-literata), Georgia, "Times New Roman", serif',
  },
  velin: {
    id: 'velin',
    nom: 'Vélin',
    description: 'Titres Bodoni Moda, corps Cormorant Garamond, plus aéré.',
    titre: 'var(--font-bodoni), Georgia, "Times New Roman", serif',
    corps: 'var(--font-cormorant), Georgia, "Times New Roman", serif',
  },
  native: {
    id: 'native',
    nom: 'Native',
    description: 'Aucune police téléchargée : Georgia du système.',
    titre: 'Georgia, "Times New Roman", serif',
    corps: 'Georgia, "Times New Roman", serif',
  },
};

export const ORDRE_TYPOS: TypoId[] = ['plume', 'velin', 'native'];
export const TYPO_DEFAUT: TypoId = 'plume';

export const CLEF_PALETTE = 'plume.dombres.palette.v1';
export const CLEF_TYPO = 'plume.dombres.typo.v1';

const IDS_PALETTES = Object.keys(PALETTES) as PaletteId[];
const IDS_TYPOS = Object.keys(TYPOS) as TypoId[];

/** Palette par défaut selon le schéma système. */
export function paletteDefaut(sombreSysteme: boolean): PaletteId {
  return sombreSysteme ? PALETTE_SOMBRE_DEFAUT : PALETTE_CLAIRE_DEFAUT;
}

export function assainirPalette(valeur: unknown): PaletteId {
  return IDS_PALETTES.includes(valeur as PaletteId)
    ? (valeur as PaletteId)
    : PALETTE_SOMBRE_DEFAUT;
}

export function assainirTypo(valeur: unknown): TypoId {
  return IDS_TYPOS.includes(valeur as TypoId)
    ? (valeur as TypoId)
    : TYPO_DEFAUT;
}

/**
 * Applique la palette et la typographie à la racine du document :
 *   · data-palette / data-typo (pilotent les variables CSS),
 *   · variables --typo-titre / --typo-corps,
 *   · color-scheme (clair/sombre) pour les contrôles natifs.
 */
export function appliquerTheme(palette: PaletteId, typo: TypoId): void {
  if (typeof document === 'undefined') return;
  const racine = document.documentElement;
  racine.dataset.palette = palette;
  racine.dataset.typo = typo;
  const t = TYPOS[typo];
  racine.style.setProperty('--typo-titre', t.titre);
  racine.style.setProperty('--typo-corps', t.corps);
}

/** Lit une préférence localStorage (silencieux si indisponible). */
export function lirePreference(clef: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(clef);
  } catch {
    return null;
  }
}

export function ecrirePreference(clef: string, valeur: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(clef, valeur);
  } catch {
    /* navigation privée : non bloquant */
  }
}

/**
 * Événement global d'ouverture du panneau « Apparence ».
 *
 * N'importe quelle page ou n'importe quel menu peut l'émettre :
 *   window.dispatchEvent(new Event(EVENEMENT_APPARENCE))
 * Le panneau (components/PanneauApparence.tsx), monté une seule fois
 * dans app/layout.tsx, écoute et s'ouvre — sans couplage direct.
 */
export const EVENEMENT_APPARENCE = 'plume:ouvrir-apparence';

/** Ouvre le panneau « Apparence » depuis n'importe où (sans le coupler). */
export function ouvrirApparence(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENEMENT_APPARENCE));
}

/** Script inline anti-FOUC : pose la palette/typo avant le premier rendu. */
export const SCRIPT_THEME = `(function(){try{
var d=document.documentElement;
var pal=localStorage.getItem(${JSON.stringify(CLEF_PALETTE)});
var typo=localStorage.getItem(${JSON.stringify(CLEF_TYPO)});
var okPal=${JSON.stringify(IDS_PALETTES)};
if(okPal.indexOf(pal)<0){pal=window.matchMedia('(prefers-color-scheme: light)').matches?'claire':'${PALETTE_SOMBRE_DEFAUT}';}
var okTypo=${JSON.stringify(IDS_TYPOS)};
if(okTypo.indexOf(typo)<0){typo='${TYPO_DEFAUT}';}
var T=${JSON.stringify(TYPOS)};
d.dataset.palette=pal;d.dataset.typo=typo;
d.style.setProperty('--typo-titre',T[typo].titre);
d.style.setProperty('--typo-corps',T[typo].corps);
}catch(e){}})();`;
