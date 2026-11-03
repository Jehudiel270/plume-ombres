# Tableau de bord, audience et sécurité — 3 novembre 2026

Document court des livraisons. Preuves d'exécution en fin de fichier.

## 1. Paiements — nouvel onglet exploitable

`components/admin/PaiementsFiltrables.tsx` remplace l'ancien journal figé
(25 lignes, aucun filtre). Il reçoit jusqu'à 200 transactions.

- **Recherche** libre : référence, e-mail, pseudo, montant, fournisseur.
- **Filtres** : statut, fournisseur, période (aujourd'hui, 7 j, 30 j, tout).
- **Indicateurs** : volume encaissé, transactions, panier moyen, taux de succès.
- **Graphiques** (SVG, aucune dépendance ajoutée) : volume par jour sur la
  période, répartition par statut en barres.
- **Export CSV** des lignes filtrées, généré côté navigateur (l'export serveur
  complet reste disponible pour l'archive).
- **Suivi transaction par transaction** : référence cliquable (copie), compte,
  plan, montant, statut en français, fournisseur, date.

Logique pure dans `lib/admin-paiements.ts` (`filtrerPaiements`,
`agregerPaiements`, `serieQuotidienne`) — 13 tests.

## 2. Audience — nouvel onglet de statistiques

Mesure d'audience **sans cookie ni identifiant persistant**.

- Table `public.visites` : chemin, domaine source, famille d'appareil,
  identifiant aléatoire de session, horodatage. Ni adresse IP ni empreinte.
- Collecte : `POST /api/track` (balise `components/SuiviVisites.tsx` montée
  dans le layout), 201 réponses silencieuses, plafonnées à 60 envois/minute/IP.
- Agrégats : `public.admin_stats_visites(p_jours)` — visites et visiteurs
  uniques par jour, pages les plus vues, sources, appareils, aujourd'hui/hier.
- Conservation : 180 jours, purge quotidienne greffée sur le cron existant
  (`/api/translate/travail`, plan Hobby = un passage par jour).
- Onglet **Audience** : indicateurs, courbe 30 jours, conversions (comptes
  créés, paiements encaissés sur 30 j).

## 3. Sections par administrateur

Un super-administrateur choisit désormais **quelles parties** du tableau de
bord ouvre chaque administrateur qu'il crée.

- Table `public.admin_sections` (RLS, lecture du seul propriétaire ou du
  super-admin, écriture uniquement par RPC).
- RPC : `mes_sections()`, `section_autorisee(section)`,
  `definir_sections_admin(cible, sections[])` (super-admin seulement, vérifie
  que la cible est bien administratrice), `sections_admin_connues()`.
- Sections : `comptes`, `abonnements`, `paiements`, `audience`, `systeme`.
  Absence de ligne = comportement historique (toutes les sections ouvertes).
- Interface : bloc « Sections ouvertes » sous la gestion des rôles
  (`components/admin/SectionsAdministrateurs.tsx`), route
  `POST /api/admin/sections`.
- Application : les onglets sont filtrés côté serveur (`app/admin/page.tsx`) et
  l'export CSV refuse une section fermée (`403`), même par URL directe.

## 4. Sécurité — correctifs de cette passe

Voir le détail daté dans `docs/securite-audit-2026-11-03.md`. Résumé :

- En-têtes de sécurité centralisés (`next.config.ts`) : CSP, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- Redirection ouverte fermée (`app/auth/confirmer/route.ts`).
- Limitation de débit sur la création et la vérification de paiement.
- Échappement CSV anti-injection de formule.
- `next` 16.2 → **16.4.4** (avis de sécurité du framework).
- Isolation RLS prouvée par épreuve réelle sur 13 tables (`scripts/audit-rls.mjs`).

## Preuves d'exécution

| Contrôle | Résultat |
| --- | --- |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint` (12 fichiers touchés) | 0 erreur |
| `npx tsx --test "lib/**/*.test.ts"` | **158 tests, 158 pass, 0 fail** |
| Migrations `20261103000001` et `20261103000002` | appliquées sur la base |
| `scripts/verifier-audience.mjs` | 3 visites insérées → 3 comptées, 2 uniques, sources agrégées, purge des lignes de test : OK |
| `scripts/audit-rls.mjs` | compte neuf : 0 ligne étrangère sur 13 tables |

## Reste à faire

- Vérifier les en-têtes de sécurité **en production** après déploiement
  (`curl -sI https://plume-ombres.vercel.app`).
- Les avis `npm audit` restants (`minimatch`, `deepmerge`) concernent la chaîne
  de construction de `next-pwa` (temps de build uniquement) ; correctif par
  `overrides` à valider lors d'une prochaine mise à jour des dépendances.
