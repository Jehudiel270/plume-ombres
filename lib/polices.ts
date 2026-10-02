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

/** Classes à poser sur <html> pour exposer les variables de police. */
export const CLASSES_POLICES = [
  bodoniModa.variable,
  literata.variable,
  cormorantGaramond.variable,
].join(' ');
