# components/importe — namespace isolé (inventaire du 01/10/2026)

Composants **copiés depuis d'autres projets de Carrel**, prêts à intégrer mais **volontairement non branchés** :
aucune page ni aucun autre composant ne les importe, et ils ne doivent pas l'être tels quels.

| Fichier | Origine (code de Carrel) | Dépendances | État |
|---|---|---|---|
| `PaiementMobileMoney.tsx` | `dev/afristack/components/PaiementForm.tsx` | `react` seul | Palette à retoucher, route `/api/paiement` à créer |
| `FormulaireConnexion.tsx` | `dev/afristack/app/connexion/page.tsx` | `react`, `next/navigation`, `@/lib/supabase/client` (existe) | Redirection `/tableau-de-bord` → `/bibliotheque` |
| `PresentationSlides.jsx` | `Desktop/application/src/App.jsx` (Vite/React 18) | `react`, `lucide-react` (existe) | Ajouter `'use client'`, palette à retoucher |
| `afristack-globals.reference.css` | `dev/afristack/app/globals.css` | — | **Référence seule** : recopier à la main `.pastille*`, `.etiquette`, keyframes |

Aucun code tiers sous licence n'a été copié. Détail complet, tableau des adaptations et liste des manques :
`../../TODO-COMPOSANTS-REUTILISABLES.md`.
