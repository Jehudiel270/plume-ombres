# Plume d'Ombres — Inventaire des composants réutilisables entre projets Carrel

> Rapport d'inventaire, 1er octobre 2026. Périmètre : `C:\Users\dosso\dev\` + `C:\Users\dosso\Documents\` + `C:\Users\dosso\Desktop\`.
> Méthode : `find`/`grep` sur tous les `package.json`, `*.tsx`, `*.jsx`, `*.vue` hors `node_modules`, `.next`, `dist`, `build`.
> Fichiers livrés : `components/importe/` (namespace isolé, **aucun import depuis une page**).
> Statut git : **aucun commit, aucune branche créée** (le dépôt cible est partagé avec 6 agents en parallèle ; branche courante `chantier-ux-pages`, HEAD 79db83e).

---

## 1. Projets scannés et stacks

| Projet | Chemin | Framework | React | UI lib | Rôle |
|---|---|---|---|---|---|
| **dark-romance-translator** (cible) | `dev/dark-romance-translator` | Next 16.3.4 (App Router) | 19.2.8 | Tailwind v4 (`@theme`), lucide-react ^1.41, next-pwa | Plume d'Ombres |
| **afristack** | `dev/afristack` | Next 16.3.4 (App Router) | 19.2.8 | Tailwind v4, lucide-react ^1.41, @supabase/ssr ^0.12.5 | Starter SaaS Mobile Money — **le seul vrai gisement** |
| **cheetah-speed-presentation** | `Desktop/application` (+ `application - Copie`, identique au bit) | Vite 4.4 | 18.2 | Tailwind **3.3**, lucide-react ^0.263 | Deck de slides autonome |
| `Downloads/page.tsx` | `Downloads/` | — (fichier isolé) | — | shadcn/ui + framer-motion | **Démo shadcn téléchargée** (code tiers) |
| `dev/tools` | `dev/tools` | — | — | — | zip gh CLI + LICENSE tiers → rien |
| `dev/sauvegarde-orphelins` | `dev/sauvegarde-orphelins` | Next **Pages Router** | — | formidable v1 | route upload obsolète (18 l) |
| `Documents/*` (`html`, `dark romance`, `haruneko`, `miru`, `Force-N`, `pixel_art`…) | `Documents/` | **aucun projet front** | — | — | HTML d'exercice, PDF, données d'outils média |

**Verdict du scan** : il n'existe que **2 projets front réellement minables** (afristack, cheetah-speed) + 1 fichier tiers à écarter. Aucun shadcn/ui, aucun Radix, aucun Framer Motion, aucun composant tiers sous licence dans les projets de Carrel — **tout le code candidat appartient à Carrel** (afristack = dépôt `github.com/Jehudiel270/afristack`, commit `c17716c`).

**Écartés et pourquoi**
- `Downloads/page.tsx` (421 l) : démo shadcn importée (`@/components/ui/{card,field,input,button}`, `@/hooks/use-age-gender-model`, `framer-motion`) → **code tiers** ET dépendances absentes.
- `dev/sauvegarde-orphelins/upload.ts.depuis-src-pages` : `NextApiRequest` + `new formidable.IncomingForm()` (API formidable v1, alors que le cible est en formidable ^3) → inutilisable sous App Router.
- `Desktop/application - Copie` : doublon octet-pour-octet (vérifié `diff -rq`).
- `dev/afristack/app/page.tsx` (landing) : redondant — le cible a déjà `app/(public)/page.tsx` + `NavPublique`/`PiedPublique`/`SectionPublique`/`BandeauGabarit`.
- `dev/afristack/app/layout.tsx` : 20 l, thème différent, aucune valeur.

---

## 2. Composants réellement réutilisables (chemin source → usage proposé → adaptations)

| # | Source (Carrel) | Contenu | Usage proposé dans Plume d'Ombres | Adaptations nécessaires | Copié ? |
|---|---|---|---|---|---|
| 1 | `afristack/components/PaiementForm.tsx` (103 l) | Formulaire Mobile Money : téléphone → `POST /api/paiement` → redirection, + **mode « vérifier mon paiement »** (retour de paiement) | **P0.9** paiement / abonnement : lancement + écran de reprise après retour du fournisseur | Renommer en `PaiementMobileMoney` ; classes à retoucher : `carte`→`velours`, `champ`→`champ-sombre`, `bouton-or`→`bouton-principal`, `text-[var(--or-vif)]`→`text-grenat-400` ; créer la route `/api/paiement` | **oui** |
| 2 | `afristack/app/connexion/page.tsx` (112 l) | Bascule **inscription ⇄ connexion**, erreurs Supabase affichées, état de chargement | **P1.4** flux auth (le cible n'a qu'un écran de connexion sans bascule) | Aucun import manquant (`@/lib/supabase/client` + `creerClientNavigateur` existent déjà à l'identique) ; `routeur.push('/tableau-de-bord')` → `/bibliotheque` ; libellés crédits à ajuster | **oui** |
| 3 | `Desktop/application/src/App.jsx` (598 l) | Deck de slides : état + `useState`, **navigation clavier ← →**, boutons, grille de cartes d'arguments | Landing/diapo de présentation du concept (C4) ou carrousel d'onboarding | Ajouter `'use client'` ; palette bleu/jaune → nuit/grenat ; icônes lucide déjà disponibles | **oui** |
| 4 | `afristack/app/globals.css` (162 l) | Utilitaires + tokens : `.pastille`/`.pastille-or`/`.pastille-verte` (badges), `.etiquette` (label capitales), `.carte`, `.bouton-or`, `.champ`, animations `monter`/`pouls` | **Badges de statut** (chapitre en erreur, abo actif), **labels de formulaire**, cartes KPI | Le cible a déjà `velours`/`bouton-principal`/`champ-sombre` : **récolter uniquement `.pastille*`, `.etiquette` et l'idée des keyframes**, en réécrivant les couleurs avec les tokens `--color-grenat-*` / `--color-nuit-*`. Ne pas importer le fichier tel quel | **oui (référence `.css.reference`, non compilée)** |
| 5 | `afristack/app/tarifs/page.tsx` (69 l) | Grille de 3 plans + pastille « Le plus choisi » + listes d'avantages | Gabarit de la future grille tarifaire | **Non copié** : dépend de `@/lib/types` (`PLANS`) et `@/lib/paiement` (`paiementConfigure`), absents du cible. Le cible a déjà `app/(public)/tarifs/page.tsx` (125 l) — utiliser celui-ci | non |
| 6 | `afristack/app/tableau-de-bord/page.tsx` (157 l) | Grille **cartes KPI** (3 col) + **liste/tableau d'historique** avec états de statut colorés + **état vide** (« Aucun paiement pour l'instant ») | **P0.2/P0.9** : espace compte (crédits, plan, historiques de traductions/paiements) ; le motif « tableau + état vide » manque totalement au cible | **Non copié** : dépend de `@/lib/types` (`PLANS`, `planParId`) + `supabaseConfigure()` (absent de `lib/supabase/server.ts`). À porter à la main, en réutilisant les classes `carte`/`etiquette` | non |

