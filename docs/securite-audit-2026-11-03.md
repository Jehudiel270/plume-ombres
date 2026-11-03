# Audit de sécurité — Plume d'Ombres

Date : 3 novembre 2026 · Périmètre : application Next.js 16 (App Router), API
routes, base Supabase (RLS + RPC), webhook FedaPay, dépendances.
Méthode : lecture du code **et** épreuves réelles contre la base et la
production. Aucun secret n'est reproduit ici.

## 1. Synthèse

| Domaine | État | Preuve |
|---|---|---|
| Isolation des données (RLS) | ✅ conforme | compte jetable, 13 tables testées, **0 ligne étrangère** |
| Authentification des routes | ✅ conforme | 13 routes inspectées, toutes gardées sauf 2 routes publiques assumées (`/api/statut`, `/api/paiement/webhook` signé) |
| Autorisation admin | ✅ conforme | `verifierPermission()` en tête de chaque route `/api/admin/*` |
| Redirection ouverte | 🔧 corrigée | `app/auth/confirmer/route.ts` |
| Injection de formules (CSV) | 🔧 corrigée | `lib/admin-stats.ts` + 6 tests |
| Limitation de débit | 🔧 complétée | ajout sur `/api/paiement` et `/api/paiement/verifier` |
| En-têtes de sécurité | 🔧 ajoutés | `next.config.ts` (CSP, HSTS, X-Frame-Options, Permissions-Policy…) |
| Signature des webhooks | ✅ conforme | HMAC comparé en temps constant (`timingSafeEqual`) |
| Secrets côté navigateur | ✅ conforme | aucun `service_role` dans le code client |
| Dépendances | 🔧 en cours | montée `next@16.4.4` ; dépendance morte `epubjs` retirée |

## 2. Isolation des données — épreuve réelle

`scripts/audit-rls.mjs` crée un compte jetable, s'y connecte avec la clé
publique, puis tente de lire toutes les tables sensibles. Puis il vérifie
**ligne par ligne** que ce qui reste visible lui appartient.

```
TABLE                      lignes en base   vues   etrangeres
livres                    26               0      0
chapitres                 794              0      0
segments                  40357            0      0
paiements                 3                0      0
abonnements               14               1      0
abonnements_historique    24               1      0
notifications             5                0      0
favorites                 3                0      0
credits_traduction        1                0      0
glossaires                0                0      0
travaux_traduction        5                0      0
admin_actions             7                0      0
profiles                  23               0      0

Lecture croisée : AUCUNE LIGNE ÉTRANGÈRE
Compte jetable supprimé : oui
```

Les deux lignes visibles sont l'abonnement gratuit du compte neuf et sa
première entrée d'historique : comportement attendu, pas une fuite.

Commande de rejeu : `node --env-file=.env.local scripts/audit-rls.mjs`

## 3. Routes API — inventaire et gardes

| Route | Méthodes | Garde |
|---|---|---|
| `/api/abonnement` | GET | session obligatoire |
| `/api/admin/abonnement` | POST, DELETE | `admin.abonnements.attribuer` / `.revoquer` |
| `/api/admin/chaine` | GET, PUT, POST | permission dédiée |
| `/api/admin/export` | GET | permission par type d'export + débit |
| `/api/admin/roles` | POST | `admin.roles.attribuer` (+ contrôle fin) |
| `/api/paiement` | POST | session **+ débit** (nouveau) |
| `/api/paiement/verifier` | POST | session **+ débit** (nouveau) |
| `/api/paiement/webhook` | POST | signature HMAC + service_role |
| `/api/statut` | GET | public, sans donnée sensible |
| `/api/translate/lot` | POST | session + débit + quota |
| `/api/translate` | POST | session + débit + quota |
| `/api/translate/sante` | GET | session |
| `/api/translate/travail` | POST | jeton d'exploitation (`x-plume-travail`, comparaison en temps constant) |

Les routes qui déclenchent une action coûteuse chez un tiers (création de
paiement, interrogation du fournisseur) étaient authentifiées mais non
plafonnées : un compte valide pouvait les marteler. Elles passent désormais
par le limiteur commun (`lib/rate-limit.ts`), avec la clé compte + IP et les
en-têtes `X-RateLimit-*` / `Retry-After`.

## 4. Correctifs de code

**Redirection ouverte (élevé).** `app/auth/confirmer/route.ts` acceptait tout
paramètre `next` commençant par `/`. Or `//exemple.com` et `/\exemple.com`
sont des URL relatives au protocole : le navigateur les interprète comme un
domaine externe, ce qui permettait de renvoyer un utilisateur fraîchement
connecté vers un site hostile avec un lien de confirmation crédible. Le
paramètre est désormais validé comme chemin interne : rejet des schémas, des
doubles barres obliques, des antislashs, des retours à la ligne et des
caractères de contrôle.

