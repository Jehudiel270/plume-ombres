// ============================================================
// polices.ts — Typographies AUTO-HÉBERGÉES via next/font/local.
//
// Aucun CDN tiers n'est requis au runtime : les fichiers .woff2
// vivent dans app/fonts/ et sont servis depuis notre propre domaine.
// Polices libres sous SIL Open Font License 1.1 :
//   · Bodoni Moda        — titres (didone à fort contraste)
//   · Literata           — corps de lecture (conçue pour l'écran)
//   · Cormorant Garamond — variante de lecture plus calligraphique
//
// Les fichiers « latin » couvrent le français (œ/Œ, accents,
// guillemets) — voir le sous-ensemble unicode-range U+0000-00FF.
// ============================================================

import localFont from 'next/font/local';

/** Titres : Bodoni Moda (variable 400→900, romain + italique). */
export const bodoniModa = localFont({
  src: [
    {
      path: '../app/fonts/BodoniModa-normal.woff2',
      weight: '400 900',
      style: 'normal',
    },
    {
      path: '../app/fonts/BodoniModa-italic.woff2',
      weight: '400 900',
      style: 'italic',
    },
  ],
  variable: '--font-bodoni',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Corps : Literata (variable 200→900, romain + italique) — défaut. */
export const literata = localFont({
  src: [
    {
      path: '../app/fonts/Literata-normal.woff2',
      weight: '200 900',
      style: 'normal',
    },
    {
      path: '../app/fonts/Literata-italic.woff2',
      weight: '200 900',
      style: 'italic',
    },
  ],
  variable: '--font-literata',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Variante de lecture : Cormorant Garamond (chargée à la demande). */
export const cormorantGaramond = localFont({
  src: [
    {
      path: '../app/fonts/CormorantGaramond-normal.woff2',
      weight: '300 700',
      style: 'normal',
    },
    {
      path: '../app/fonts/CormorantGaramond-italic.woff2',
      weight: '300 700',
      style: 'italic',
    },
  ],
  variable: '--font-cormorant',
  display: 'swap',
  // Non préchargée : ne pèse rien tant que l'utilisateur ne la choisit pas.
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

// ============================================================
// AJOUTS (Chantier typographie) — 6 familles libres de plus,
// choisies pour la VARIÉTÉ réelle qu'elles apportent à un
// produit de lecture : serif humaniste (EB Garamond), serif
// d'écran à faible contraste (Spectral), serif transitionnel
// robuste (Libre Baskerville), display à fort contraste
// (Playfair Display), didone élégant (Prata) et sans-serif
// d'accessibilité (Atkinson Hyperlegible).
//
// Toutes sont sous SIL OFL 1.1, couvrent le latin (accents
// français, œ/Œ), vivent dans app/fonts/ et ne sont JAMAIS
// préchargées (preload: false) : seule la famille par défaut
// (Literata) est préchargée — les autres se chargent à la
// demande, au moment où l'utilisateur les choisit.
// Voir le catalogue et les licences dans lib/polices-familles.ts
// et app/fonts/LICENCES.md.
// ============================================================

/** Texte : EB Garamond (garalde humaniste, très lisible). */
export const ebGaramond = localFont({
  src: [
    {
      path: '../app/fonts/EBGaramond-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../app/fonts/EBGaramond-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../app/fonts/EBGaramond-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-eb-garamond',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Texte : Spectral (serif d'écran à faible contraste). */
export const spectral = localFont({
  src: [
    {
      path: '../app/fonts/Spectral-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../app/fonts/Spectral-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../app/fonts/Spectral-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-spectral',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Texte : Libre Baskerville (serif transitionnel robuste). */
export const libreBaskerville = localFont({
  src: [
    {
      path: '../app/fonts/LibreBaskerville-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../app/fonts/LibreBaskerville-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../app/fonts/LibreBaskerville-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-libre-baskerville',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Titre : Playfair Display (display transitionnel à fort contraste). */
export const playfairDisplay = localFont({
  src: [
    {
      path: '../app/fonts/PlayfairDisplay-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../app/fonts/PlayfairDisplay-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../app/fonts/PlayfairDisplay-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-playfair',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Titre : Prata (didone élégant, romain seul). */
export const prata = localFont({
  src: [
    {
      path: '../app/fonts/Prata-normal.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-prata',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/** Texte : Atkinson Hyperlegible (sans-serif d'accessibilité). */
export const atkinsonHyperlegible = localFont({
  src: [
    {
      path: '../app/fonts/AtkinsonHyperlegible-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../app/fonts/AtkinsonHyperlegible-700.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../app/fonts/AtkinsonHyperlegible-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-atkinson',
  display: 'swap',
  preload: false,
  fallback: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

/** Classes à poser sur <html> pour exposer les variables de police. */
export const CLASSES_POLICES = [
  bodoniModa.variable,
  literata.variable,
  cormorantGaramond.variable,
  ebGaramond.variable,
  spectral.variable,
  libreBaskerville.variable,
  playfairDisplay.variable,
  prata.variable,
  atkinsonHyperlegible.variable,
].join(' ');
