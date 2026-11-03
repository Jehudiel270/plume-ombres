# Brief — refonte du tableau de bord admin (Plume d'Ombres)

Document commun aux trois chantiers. Lis-le en entier avant de coder.

## Contexte produit

Plume d'Ombres est un atelier de traduction littéraire en ligne (Next.js 16
App Router, TypeScript strict, Tailwind 4, Supabase). Le panneau admin vit sur
`/admin` et sert à suivre les comptes, les abonnements, les paiements, les rôles
et la santé des moteurs de traduction.

Dépôt : `C:\Users\dosso\dev\dark-romance-w6d` (branche `main`). Chaque chantier
travaille dans **son propre worktree git**, sur **sa propre branche**.

## Règles absolues

1. **Français** partout : code, commentaires, libellés, noms de variables.
2. **Aucun retrait** : on ajoute, on n'enlève pas une fonctionnalité existante.
3. **Ne touche jamais** ces fichiers (ils appartiennent à un autre chantier ou au
   pilote) : `app/admin/page.tsx`, `lib/admin-stats.ts`, `lib/roles.ts`,
   `lib/roles-garde.ts`, `next.config.ts`, `package.json`.
   Tu peux **lire** `lib/admin-stats.ts` et `app/admin/page.tsx` pour réutiliser
   les helpers (`formaterNombre`, `formaterMontant`, `formaterDateHeure`,
   `echapperCsv`, `versCsv`).
4. **Un composant = un fichier neuf** dans `components/admin/`, exporté par un
   composant client autonome (`'use client'`) qui reçoit ses données en props.
   Le pilote l'intègrera lui-même dans `app/admin/page.tsx`. Ne modifie pas
   `OngletsAdmin.tsx` : expose simplement ton composant.
5. **Pas de nouvelle dépendance npm.** Pas de librairie de graphes : les
   graphiques se dessinent en **SVG à la main** (barres, courbe, anneau), avec
   `<svg>`, `<rect>`, `<path>`, `<line>`. Doit rester lisible à 320 px de large.
6. **Aucun secret** affiché ni journalisé. Jamais de `service_role` côté client.
7. **Validation obligatoire avant de rendre** :
   - `npx tsc --noEmit` → 0 erreur ;
   - `npx eslint <tes fichiers>` → 0 erreur ;
   - `npx tsx --test "<tes fichiers de test>"` → tout vert si tu ajoutes des tests.
   **Ne lance JAMAIS `next build` ni `next dev`** (le pilote le fait, une seule
   fois, après fusion) : le `node_modules` est partagé par jonction et le build
   concurrent casse les autres chantiers.
8. **Commente le pourquoi**, pas le comment. Phrases courtes, ton sobre.

## Design system à respecter

Le reste du panneau utilise des classes utilitaires Tailwind et les variables
CSS du site : `var(--encre)`, `var(--grenat)`, `var(--ivoire)`,
`var(--brume)`, `var(--braise)`. Les composants admin existants
(`components/admin/TableauComptes.tsx`, `Paginator` dans
`components/admin/Pagination.tsx`, `ModaleConfirmation.tsx`) montrent le style
attendu : cartes `rounded-xl border`, en-têtes en petites capitales,
chiffres en tabulaire, aucun emoji dans l'interface.

Reprends exactement cette grammaire visuelle. Densité élevée (les admins lisent
des tableaux), mais respiration verticale de 12-16 px.

## Contraintes fonctionnelles transverses

- Les listes dérivent de données réelles : `public.admin_lister_comptes`,
  `public.admin_stats_abonnements`, `public.admin_journal_paiements` (RPC
  SECURITY DEFINER) ou des `select` PostgREST **filtrés par RLS**. Tu ne
  contournes jamais les permissions.
- Chaque écran doit supporter : **état vide** (message clair), **état de
  chargement** (squelette discret), **erreur** (message + bouton réessayer).
- Le filtrage se fait **côté client** pour les jeux déjà chargés et **côté
  serveur** (paramètres de requête) quand la source est paginée.
- Pas de `any`. Types explicites exportés.
