# Pipeline de traduction — Plume d'Ombres

État vérifié le 2026-11-03.

## Où se fait quoi

| Étape | Où | Code |
| --- | --- | --- |
| Import PDF / EPUB | navigateur | `lib/pdf-navigateur.ts` (pdf.js), `lib/import-epub.ts` (jszip), tous deux chargés à la demande |
| Découpage en chapitres | navigateur | `lib/import-livre.ts`, `lib/segmenter.ts` |
| Découpage en segments | navigateur | `lib/useMoteurTraduction.ts` → `POST /api/translate/lot` |
| Traduction | serveur | `app/api/translate/lot/route.ts`, `lib/traduction/lot.ts`, `lib/providers/*` |
| Progression / reprise | serveur (table `segments`) | `app/api/translate/travail/route.ts`, `lib/travaux-traduction.ts` |

Le texte ne part pas en un bloc : il est découpé en **segments** de 6 000
caractères au maximum, envoyés par **lots de 40 segments / 20 000 caractères**,
avec au plus **8 lots en parallèle** (`CONCURRENCE_LOT`).

## Reprise et double moteur

- Chaque segment traduit est écrit en base : fermer l'onglet ne perd rien,
  la traduction reprend au premier segment manquant.
- Un segment en cours de traitement a un `updated_at` récent : un second
  onglet ou appareil ne le reprend pas, il avance sur les autres.
- Les fournisseurs (`lib/providers/index.ts`) sont appelés dans l'ordre des
  clés disponibles, avec repli automatique si l'un échoue ou sature.

## Titres de chapitres

Les titres viennent de la détection au moment de l'import :

- **PDF** : lignes de titre reconnues dans le texte (numérotation, mots-clés).
- **EPUB** : balise `<h1>/<h2>` si présente, sinon **le titre écrit en clair**
  dans le fragment (`Chapter One`, `Prologue`…), en-tête courant du livre
  ignoré. Un fragment sans titre est numéroté séquentiellement (1, 2, 3…),
  jamais d'après sa position dans le spine.

Les livres importés avant la correction du 2026-11-03 se réparent avec
`npx tsx scripts/reparer-titres-chapitres.ts [--appliquer]`.
