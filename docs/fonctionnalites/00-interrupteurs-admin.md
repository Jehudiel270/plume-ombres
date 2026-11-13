# Fiche module 1 — Interrupteurs de fonctionnalités (administration)

Date : 12/11/2026 · Branche : `fonctionnalite/interrupteurs-admin` · Code : infrastructure
transversale (préalable à tout le reste) · Effort : M · Risque juridique : aucun.

## Problème du lecteur

Aucun : c'est une infrastructure pour l'administrateur. Elle répond à la règle du
chantier « chaque module a son interrupteur » (brief BRIEF-HERMES §1) : les nouveaux
modules du chantier post-lancement (théories, graphe, clubs, TTS…) arrivent **éteints**
et ne s'ouvrent que si l'administrateur les ouvre — sans redéploiement.

## Ce qui a été porté depuis la maquette (code envoyé)

| Maquette (Nuxt) | Portage (Next.js) |
|---|---|
| `data/feature-flags.ts` | `lib/fonctionnalites/registre.ts` (pur, sans import Next/Supabase) |
| `server/middleware/feature-gate.ts` | `proxy.ts` (barrière grossière pages) + `lib/fonctionnalites/etats.ts` (barrière fine pages et API) |
| `/admin/fonctionnalites` (page maquette) | `app/admin/fonctionnalites/page.tsx` + `components/admin/PanneauFonctionnalites.tsx` |
| `scripts/check-flags.mjs` | `scripts/verifier-interrupteurs.ts` (`npm run check:flags`) |
| `docs/FEATURE-FLAGS.md` | le présent dossier `docs/fonctionnalites/` |
| `migrations/002_feature_flags.sql` | `supabase/migrations/20261112000001_fonctionnalites_etats.sql` |

## Adaptations au projet réel (décisions)

- **Plans** : la maquette utilisait gratuit/premium/premium_plus. Le registre définit
  quatre FAMILLES mappées sur les codes réels de `lib/abonnement.ts` :
  `gratuit` < `lecteur` (Lecteur, essai, packs de crédits, étudiant, legacy premium)
  < `passionne` (Passionné) < `illimite` (Illimité, groupe, école).
  `niveauPlanDepuisCode()` fait le mapping, testé pour chaque code réel.
- **Clubs** : l'administrateur a tranché (12/11/2026) que les clubs n'attendent pas de
  juriste. L'interrupteur `clubs` n'est donc PAS marqué `risqueJuridique` — à la
  condition explicite inscrite dans le registre : clubs PRIVÉS entre comptes inscrits,
  aucun texte de chapitre ni extrait partagé, aucune page publique. La variante
  publique resterait, elle, à risque.
- **Exposition publique** (`catalogue_public`, `collections`, `calendrier`,
  `acces_anticipe`) : `risqueJuridique: true`, éteinte partout, activation refusée par
  le serveur (422) sans la case « validé par un juriste » ; désactiver le module retire
  la confirmation.
- **Interrupteurs sans route** (`lecture_vocale` F9, `bilingue` F7,
  `acces_anticipe` A19) : fonctions d'interface ou règles à l'intérieur du socle ;
  le registre exige une justification `sansItineraire`.
- **Socle** (`ITINERAIRES_SOCLE`) : l'atelier personnel complet (bibliothèque, livres,
  favoris, compte, abonnement, paiement, traduction, pages publiques et légales,
  infrastructure) n'est JAMAIS derrière un interrupteur. Un test garantit qu'aucun
  itinéraire d'interrupteur n'absorbe une route du socle (les itinéraires plus
  PROFONDS sous un préfixe du socle restent admis : `/livres/*/graphe` sous `/livres`,
  la barrière retient le plus spécifique).

## Fonctionnement

1. **Registre** (`lib/fonctionnalites/registre.ts`) : définitions (clé stable snake_case,
   code F/A, itinéraires, API, plan minimal par défaut, risque, défaut prod). Toute
   nouvelle page ou API de module DOIT y être déclarée — `npm run check:flags` échoue
   sinon (vérifié : il a détecté `/api/abonnement` manquant lors du premier passage).
