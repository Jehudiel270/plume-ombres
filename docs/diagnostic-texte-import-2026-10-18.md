# Diagnostic — texte anglais absent à l'import & compteur de caractères (2026-10-18)

**Verdict** : une seule cause racine explique les deux symptômes. Depuis le commit `469a428` (B1, 2 oct.),
l'import n'écrit plus `chapitres.texte_source`, alors que la page livre continue de lire cette colonne.

## 1. Chemin d'import (fichier → écran)
- `components/ZoneImport.tsx:39-65` lecture txt/md/pdf · `:81-95` EPUB (`lib/import-epub.ts:203`) ·
  `:120-131` insert `livres` · `:148-155` insert `chapitres` · `:158-169` insert `segments` (lots de 400) · `:174-186` statut `pret`
- Segmentation : `lib/import-livre.ts:91-116` (`assemblage`) → `lib/segmenter.ts:50-103` (paragraphes + `suite` = espacement exact,
  éclatement `:142-189`), plafond 6 000 car./segment (`import-livre.ts:19`)
- Traduction : `lib/useMoteurTraduction.ts:608-801` (`lancer`) → `:334-463` (`envoyerPaquet`, 20 segments / 18 000 car., `:300-324`)
  → `POST /api/translate/lot` (`app/api/translate/lot/route.ts:42-197` → `lib/traduction/lot.ts:176-258`, `:595-647` ;
  regroupement `lib/traduction/groupes.ts:77-125`, découpage sûr `:169-212`)
- Persistance : `segments.statut/traduit` (`useMoteurTraduction.ts:419-435`), `chapitres.texte_traduit` (`:599-603`),
  reprise serveur/cron `app/api/translate/travail/route.ts:200-300, 375-396`

## 2. Cause du texte anglais absent (prouvée)
- `lib/import-livre.ts:8-9,39` : `texte_source` déprécié, **plus jamais alimenté** ; `:96-108` ne renvoie que `segments`.
- `components/ZoneImport.tsx:153` insère `texte_source: chapitre.texte_source` → `undefined` → clé omise par JSON →
  défaut SQL `''` (`supabase/migrations/20260903000001_schema.sql:57`). Aucune erreur levée : panne **silencieuse**.
- Lecture toujours sur cette colonne : `components/EspaceLivre.tsx:658-663` (vue « source » par défaut, `:86`) →
  `components/lecteur/Lecteur.tsx:437-439` affiche « Ce chapitre est vide. » → le texte anglais ne vient jamais.
- Effets de bord : exports `components/lecteur/useExports.ts:55,82`, `lib/export-fidele.ts:123` (chapitres filtrés),
  `lib/pdf-fidele.ts:325`, glossaire `lib/glossaire.ts:605-609`, repères `app/livres/[id]/page.tsx:109-111`.
- Aucun repli « original » côté moteur : `lib/providers/fallback.ts:394-486` lève `ErreurChaineSecours`, un segment vide est un échec
  (`lib/traduction/lot.ts:483-485`, `useMoteurTraduction.ts:411-417`). Le manque vient de l'affichage, pas de la traduction.

## 3. Compteurs de caractères — inventaire (visibilité réelle)
- `components/lecteur/CommandesTraduction.tsx:136-157` : « N segments · N caractères à traduire » + « ≈ X min (d'après N car/s mesurés) ».
  **Visible**, ajouté le 17/10 (`46f95ad`). Le compteur est voulu (quota facturé au caractère) ; la mention `car/s mesurés` est un détail interne à retirer.
- `components/ComplementCredits.tsx:68-80` : « Taille du livre / solde / déficit » en caractères → **jamais affiché** :
  `app/livres/[id]/page.tsx:68-72` calcule `totalCaracteres` depuis `texte_source` (= 0) → `lib/credits-manquants.ts:129-130`
  (`necessaire = false`) → `ComplementCredits.tsx:39 return null`. C'est le chiffre « qui manque ».
- `components/lecteur/BarreActions.tsx:78-82` : « ⏱ ~1 min » → visible et **faux** : `lib/useLecture.ts:167` +
  `lib/stats.ts:92-99` (plancher 1 min) appliqués à 0 caractère. Toute la durée de lecture est inventée.
- Légitimes (produit) : `components/JaugeQuota.tsx:185-188`, `AbonnementCredits.tsx:64`, `abonnement/CarteOffre.tsx:45`, `app/abonnement/page.tsx:174`, `app/(public)/tarifs/page.tsx:143`, `ReglagesLecture.tsx:492`.
- Aucun reste de debug à proprement parler (pas de compteur console/testid exposé).

## 4. Correctif proposé
1. `lib/import-livre.ts:96-108` : réintroduire `texte_source: c.texte` dans l'objet `ChapitrePret` → `ZoneImport.tsx:153` réécrit
   la colonne. Une ligne, alignée sur la décision P0.10 « on conserve le stockage » (`TACHES-RESTANTES.md:127`) ; répare d'un coup
   lecture source, exports, glossaire, repères et `totalCaracteres`.
2. `app/livres/[id]/page.tsx:68-72` : garde-fou — si `totalCaracteres === 0`, le recalculer depuis les segments (RPC `metriques`, `20261002000003_allegement_chapitres.sql:51`) au lieu de laisser « ~1 min » et le bandeau muets.
3. `CommandesTraduction.tsx:149-153` : supprimer « d'après N car/s mesurés », garder seulement la durée.

## 5. Questions à Carrel
1. Écran exact du symptôme : la page livre `/livres/[id]` juste après import (texte vide), ou la zone d'import elle-même ?
2. Le « nombre de caractères » vu : est-ce « N caractères à traduire » au-dessus de « Traduire ce chapitre », ou un chiffre
   qui devrait être là (taille du livre dans le bandeau de crédits) et qui manque ?
3. Le livre concerné a-t-il été importé après le 2 octobre ? Les livres plus anciens ont encore `texte_source` rempli et s'affichent normalement.

---

## 6. Résolu le 27/10/2026 — correctifs appliqués et mesurés

| Correctif | Fichier | Preuve |
|---|---|---|
| `texte_source: c.texte` réécrit à l'import, champ redevenu **requis** (un oubli casse le typecheck) | `lib/import-livre.ts` | `lib/import-livre.test.ts` : 5 tests verts, égalité stricte `texte_source === segments.map(source + suite).join('')` |
| Garde-fou du compteur : colonne vide détectée → total relu depuis les segments (RPC `metriques_chapitres`), tolérant | `app/livres/[id]/page.tsx` | repli paginé par 1 000 (PostgREST plafonne à 1 000 lignes) |
| Mention interne « d'après N car/s mesurés » retirée | `components/lecteur/CommandesTraduction.tsx` | seule la durée reste affichée |
| **Réparation des livres déjà importés** : `texte_source` reconstitué depuis les segments (même règle que `reconstituer_source`) | `supabase/migrations/20261027000001_reparer_texte_source.sql` | appliqué : **578 chapitres** réparés sur 791, **13 482 582** caractères restitués, 1 seul chapitre encore vide (chapitre réellement sans texte), égalité stocké/reconstruit **5/5** |

Contrôle rejouable : `node --env-file=.env.local scripts/verif-reparation-texte-source.mjs`.