Règle appliquée : seuls les fichiers **copiables tels quels** (aucun import manquant, code 100 % Carrel) ont été copiés. Les #5 et #6 sont d'excellents **gabarits** mais exigent de réécrire la couche données → ils restent en référence ici.

---

## 3. Ce qui manque partout et devra être écrit dans Plume d'Ombres

Vérifié par `grep` sur tout le dépôt cible (hors `components/importe/`) : **aucune** occurrence de toast / modal / drawer / skeleton / état vide / tableau.

1. **Toasts / notifications** — rien, nulle part. Nécessaire pour **P1.2** (fin de traduction) et les retours d'action asynchrones. afristack utilise un simple `<p>` de message : pas de système.
2. **Modale / drawer de confirmation** — rien. Nécessaire pour la suppression de livre et **P0.6** (suppression de compte). C3 (tiroir de chapitres mobile) est fait à la main dans le cible.
3. **Skeletons de chargement** — `app/loading.tsx` (43 l) existe mais c'est un état plein-page, pas un composant de squelette réutilisable (grille de cartes, liste de chapitres).
4. **État vide réutilisable** — le seul état vide du projet est une phrase inline dans `BibliothequeClient.tsx` (tâche C5 « états vides soignés » toujours ouverte).
5. **Tableau / liste d'historique** — inexistant ; le seul motif proche est dans `afristack` (§2 #6).
6. **Badge / pastille de statut** — aucun équivalent des tokens du cible ; à écrire en `.pastille` adaptée (§2 #4).
7. **Compteur de quota / crédits** — **P0.2**, aucune carte KPI ni jauge dans le cible.
8. **Pages résultat de paiement succès / échec** — **P0.9** ; le gabarit existe dans afristack (`PaiementForm` mode vérification + statut) mais le cible n'a ni fournisseur de paiement, ni `lib/paiement/*`, ni `lib/types.ts` (côté afristack).
9. **Primitives UI génériques** (bouton/carte/champ en composants typés) — **aucun projet Carrel n'en a** : tout est en classes utilitaires. Si Plume d'Ombres veut un `ui/` typé, c'est à écrire de zéro (ou à installer shadcn/ui, mais le cible a `lucide-react` seul).

**Déjà couvert par les autres chantiers en cours** (donc à ne pas refaire) : `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`, `app/(public)/*` (landing, tarifs, FAQ, contact, légales), `components/public/*` (nav, pied, sections), `components/lecteur/*`.

---

## 4. Fichiers écrits (namespace isolé `components/importe/`)

| Fichier | Source | Dépendances | Importé par une page ? |
|---|---|---|---|
| `components/importe/PaiementMobileMoney.tsx` | `afristack/components/PaiementForm.tsx` (verbatim + en-tête de provenance) | `react` | non |
| `components/importe/FormulaireConnexion.tsx` | `afristack/app/connexion/page.tsx` (verbatim + en-tête) | `react`, `next/navigation`, `@/lib/supabase/client` ✅ existant | non |
| `components/importe/PresentationSlides.jsx` | `Desktop/application/src/App.jsx` (verbatim + en-tête) | `react`, `lucide-react` ✅ existant | non |
| `components/importe/afristack-globals.reference.css` | `afristack/app/globals.css` (verbatim, **non compilé**) | — (référence à recopier à la main) | non |
| `components/importe/A-LIRE.md` | — | — | non |

Aucun autre fichier du dépôt cible n'a été touché : `app/**`, `components/**` (hors `importe/`), `lib/**`, `supabase/**`, `package.json` intacts. Aucun `npm install`, aucun build, aucun `tsc`, aucun push.

### Intégration type (quand un agent branchera)

```ts
// dans une page : importer explicitement, ne rien renommer
import PaiementMobileMoney from '@/components/importe/PaiementMobileMoney';
```
1. Retoucher la palette (classes `carte`/`champ`/`bouton-or` → `velours`/`champ-sombre`/`bouton-principal`, `--or-vif` → `--color-grenat-400`).
2. Côté serveur : ajouter la route `/api/paiement` et un `lib/paiement/` (modèle afristack `lib/paiement/index.ts` + `fedapay.ts`).
3. Remplacer `PLANS`/`planParId` par les plans réels de Plume d'Ombres.
