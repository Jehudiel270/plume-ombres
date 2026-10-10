# Licences des typographies auto-hébergées

Ce dossier `app/fonts/` ne contient que des polices **libres**, chargées
en local via `next/font/local` (voir `lib/polices.ts`) : **aucun CDN de
polices n'est contacté à l'exécution**. Le catalogue complet (rôle, clef
d'export, fichiers) vit dans `lib/polices-familles.ts`, et
`scripts/test-polices.ts` vérifie que ce document, ce catalogue, le code
et les fichiers sur le disque restent d'accord.

- **Licence commune :** SIL Open Font License 1.1 (OFL-1.1), texte
  intégral fourni par chaque paquet source.
- **Sous-ensemble embarqué :** subset **latin** (couvre le français :
  accès, `é à ç ù ê ï ô`, ligatures `œ / Œ`, guillemets).
- **Total sur disque :** 22 fichiers — **743 440 octets (726,0 Ko)**.

## 1. Familles (nom exact, version, auteur, licence, source)

| Famille (nom exact) | Version / provenance des fichiers | Auteur (titulaire des droits) | Licence | URL source | Poids total |
| --- | --- | --- | --- | --- | --- |
| Bodoni Moda | Google Fonts — variable 400→900, subset latin (`scripts/telecharger-polices.py`) | The Bodoni Moda Project Authors | SIL Open Font License 1.1 | https://github.com/indestructible-type/Bodoni | 100 016 o (97,7 Ko) |
| Literata | Google Fonts — variable 200→900, subset latin (`scripts/telecharger-polices.py`) | The Literata Project Authors | SIL Open Font License 1.1 | https://github.com/googlefonts/literata | 223 260 o (218,0 Ko) |
| Cormorant Garamond | Google Fonts — variable 300→700, subset latin (`scripts/telecharger-polices.py`) | The Cormorant Project Authors | SIL Open Font License 1.1 | https://github.com/CatharsisFonts/Cormorant | 76 900 o (75,1 Ko) |
| EB Garamond | @fontsource/eb-garamond 5.3.0 — subset latin | The EB Garamond Project Authors | SIL Open Font License 1.1 | https://github.com/octaviopardo/EBGaramond12 | 74 500 o (72,8 Ko) |
| Spectral | @fontsource/spectral 5.3.0 — subset latin | The Spectral Project Authors (Production Type) | SIL Open Font License 1.1 | https://github.com/productiontype/Spectral | 67 444 o (65,9 Ko) |
| Libre Baskerville | @fontsource/libre-baskerville 5.3.0 — subset latin | The Libre Baskerville Project Authors | SIL Open Font License 1.1 | https://github.com/impallari/Libre-Baskerville | 62 108 o (60,7 Ko) |
| Playfair Display | @fontsource/playfair-display 5.3.0 — subset latin | The Playfair Display Project Authors | SIL Open Font License 1.1 | https://github.com/clauseggers/Playfair-Display | 66 964 o (65,4 Ko) |
| Prata | @fontsource/prata 5.3.0 — subset latin | The Prata Project Authors (Cyreal) | SIL Open Font License 1.1 | https://github.com/cyrealtype/Prata | 19 224 o (18,8 Ko) |
| Atkinson Hyperlegible | @fontsource/atkinson-hyperlegible 5.3.0 — subset latin | Braille Institute of America, Inc. | SIL Open Font License 1.1 | https://github.com/googlefonts/atkinson-hyperlegible | 53 024 o (51,8 Ko) |

**Détail des droits (ligne de copyright des fichiers de licence) :**

- Bodoni Moda — « Copyright 2020 The Bodoni Moda Project Authors ».
- Literata — « Copyright 2017 The Literata Project Authors ».
- Cormorant Garamond — « Copyright 2015 The Cormorant Project Authors ».
- EB Garamond — « Copyright 2017 The EB Garamond Project Authors ».
- Spectral — « Copyright 2017 The Spectral Project Authors ».
- Libre Baskerville — « Copyright 2012 The Libre Baskerville Project Authors ».
- Playfair Display — « Copyright 2017 The Playfair Display Project Authors »
  (Reserved Font Name « Playfair Display »).
- Prata — « Copyright 2011 The Prata Project Authors (contact@cyreal.org) ».
- Atkinson Hyperlegible — « Copyright 2020 Braille Institute of America, Inc. ».

## 2. Fichiers `.woff2` (poids exact de chaque fichier)

| Fichier | Famille | Style / graisse | Poids (octets) |
| --- | --- | --- | --- |
| BodoniModa-normal.woff2 | Bodoni Moda | normal, 400→900 | 46 260 |
| BodoniModa-italic.woff2 | Bodoni Moda | italique, 400→900 | 53 756 |
| Literata-normal.woff2 | Literata | normal, 200→900 | 110 080 |
| Literata-italic.woff2 | Literata | italique, 200→900 | 113 180 |
| CormorantGaramond-normal.woff2 | Cormorant Garamond | normal, 300→700 | 37 640 |
| CormorantGaramond-italic.woff2 | Cormorant Garamond | italique, 300→700 | 39 260 |
| EBGaramond-normal.woff2 | EB Garamond | normal, 400 | 23 820 |
| EBGaramond-700.woff2 | EB Garamond | normal, 700 | 25 292 |
| EBGaramond-italic.woff2 | EB Garamond | italique, 400 | 25 388 |
| Spectral-normal.woff2 | Spectral | normal, 400 | 21 696 |
| Spectral-700.woff2 | Spectral | normal, 700 | 23 036 |
| Spectral-italic.woff2 | Spectral | italique, 400 | 22 712 |
| LibreBaskerville-normal.woff2 | Libre Baskerville | normal, 400 | 20 108 |
| LibreBaskerville-700.woff2 | Libre Baskerville | normal, 700 | 20 436 |
| LibreBaskerville-italic.woff2 | Libre Baskerville | italique, 400 | 21 564 |
| PlayfairDisplay-normal.woff2 | Playfair Display | normal, 400 | 21 856 |
| PlayfairDisplay-700.woff2 | Playfair Display | normal, 700 | 23 224 |
| PlayfairDisplay-italic.woff2 | Playfair Display | italique, 400 | 21 884 |
| Prata-normal.woff2 | Prata | normal, 400 | 19 224 |
| AtkinsonHyperlegible-normal.woff2 | Atkinson Hyperlegible | normal, 400 | 17 208 |
| AtkinsonHyperlegible-700.woff2 | Atkinson Hyperlegible | normal, 700 | 17 524 |
| AtkinsonHyperlegible-italic.woff2 | Atkinson Hyperlegible | italique, 400 | 18 292 |

## 3. Performance — poids ajouté par le chantier typographie

Les 6 familles ajoutées pèsent **343 264 octets (335,2 Ko)** sur disque.
Elles ne sont **jamais préchargées** (`preload: false` dans
`lib/polices.ts`) : seules les familles par défaut (Bodoni Moda, Literata)
le sont. Un visiteur qui n'ouvre pas le sélecteur ne télécharge donc
**aucun** de ces fichiers ; chacun ne part qu'au moment où l'utilisateur
choisit la famille (chargement à la demande).

| Famille ajoutée | Octets | Ko |
| --- | --- | --- |
| EB Garamond | 74 500 | 72,8 |
| Spectral | 67 444 | 65,9 |
| Libre Baskerville | 62 108 | 60,7 |
| Playfair Display | 66 964 | 65,4 |
| Prata | 19 224 | 18,8 |
| Atkinson Hyperlegible | 53 024 | 51,8 |
| **Total ajouté** | **343 264** | **335,2** |

## 4. Conformité

- Contrainte de licence : **SIL OFL 1.1, Apache 2.0 ou domaine public
  uniquement** → les 9 familles sont sous **SIL OFL 1.1**. Le texte
  intégral de la licence accompagne chaque paquet source (fichier
  `LICENSE` de `@fontsource/<famille>@5.3.0`, ou copie conservée pour les
  trois familles d'origine téléchargées depuis Google Fonts).
- Aucune police propriétaire n'est embarquée ni référencée.
- Aucun appel réseau vers un CDN de polices au runtime : tous les
  fichiers sont servis depuis notre domaine.

_Vérification automatique : `npx tsx scripts/test-polices.ts`._
