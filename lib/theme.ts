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

export type PaletteId =
  | 'brume'
  | 'orage'
  | 'encre'
  | 'sangOr'
  | 'claire'
  | 'sangLune'
  | 'foretNocturne'
  | 'ambreCendre'
  | 'cuivreHetre'
  | 'encreVerte'
  | 'crepusculeMauve'
  | 'givre'
  | 'braiseRouge'
  | 'marineProfonde'
  | 'mauveGothique'
  | 'auroreBoreale'
  | 'roseFane'
  | 'sepiaAncienne';
export type TypoId =
  | 'plume'
  | 'velin'
  | 'native'
  // Familles ajoutées au chantier typographie (paires titre + corps).
  | 'ebGaramond'
  | 'spectral'
  | 'libreBaskerville'
  | 'playfair'
  | 'prata'
  | 'atkinson';

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
  // --- Ajouts (w8w9) : 13 palettes supplémentaires, dont 2 claires
  //     (roseFane, sepiaAncienne) et une à fort contraste (givre).
  sangLune: {
    id: 'sangLune',
    nom: 'Sang de lune',
    description: 'Cramoisi lunaire sur un noir prune — le sang vu de nuit.',
    sombre: true,
    apercu: { fond: '#0b070a', surface: '#1e1218', accent: '#ff6d8f', texte: '#f7ecf1' },
    webgl: {
      base: v('#0b070a'),
      lueurA: v('#5c1024'),
      lueurB: v('#6b3d9c'),
      brumeA: v('#8f1430'),
      brumeB: v('#8a5fc4'),
      braiseA: v('#f7d0db'),
      braiseB: v('#ff6d8f'),
      energie: 1,
      braise: 1,
      vignette: 1,
      grain: 0.02,
    },
  },
  foretNocturne: {
    id: 'foretNocturne',
    nom: 'Forêt nocturne',
    description: 'Mousse et sous-bois au clair de lune, vert éteint.',
    sombre: true,
    apercu: { fond: '#060b08', surface: '#111d16', accent: '#6fd08f', texte: '#e9f5ec' },
    webgl: {
      base: v('#060b08'),
      lueurA: v('#123a24'),
      lueurB: v('#1f5c3a'),
      brumeA: v('#1c6b3e'),
      brumeB: v('#3f8f5c'),
      braiseA: v('#d7f0c0'),
      braiseB: v('#6fd08f'),
      energie: 0.85,
      braise: 0.8,
      vignette: 1,
      grain: 0.02,
    },
  },
  ambreCendre: {
    id: 'ambreCendre',
    nom: 'Ambre et cendre',
    description: 'Ambre tiède sur cendre grise — chaleur qui s’éteint.',
    sombre: true,
    apercu: { fond: '#0d0a07', surface: '#211a11', accent: '#e8a54a', texte: '#f7f0e4' },
    webgl: {
      base: v('#0d0a07'),
      lueurA: v('#5e3c10'),
      lueurB: v('#8a6a2a'),
      brumeA: v('#a06a1a'),
      brumeB: v('#c9a877'),
      braiseA: v('#f7e3b0'),
      braiseB: v('#e8a54a'),
      energie: 0.95,
      braise: 0.9,
      vignette: 1,
      grain: 0.02,
    },
  },
  cuivreHetre: {
    id: 'cuivreHetre',
    nom: 'Cuivre et hêtre',
    description: 'Cuivre patiné et bois de hêtre — l’atelier du traducteur.',
    sombre: true,
    apercu: { fond: '#0b0705', surface: '#1f150d', accent: '#d9894a', texte: '#f6ece0' },
    webgl: {
      base: v('#0b0705'),
      lueurA: v('#5a3012'),
      lueurB: v('#7d5a34'),
      brumeA: v('#96562a'),
      brumeB: v('#c39d72'),
      braiseA: v('#f2d79b'),
      braiseB: v('#d9894a'),
      energie: 0.9,
      braise: 0.9,
      vignette: 1,
      grain: 0.022,
    },
  },
  encreVerte: {
    id: 'encreVerte',
    nom: 'Nuit d’encre verte',
    description: 'Encre vert bouteille, humide et profonde, reflets d’algues.',
    sombre: true,
    apercu: { fond: '#050b0a', surface: '#101d1a', accent: '#62cfb4', texte: '#e8f4f0' },
    webgl: {
      base: v('#050b0a'),
      lueurA: v('#12403a'),
      lueurB: v('#1c5c52'),
      brumeA: v('#1f6e60'),
      brumeB: v('#4f9c8c'),
      braiseA: v('#d0f0e6'),
      braiseB: v('#62cfb4'),
      energie: 0.85,
      braise: 0.8,
      vignette: 1,
      grain: 0.02,
    },
  },
  crepusculeMauve: {
    id: 'crepusculeMauve',
    nom: 'Crépuscule mauve',
    description: 'Le ciel juste après le coucher — mauve et violet profond.',
    sombre: true,
    apercu: { fond: '#0a070d', surface: '#1b1324', accent: '#c07ce8', texte: '#f2ebf7' },
    webgl: {
      base: v('#0a070d'),
      lueurA: v('#3f2668'),
      lueurB: v('#6b3fa0'),
      brumeA: v('#6a3a9c'),
      brumeB: v('#9a6ac4'),
      braiseA: v('#ecd0f7'),
      braiseB: v('#c07ce8'),
      energie: 1,
      braise: 1,
      vignette: 1,
      grain: 0.02,
    },
  },
  givre: {
    id: 'givre',
    nom: 'Givre',
    description: 'Blanc de givre sur un bleu-noir glacé — contraste maximal.',
    sombre: true,
    apercu: { fond: '#04070b', surface: '#0d161f', accent: '#7fd4ff', texte: '#ffffff' },
    webgl: {
      base: v('#04070b'),
      lueurA: v('#0d4459'),
      lueurB: v('#2a3f78'),
      brumeA: v('#1f6c94'),
      brumeB: v('#5f7fc4'),
      braiseA: v('#ffffff'),
      braiseB: v('#7fd4ff'),
      energie: 0.8,
      braise: 0.7,
      vignette: 1,
      grain: 0.014,
    },
  },
  braiseRouge: {
    id: 'braiseRouge',
    nom: 'Braise rouge',
    description: 'Braise incandescente : rouge-orange sur cendres noires.',
    sombre: true,
    apercu: { fond: '#0c0403', surface: '#210d09', accent: '#ff7a3d', texte: '#f8eae3' },
    webgl: {
      base: v('#0c0403'),
      lueurA: v('#6e260a'),
      lueurB: v('#a85a20'),
      brumeA: v('#c04a12'),
      brumeB: v('#e08a4a'),
      braiseA: v('#ffd9a0'),
      braiseB: v('#ff7a3d'),
      energie: 1,
      braise: 1,
      vignette: 1,
      grain: 0.022,
    },
  },
  marineProfonde: {
    id: 'marineProfonde',
    nom: 'Marine profonde',
    description: 'Bleu d’abysse, froid et sans fond, écume pâle.',
    sombre: true,
    apercu: { fond: '#04080f', surface: '#0c1a28', accent: '#6ba6e8', texte: '#e8f0fa' },
    webgl: {
      base: v('#04080f'),
      lueurA: v('#123a6e'),
      lueurB: v('#2a4aa0'),
      brumeA: v('#1f5aa8'),
      brumeB: v('#5a78c8'),
      braiseA: v('#cfe4ff'),
      braiseB: v('#6ba6e8'),
      energie: 0.9,
      braise: 0.85,
      vignette: 1,
      grain: 0.018,
    },
  },
  mauveGothique: {
    id: 'mauveGothique',
    nom: 'Mauve gothique',
    description: 'Pourpre d’église et vitraux, gothique et théâtral.',
    sombre: true,
    apercu: { fond: '#08050d', surface: '#181124', accent: '#c070d6', texte: '#f0e8f7' },
    webgl: {
      base: v('#08050d'),
      lueurA: v('#4f1f5e'),
      lueurB: v('#7a3fa0'),
      brumeA: v('#8a3aa8'),
      brumeB: v('#a878d0'),
      braiseA: v('#ecd0f7'),
      braiseB: v('#c070d6'),
      energie: 1,
      braise: 1,
      vignette: 1,
      grain: 0.022,
    },
  },
  auroreBoreale: {
    id: 'auroreBoreale',
    nom: 'Aurore boréale',
    description: 'Voiles verts et violets dansant sur un ciel polaire.',
    sombre: true,
    apercu: { fond: '#040b0a', surface: '#0d211d', accent: '#3fe0b0', texte: '#e6f6f2' },
    webgl: {
      base: v('#040b0a'),
      lueurA: v('#0e5644'),
      lueurB: v('#5a3fa8'),
      brumeA: v('#21b48a'),
      brumeB: v('#8a6ad0'),
      braiseA: v('#d0fff0'),
      braiseB: v('#3fe0b0'),
      energie: 1,
      braise: 0.9,
      vignette: 1,
      grain: 0.018,
    },
  },
  roseFane: {
    id: 'roseFane',
    nom: 'Rose fané',
    description: 'Vieux papier rose pâle et encre lie-de-vin — lecture de jour.',
    sombre: false,
    apercu: { fond: '#f3ece8', surface: '#fdf9f6', accent: '#b23a5c', texte: '#33232a' },
    webgl: {
      base: v('#f3ece8'),
      lueurA: v('#efd8d0'),
      lueurB: v('#e6d6e0'),
      brumeA: v('#f0d8d2'),
      brumeB: v('#e4d6e6'),
      braiseA: v('#c98a9a'),
      braiseB: v('#b23a5c'),
      energie: 0.55,
      braise: 0,
      vignette: 0.32,
      grain: 0.012,
    },
  },
  sepiaAncienne: {
    id: 'sepiaAncienne',
    nom: 'Sépia ancienne',
    description: 'Manuscrit sépia, encre brune et parchemins jaunis.',
    sombre: false,
    apercu: { fond: '#f2e9d8', surface: '#fcf8ee', accent: '#8f4626', texte: '#2e2416' },
    webgl: {
      base: v('#f2e9d8'),
      lueurA: v('#e6d3ac'),
      lueurB: v('#ddcba8'),
      brumeA: v('#ecd8b4'),
      brumeB: v('#dbc9a0'),
      braiseA: v('#b08a4a'),
      braiseB: v('#8f4626'),
      energie: 0.5,
      braise: 0,
      vignette: 0.3,
      grain: 0.012,
    },
  },
};