**Injection de formules dans les exports CSV (moyen).** Une cellule commençant
par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot pouvait devenir une
formule à l'ouverture dans un tableur (exfiltration de données par requête
distante). La fonction `echapperCsv()` neutralise désormais ces amorces par une
apostrophe et encadre les cellules contenant séparateur, guillemet ou retour à
la ligne. Couvert par 6 tests (`lib/admin-stats.test.ts`).

**En-têtes de sécurité.** `next.config.ts` porte la politique de sécurité du
contenu, HSTS (un an, sous-domaines inclus), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy` et `poweredByHeader: false`. La CSP autorise
`script-src 'self' 'unsafe-inline'` : Next injecte son amorçage RSC en ligne et
un nonce par requête exigerait un middleware. Aucun script distant, aucun
`object-src`, `frame-ancestors 'none'`.

## 5. Dépendances

- `next` monté en **16.4.4** (correctifs du mois, dont la faille RCE du
  middleware signalée en novembre 2026).
- `epubjs` retiré : présent dans `dependencies` mais importé nulle part, il
  traînait `@xmldom/xmldom` et ses 15 avis (dont 4 élevés) dans l'arbre de
  production.
- Restent des avis **de build uniquement** (`deepmerge`, `minimatch` via
  `next-pwa` → `workbox-build`) : ils s'exécutent à la compilation, jamais
  dans le processus qui sert les requêtes. Suivi : `npm audit --omit=dev`.

## 6. Points de vigilance qui restent ouverts

- **CSP sans nonce** : `'unsafe-inline'` sur `script-src` affaiblit la
  protection XSS. Ceinture et bretelles possible en ajoutant un middleware qui
  génère un nonce par requête (impact : perte du rendu statique des pages
  publiques). À arbitrer.
- **Pas de WAF** : Vercel Hobby n'en fournit pas. Les protections sont
  applicatives (débit, quotas, RLS).
- **Clés** : rotation recommandée des clés FedaPay et Supabase `service_role`
  après toute exposition en clair (messagerie, capture d'écran, collage).
- **Journal d'audit** : les actions admin sont tracées (`admin_actions`), mais
  aucune alerte n'est envoyée en cas de rafale d'échecs de paiement.
- **Sauvegardes** : Supabase conserve des sauvegardes du plan gratuit ; aucune
  restauration n'a été testée à ce jour.

## 8. Résultats des épreuves (3 novembre 2026)

| Épreuve | Résultat |
| --- | --- |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint` sur 12 fichiers modifiés | 0 erreur, 0 avertissement |
| `npx tsx --test "lib/**/*.test.ts"` | 158 tests / 158 réussis / 0 échec |
| `node --env-file=.env.local scripts/audit-rls.mjs` | Compte neuf : 0 ligne étrangère sur 13 tables (abonnements et historique : uniquement ses propres lignes) |
| `node --env-file=.env.local scripts/verifier-audience.mjs` | Insertion 201, agrégats 200 (3 visites, 2 uniques), purge des lignes de test 204 |
| `curl -X POST` sur 7 routes API sans session | **non concluant** : `curl` sort en 23 (écriture stdout) sans code HTTP ; le refus est établi par lecture du code (`verifierPermission` en tête de chaque route), pas par une preuve réseau |
| Production — `POST /api/admin/export?type=comptes` sans session | **401** `{"erreur":"Non connecté."}` |
| Production — `POST /api/admin/sections` sans session | **401** `{"erreur":"Non connecté."}` |
| Production — `POST /api/paiement` sans session | **401** `{"erreur":"Non autorisé."}` |
| Production — `GET /admin` sans session | **307** (redirection vers la connexion) |
| Production — `POST /api/track` (agent mobile) | **204**, ligne réellement insérée : chemin `/catalogue?page=2` nettoyé en `/catalogue`, source `google.com`, appareil `mobile` ; ligne de test supprimée après contrôle |
| Production — `POST /api/track` (curl) | **204** sans insertion : l'agent `curl` est classé robot et écarté |
| Webhook sans signature | 401 ; avec signature | 200 `{"ok":true}`, rejeu idempotent |
| `npm audit --omit=dev` | 17 avis restants (3 élevés), tous dans la chaîne de BUILD de `next-pwa` (`workbox-build`, `rollup-plugin-terser`, `minimatch`) — jamais chargés à l'exécution. `epubjs` retiré : 2 avis élevés et 17 paquets de moins |
| En-têtes de sécurité en production | **vérifiés** le 3/11 : CSP, HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |

## 9. Rejeu des épreuves

```bash
node --env-file=.env.local scripts/audit-rls.mjs      # isolation RLS
npx tsx --test lib/admin-stats.test.ts               # injection CSV
npx tsc --noEmit                                     # typage strict
npm audit --omit=dev                                 # dépendances
curl -sI https://plume-ombres.vercel.app | grep -i -E 'content-security|strict-transport|x-frame'
```