2. **États** (`fonctionnalites_etats` en base) : `actif`, `plan_minimal`,
   `deploiement` (0–100 %), `juriste_ok`, `maj_le`, `maj_par`. Absence de ligne =
   défaut du registre (éteint en production). Lecture REST avec cache 30 s
   (compatible edge) ; panne ou table absente → tout éteint, jamais l'inverse.
3. **Barrière grossière** (`proxy.ts`) : page d'un module éteint → **404**, comme si
   la route n'existait pas. Le proxy n'a ni plan ni identité : il ne tranche que
   « éteint / juriste ».
4. **Barrière fine** (`lib/fonctionnalites/etats.ts`) : chaque page de module appelle
   `verifierAccesModule(cle, lecteur)` et chaque route d'API
   `verifierModuleApi(cle, lecteur)` — plan insuffisant → 403 (API) ou redirection
   /abonnement (page) ; hors déploiement progressif → 404. Compartiment déterministe
   FNV-1a (`clé:lecteur` modulo 100) : stable par lecteur.
5. **Admin** (`/admin/fonctionnalites`) : ouverture/fermeture, plan minimal,
   déploiement avec aperçu sur 20 lecteurs de test, case juriste pour les modules à
   risque. Garde à deux niveaux : permission `admin.fonctionnalites.gerer` (nouvelle,
   accordée à admin et super_admin) + RLS `public.est_admin()`. Journalisation dans
   `journal_admin` si la table existe (trigger). L'ouverture en masse
   (`POST /api/admin/fonctionnalites/tout-ouvrir`) construit ses lignes avec
   `construireLignesOuvertureMasse` (registre) : `juriste_ok` y est TOUJOURS un
   booléen explicite sur chaque ligne — supabase-js déduit les colonnes de l'union
   des clés du tableau, une clé absente d'une ligne serait insérée à NULL (23502).
6. **Garde-fou** (`npm run check:flags`) : 15 interrupteurs, 25 pages et 22 routes
   d'API toutes couvertes (interrupteur, socle ou admin) ; clés uniques, modules à
   risque éteints par défaut, doublons socle détectés.

## Migration (ADDITIVE, idempotente)

`20261112000001_fonctionnalites_etats.sql` : création de table, RLS (lecture
anon+authentifié — le proxy lit avant session ; écriture admin), trigger de journal.
Aucun DROP, aucun renommage. À appliquer sur la base de prod seulement au merge final
du chantier (ou sur une base d'essai dédiée), conformément aux règles adoptées.

## Tests et vérifications exécutés

- `npx tsx --test lib/fonctionnalites/registre.test.ts` : **16/16** (clés uniques,
  correspondance par préfixe, socle, admin, déploiement déterministe, plan minimal,
  juriste obligatoire, mapping des plans réels).
- `npm run test:unitaires` : 187/188 — le seul échec
  (`admin-paiements.test.ts` « série quotidienne ») préexiste sur `develop` sans
  aucune modification (cause : fuseau UTC du bac à sable, test dépendant de la date
  locale). Non touché dans cette branche (règle : ajouts uniquement).
- `npm run check:flags` : OK (15 interrupteurs, 25 pages, 22 API).
- `npm run build` : OK, routes `/admin/fonctionnalites` et `/api/admin/fonctionnalites`
  présentes dans le manifeste de build.
- `npm run lint` : même état qu'avant la branche (2 problèmes préexistants dans
  `components/PWA.tsx` et `lib/paiement/fedapay.ts`, non touchés ici).

## Ce qui n'est pas vérifié ici

- La migration n'a PAS été appliquée à la base de production (volontaire).
- Le parcours réel connecté (ouverture d'un module, journalisation) se vérifiera sur
  l'aperçu Vercel de `develop` avec des variables d'environnement de test.
- Le 404 proxy sur un module réellement ouvert/fermé se vérifie après application de
  la migration sur une base d'essai.
