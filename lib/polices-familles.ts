// ============================================================
// polices-familles.ts — CATALOGUE des familles auto-hébergées.
//
// Source de vérité UNIQUE des métadonnées typographiques :
//   · nom exact de la famille,
//   · auteur / détenteur des droits (ligne de copyright),
//   · licence et version de provenance,
//   · URL source,
//   · fichiers .woff2 déposés dans app/fonts/.
//
// Ce fichier est PUR (aucun import de `next/font/local`) afin
// d'être lisible par Node/tsx SANS le runtime Next : c'est lui
// que `scripts/test-polices.ts` interroge pour vérifier, disque
// à l'appui, que le catalogue, `lib/polices.ts` et
// `app/fonts/LICENCES.md` restent d'accord (pièce juridique).
//
// Ajouter une famille = ajouter une entrée ICI, déclarer le
// localFont correspondant dans lib/polices.ts, exposer la famille
// au lecteur (lib/lecture.ts) et à l'apparence (lib/theme.ts), et
// ajouter la ligne dans app/fonts/LICENCES.md. Le test échoue au
// moindre désaccord.
// ============================================================

/** Nature d'usage de la famille dans le produit de lecture. */
export type RolePolice = 'texte' | 'titre' | 'texte+titre';

export interface FamillePolice {
  /** Identifiant interne = nom de l'export `localFont` dans lib/polices.ts. */
  cle: string;
  /** Nom EXACT de la famille typographique (tel qu'attendu dans LICENCES.md). */
  nom: string;
  /** Détenteur des droits (ligne de copyright de la licence). */
  auteur: string;
  /** Licence SPDX / libellé exact. */
  licence: string;
  /** Version de provenance indiquée dans LICENCES.md. */
  version: string;
  /** URL source des fichiers (dépôt ou registre). */
  source: string;
  /** Usage prévu dans le produit. */
  role: RolePolice;
  /** Noms des fichiers .woff2 dans app/fonts/ (auto-hébergés). */
  fichiers: string[];
}

/** Les 3 familles d'ORIGINE — jamais retirées (rétrocompatibilité). */
export const FAMILLES_ORIGINE: readonly string[] = [
  'bodoniModa',
  'literata',
  'cormorantGaramond',
];

/**
 * Les 6 familles AJOUTÉES (Chantier typographie) — unies aux
 * trois d'origine, elles forment le catalogue complet.
 */
export const FAMILLES_AJOUTEES: readonly string[] = [
  'ebGaramond',
  'spectral',
  'libreBaskerville',
  'playfairDisplay',
  'prata',
  'atkinsonHyperlegible',
];

/**
 * Catalogue complet : D'ABORD les 3 familles d'origine, PUIS les
 * 6 ajouts. L'ordre est stable (le test le vérifie).
 */
export const FAMILLES_POLICES: readonly FamillePolice[] = [
  // ---------------- Familles d'origine (inchangées) ----------------
  {
    cle: 'bodoniModa',
    nom: 'Bodoni Moda',
    auteur: 'The Bodoni Moda Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: 'Google Fonts — variable 400→900, sous-ensemble latin',
    source: 'https://github.com/indestructible-type/Bodoni',
    role: 'titre',
    fichiers: ['BodoniModa-normal.woff2', 'BodoniModa-italic.woff2'],
  },
  {
    cle: 'literata',
    nom: 'Literata',
    auteur: 'The Literata Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: 'Google Fonts — variable 200→900, sous-ensemble latin',
    source: 'https://github.com/googlefonts/literata',
    role: 'texte',
    fichiers: ['Literata-normal.woff2', 'Literata-italic.woff2'],
  },
  {
    cle: 'cormorantGaramond',
    nom: 'Cormorant Garamond',
    auteur: 'The Cormorant Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: 'Google Fonts — variable 300→700, sous-ensemble latin',
    source: 'https://github.com/CatharsisFonts/Cormorant',
    role: 'texte',
    fichiers: [
      'CormorantGaramond-normal.woff2',
      'CormorantGaramond-italic.woff2',
    ],
  },
  // ---------------- Ajouts (6 familles libres) ----------------
  {
    cle: 'ebGaramond',
    nom: 'EB Garamond',
    auteur: 'The EB Garamond Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/eb-garamond 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/octaviopardo/EBGaramond12',
    role: 'texte',
    fichiers: [
      'EBGaramond-normal.woff2',
      'EBGaramond-italic.woff2',
      'EBGaramond-700.woff2',
    ],
  },
  {
    cle: 'spectral',
    nom: 'Spectral',
    auteur: 'The Spectral Project Authors (Production Type)',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/spectral 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/productiontype/Spectral',
    role: 'texte',
    fichiers: [
      'Spectral-normal.woff2',
      'Spectral-italic.woff2',
      'Spectral-700.woff2',
    ],
  },
  {
    cle: 'libreBaskerville',
    nom: 'Libre Baskerville',
    auteur: 'The Libre Baskerville Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/libre-baskerville 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/impallari/Libre-Baskerville',
    role: 'texte',
    fichiers: [
      'LibreBaskerville-normal.woff2',
      'LibreBaskerville-italic.woff2',
      'LibreBaskerville-700.woff2',
    ],
  },
  {
    cle: 'playfairDisplay',
    nom: 'Playfair Display',
    auteur: 'The Playfair Display Project Authors',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/playfair-display 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/clauseggers/Playfair-Display',
    role: 'titre',
    fichiers: [
      'PlayfairDisplay-normal.woff2',
      'PlayfairDisplay-italic.woff2',
      'PlayfairDisplay-700.woff2',
    ],
  },
  {
    cle: 'prata',
    nom: 'Prata',
    auteur: 'The Prata Project Authors (Cyreal)',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/prata 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/cyrealtype/Prata',
    role: 'titre',
    fichiers: ['Prata-normal.woff2'],
  },
  {
    cle: 'atkinsonHyperlegible',
    nom: 'Atkinson Hyperlegible',
    auteur: 'Braille Institute of America, Inc.',
    licence: 'SIL Open Font License 1.1',
    version: '@fontsource/atkinson-hyperlegible 5.3.0 — sous-ensemble latin',
    source: 'https://github.com/googlefonts/atkinson-hyperlegible',
    role: 'texte',
    fichiers: [
      'AtkinsonHyperlegible-normal.woff2',
      'AtkinsonHyperlegible-italic.woff2',
      'AtkinsonHyperlegible-700.woff2',
    ],
  },
];

/** Renvoie la famille du catalogue par sa clef (ou undefined). */
export function familleParCle(cle: string): FamillePolice | undefined {
  return FAMILLES_POLICES.find((f) => f.cle === cle);
}