export const ORDRE_PALETTES: PaletteId[] = [
  // Les 5 palettes d'origine (inchangées), puis les ajouts w8w9.
  'brume',
  'orage',
  'encre',
  'sangOr',
  'claire',
  'sangLune',
  'braiseRouge',
  'foretNocturne',
  'encreVerte',
  'auroreBoreale',
  'marineProfonde',
  'givre',
  'ambreCendre',
  'cuivreHetre',
  'crepusculeMauve',
  'mauveGothique',
  'roseFane',
  'sepiaAncienne',
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
  // ---------------- Ajouts (chantier typographie) ----------------
  // Chaque entrée s'appuie sur une famille auto-hébergée de
  // lib/polices.ts (variable --font-…) ; les couples titre+corps
  // gardent une police de TITRE à caractère et un CORPS confortable.
  ebGaramond: {
    id: 'ebGaramond',
    nom: 'Garamond',
    description: 'EB Garamond — garalde humaniste, titres et corps.',
    titre: 'var(--font-eb-garamond), Georgia, "Times New Roman", serif',
    corps: 'var(--font-eb-garamond), Georgia, "Times New Roman", serif',
  },
  spectral: {
    id: 'spectral',
    nom: 'Spectral',
    description: 'Spectral — serif d’écran à faible contraste.',
    titre: 'var(--font-spectral), Georgia, "Times New Roman", serif',
    corps: 'var(--font-spectral), Georgia, "Times New Roman", serif',
  },
  libreBaskerville: {
    id: 'libreBaskerville',
    nom: 'Baskerville',
    description: 'Libre Baskerville — serif transitionnel robuste.',
    titre: 'var(--font-libre-baskerville), Georgia, "Times New Roman", serif',
    corps: 'var(--font-libre-baskerville), Georgia, "Times New Roman", serif',
  },
  playfair: {
    id: 'playfair',
    nom: 'Playfair',
    description: 'Playfair Display aux titres, EB Garamond au corps.',
    titre: 'var(--font-playfair), Georgia, "Times New Roman", serif',
    corps: 'var(--font-eb-garamond), Georgia, "Times New Roman", serif',
  },
  prata: {
    id: 'prata',
    nom: 'Prata',
    description: 'Prata aux titres (didone), Spectral au corps.',
    titre: 'var(--font-prata), Georgia, "Times New Roman", serif',
    corps: 'var(--font-spectral), Georgia, "Times New Roman", serif',
  },
  atkinson: {
    id: 'atkinson',
    nom: 'Atkinson',
    description: 'Atkinson Hyperlegible — sans-serif d’accessibilité.',
    titre: 'var(--font-atkinson), "Segoe UI", Arial, sans-serif',
    corps: 'var(--font-atkinson), "Segoe UI", Arial, sans-serif',
  },
};

export const ORDRE_TYPOS: TypoId[] = [
  // Les 3 typographies d'origine (inchangées), puis les ajouts.
  'plume',
  'velin',
  'native',
  'ebGaramond',
  'spectral',
  'libreBaskerville',
  'playfair',
  'prata',
  'atkinson',
];
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
