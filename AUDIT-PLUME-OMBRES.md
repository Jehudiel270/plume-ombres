# Audit complet — Plume d'Ombres
**Date : 1er octobre 2026** · Audit en lecture seule (aucun code livré). Toutes les affirmations sont adossées à un fichier:ligne, une requête sur la base de production ou une commande réelle.

## 0. Méthode et systèmes réellement inspectés
- Code : 7 784 lignes (app/, components/, lib/, supabase/), 34 fichiers source — lus intégralement.
- Base de production : Supabase `imbziizequckeaxuotdz`, requêtes SQL réelles exécutées (RLS, policies, volumétrie, taille DB).
- Production : `plume-ombres.vercel.app` — tests HTTP réels (200 /connexion, 307 /, 401 /api/translate) + `npx vercel env ls production`.
- Documentation officielle : pricing Gemini, quotas MyMemory, Cloud Translation, Vercel limits.
- Points NON vérifiés (signalés comme tels) : quotas exacts du tier gratuit Gemini (la doc officielle n'affiche plus les chiffres), plan Vercel exact, tarifs DeepL, rendu visuel réel du canvas WebGL.

---

## 1. Audit de l'existant — inventaire vérifié
| Domaine | État réel |
|---|---|
| Auth | Supabase Auth email+mdp, inscription/connexion bascule (`app/connexion/page.tsx`), `signOut` (`components/BarreNavigation.tsx:18`). Pas de reset de mot de passe, pas de suppression de compte. |
| Protection des routes | `proxy.ts:41-63` redirige vers /connexion sauf `api/` et statiques. La route API se vérifie elle-même (401 réel confirmé en prod). |
| Import | `.txt/.md/.markdown/.pdf/.epub` (`components/ZoneImport.tsx:24,243`). PDF extrait dans le navigateur via pdf.js, EPUB dézippé par jszip (`lib/import-epub.ts`). **Pas de DOCX.** PDF scanné refusé avec message (`ZoneImport.tsx:57-61`). |
| Découpage | Chapitres détectés (Chapter/Prologue…), puis segments = paragraphes entiers, max 6 000 car. (`lib/segmenter.ts`, `lib/import-livre.ts:16`). |
| Stockage du fichier | Upload dans le bucket **privé** `originaux` (`ZoneImport.tsx:119-141`), 50 Mo max, RLS par `owner_id`. |
| Traduction | 4 fournisseurs interchangeables côté serveur (`lib/providers/`), file parallèle 4 workers, retry 3 essais + backoff, annulation, reprise sans perte (`lib/useMoteurTraduction.ts`). |
| Assemblage | 1:1 garanti : `traduit + suite` par segment, la structure du texte est préservée (`useMoteurTraduction.ts:assemblerChapitre`). |
| Bibliothèque | Grille responsive, tri, filtres, favoris, suppression, recherche (`components/BibliothequeClient.tsx`). |
| Lecteur | 3 thèmes (nuit/encre/parchemin), 3 polices, taille 14-24, interligne 1,5-2,4, largeur 50-85ch, justification, sommaire, reprise de position, stats de lecture (`components/RegleLecture.tsx`, `lib/lecture.ts`, `lib/useLecture.ts`). |
| Recherche | Plein texte, sans accents/casse, **dans le chapitre affiché uniquement** (`lib/recherche.ts:58-78`). |
| Exports | `.md` (chapitre + livre), `.docx` (`lib/export-docx.ts`), 3 voies PDF (impression `lib/imprimer-pdf.ts`, re-paginé `lib/pdf-traduit.ts`, mise en page d'origine `lib/export-fidele.ts`), téléchargement de l'original. |
| PWA | Manifest + service worker + bouton d'installation (`components/PWA.tsx`). Cache l'app shell, **pas** le contenu des livres (`public/service-worker.js:76-108`). |
| Paiement / quotas | **Rien.** 0 occurrence de stripe/paypal/premium/abonnement/crédit dans tout le repo ; aucune table ni champ associé en base. |

---

## 2. Classement

### Déjà terminé (opérationnel et testé)
- Auth + RLS stricte sur les 5 tables (vérifié en base) + bucket privé.
- Import txt/md/pdf/epub avec extraction locale et garde-fous.
- Segmentation par paragraphes + assemblage fidèle 1:1.
- Moteur de traduction parallèle : 4 workers, retry/backoff, annulation, reprise sans perte.
- Architecture multi-fournisseurs (aucun fournisseur codé en dur).
- Bibliothèque (tri/filtres/favoris/suppression) et lecteur complet avec préférences persistées.
- Exports md/docx/pdf (3 voies) + récupération de l'original.
- Identité visuelle dark romance aboutie (voir §4).

### Partiellement terminé (existe mais fragile/incomplet)
- **Prod ≠ dev** : en production, `GEMINI_API_KEY` et `TRANSLATOR_DEFAULT` sont absentes → le fournisseur actif est l'**endpoint Google non officiel** (`translate_a/single`, `lib/providers/google.ts`), alors qu'en local le code privilégie Gemini. Le code exécuté en prod n'est pas celui testé.
- **LibreTranslate inutilisable en prod** : sans `LIBRETRANSLATE_URL`, la valeur par défaut `http://127.0.0.1:5000` pointe vers la fonction serverless elle-même.
- **Reprise des segments bloqués en `en_cours`** : la file ne reprend que `en_attente`/`erreur` (`useMoteurTraduction.ts:166`). Les segments restés `en_cours` ne sont **jamais** retraités, et `cloreChapitre` peut marquer le chapitre `traduit` malgré ce trou. Preuve en base prod : 8 segments `en_cours` orphelins + 3 chapitres `en_traduction` bloqués.
- **Suppression d'un livre** : supprime la ligne `livres` et cascade DB, mais **pas** le fichier du bucket `originaux` (`BibliothequeClient.tsx:113-130`, aucun `storage.remove`) → fichiers orphelins, stockage qui fuit, données conservées après suppression.
- **Recherche** limitée au chapitre ouvert (pas de recherche livre entier).
- **Mode bilingue** : bascule source OU traduction, pas de côte à côte.
- **Favoris** : posables mais aucune page pour les consulter ; bug perf réel — `useFavorites()` est appelé dans chaque `BoutonFavori` alors qu'il est déjà fourni en prop (`components/BoutonFavori.tsx:29` vs `BibliothequeClient.tsx:94-96`) → une requête Supabase par carte.
- **États d'erreur/chargement** : aucune page `error.tsx`, `loading.tsx`, ni `not-found.tsx` dans `app/`.
- **Inscription** : si la confirmation e-mail est activée, aucune session n'est créée mais l'app redirige quand même vers `/bibliotheque` (boucle sans message) (`app/connexion/page.tsx:63-64`).
- **PWA/offline** : installation OK, lecture hors-ligne impossible.
- **Upload** : le résultat de l'update final n'est pas vérifié (`ZoneImport.tsx:173-176`).
- **Navigation lecteur sur mobile** : la liste des chapitres (max 75vh) s'intercale avant le texte, sans repli (`EspaceLivre.tsx:663-664`) ; le bandeau d'actions (2 selects + 7 boutons d'export) est très dense (`:724-892`) ; popup réglages sans garde-fou de largeur (`RegleLecture.tsx:93`).
- **Wording** : « ne murmura plus » (faute) `BibliothequeClient.tsx:116` ; tokens CSS `--color-nuit-800` et `-850` identiques `globals.css:14-15`.

### Manquant (n'existe pas)
- **Landing page publique / page de présentation du concept.** `/` redirige immédiatement vers `/connexion` (`app/page.tsx`). Un visiteur ne peut pas comprendre le produit avant de créer un compte.
- **Tout le paiement** : pas de plan, pas de quota, pas de facturation, pas de table d'usage.
- **Rate-limiting et quotas par utilisateur** : `/api/translate` accepte un nombre illimité d'appels d'un compte authentifié.
- **Pages légales** : CGU, politique de confidentialité, mentions légales, contact, FAQ, tarifs.
- **Suppression de compte / droit à l'effacement** (RGPD) : impossible depuis l'UI.
- **Notification de fin de traduction** : aucune (ni e-mail, ni notification) → il faut garder l'onglet ouvert.
- **File de traitement côté serveur** : la traduction dépend d'un navigateur ouvert ; fermer l'onglet arrête tout.
- **Mémoire de traduction / glossaire** : aucun contexte entre segments, aucun glossaire de personnages ; le seul garde-fou sur les noms est la consigne « ne traduis jamais les noms propres » (`lib/providers/gemini.ts:60`).
- **Marque-pages**, **export EPUB**, **mode bilingue côte à côte**, **page profil/paramètres**, **page favoris**.
- **Classification d'âge, content warnings, tropes, catégories** : aucune occurrence dans le code.
- **Monitoring / alerting / staging** : rien.

### Inutile / prématuré (avant la monétisation)
- **3 voies d'export PDF** : surface de maintenance et de bug inutile ; une seule suffit au lancement (garder la « mise en page d'origine » + l'impression).
- **PWA offline complet** : coûteux, sans valeur tant que le contenu ne peut pas être servi hors-ligne.
- **6 langues** (fr/en/es/it/pt/de) : seul en→fr compte au lancement ; les autres diluent l'effort de qualité.
- **Exposition de fournisseurs « expérimentaux »** dans l'UI : complexité produit pour zéro valeur utilisateur.
- **Thème « encre »** : quasi identique au thème nuit par défaut.
- **~30 scripts** dans `scripts/` (bench, probes, captures) : dette de rangement, pas de script `test` dans `package.json` malgré 20 scripts de test.
- **Bucket `originaux` conservé pour tous les formats** : coût de stockage + conservation de contenu protégé pour un seul usage réel (export fidèle des PDF sources). À restreindre aux PDF.

---

## 3. Audit du parcours utilisateur
| Étape | Ce qui fonctionne | Ce qui fait partir l'utilisateur |
|---|---|---|
| Arrivée sur le site | Rien à voir : `/` redirige. | **Fuite n°1.** Un inconnu atterrit sur un écran de connexion, sans explication du concept, sans preuve, sans CTA « essayer ». Aucun référencement, aucune page publique. |
| Compréhension du concept | Le titre « Studio personnel de traduction littéraire pour la dark romance » (`app/layout.tsx:25`) et le wording d'ambiance. | Invisible hors connexion. Rien ne dit ce qu'on peut faire, avec quels formats, ni ce que ça coûte. |
| Inscription | Bascule fluide, erreurs traduites, `pseudo` optionnel. | Pas de « mot de passe oublié ». Si la confirmation e-mail est activée côté Supabase, l'utilisateur est renvoyé vers /connexion sans aucun message (bug §2). Pas de séparation claire « créer un compte ». |
| Import | Glisser-déposer, 4 formats, extraction locale, messages d'erreur clairs, ~1000 pages annoncées. | Aucune barre de progression pendant l'extraction d'un gros PDF (bloquant visuellement). Aucune aide « où trouver un PDF propre ». DOCX refusé sans alternative. |
| Analyse / découpage | Automatique, chapitres détectés, statut affiché. | Aucun écran de contrôle : l'utilisateur ne peut pas voir/corriger le découpage avant de lancer la traduction. |
| Choix de la langue | Sélecteurs à l'import **et** après import, garde-fou source≠cible. | Peu de langues, aucun « détecter automatiquement la langue ». |
| Lancement de la traduction | Deux boutons clairs (« ce chapitre », « tout traduire »), progression live segment par segment. | Aucune estimation de durée ni de volume avant de lancer. Aucun avertissement sur ce que devient le texte (envoyé à un tiers). |
| Progression | Barre live, compteur, reprise sans perte en base, annulable. | **Fuite n°2.** Si l'onglet est fermé/suspendu (mobile surtout), tout s'arrête et rien ne le signale. Aucune notification à la fin. Un livre = ~45 min à plusieurs heures selon la charge. |
| Livre traduit | Assemblage fidèle, statut par chapitre, exports. | Les chapitres en erreur sont silencieux côté bibliothèque ; il faut ouvrir le livre pour voir les trous. |
| Lecture | Lecteur riche, personnalisable, reprise de position, recherche locale. | Sur mobile, il faut scroller la liste des chapitres avant d'atteindre le texte ; pas de bouton chapitre suivant/précédent ; pas de marque-pages. |
| Retour ultérieur | Badge « Reprendre » dans la bibliothèque, position restaurée, temps de lecture. | Rien ne signale ce qui a progressé depuis la dernière visite ; les favoris ne se consultent pas. |

---

## 4. Audit de l'expérience Dark Romance
**Déjà très travaillé (point fort du projet) :** palette nommée et cohérente — nuit (#0a0608 → #2e1f27, jamais de noir pur), grenat/bordeaux (#f0a5b4 → #6b1e2d), plum (#c3a6e8 → #663a93), or-ros, ivoire (`app/globals.css:10-36`) ; typographies Playfair Display (titres) + Lora (corps) ; dégradés « texte-douche », liserés grenat→plum, lettrine, ornements ✦, fond d'ambiance WebGL animé (brume, braises, vignette) ; wording travaillé (« votre nuit vous attend », « Vos romances t'attendent dans l'ombre »). C'est immédiatement identifié comme un produit sombre/romantique.

**Ce qui manque pour que « cette plateforme est faite pour les lecteurs de Dark Romance » soit évident :**
1. **Aucune page publique qui le dit.** L'identité n'existe qu'après l'inscription → personne ne la voit.
2. **Aucun vocabulaire de genre dans le produit** : ni tropes (enemies to lovers, mafia, dark bully…), ni content warnings, ni classification d'âge (18+). Le prompt l'exige et c'est aussi une exigence de sécurité (contenu dark = trigger warnings attendus par la communauté).
3. **Aucune taxonomie** : pas de catégories/tags sur les livres, donc pas de découverte ni de tri par trope.
4. **SEO/métadonnées** : le titre du site ne contient pas « dark romance » (`app/layout.tsx:12-16`), et il n'y a aucune page indexable.
5. **Le geste d'import n'est pas scénarisé dark romance** : rien ne dit « déposez votre dark romance ». Le champ est neutre.

**Contrainte respectée :** le moteur n'est **pas** limité au genre. Le texte est transmis tel quel, seule la consigne système Gemini mentionne « dark romance » (`lib/providers/gemini.ts:57-66`) ; aucun filtrage, aucune limite de contenu, aucun genre imposé dans le schéma de données. La séparation « positionnement dark romance / moteur générique » est donc déjà bonne — il ne faut pas y toucher.

---

## 5. Audit du système de traduction (moteur réel)
- **Qui traduit réellement en production ?** L'**endpoint public non officiel de Google Traduction** `translate.googleapis.com/translate_a/single?client=gtx` (`lib/providers/google.ts:65`). En effet, en prod : `GEMINI_API_KEY` absente, `TRANSLATOR_DEFAULT` absente → `fournisseurActif()` retombe sur `google` (`lib/providers/index.ts:47-54`). Fait vérifié via `npx vercel env ls production` (2 variables seulement : les clés Supabase).
- Fournisseurs disponibles dans le code : `libretranslate` (auto-hébergé, Argos), `gemini` (Gemini Flash), `google` (non officiel), `mymemory` (public). Aucun fournisseur payant n'est câblé.
- Découpage : segment ≤ 6 000 car. côté route (`app/api/translate/route.ts:61`), puis re-découpage par fournisseur (Google : 1 500 car./fragment, 6 en parallèle — `google.ts:19-20`).
- Parallélisme : 4 requêtes simultanées par utilisateur (`useMoteurTraduction.ts:152`), 1 segment par requête, 80 ms entre segments.
- **Pas de chaîne de fallback** : `fournisseurActif()` choisit **un** fournisseur. S'il tombe, la route renvoie 502, le segment passe en `erreur` après 3 essais — le moteur ne bascule pas automatiquement sur un autre.
- **Aucun contexte inter-segments.** Chaque segment est traduit isolément, sans mémoire ni résumé du chapitre. Conséquences réelles sur un roman : incohérences de tutoiement/vouvoiement, genres des personnages, reprise des pronoms, variations de ton. C'est le principal déficit de qualité.
- **Pas de glossaire de personnages/lieux** ni de mémoire de traduction : la seule protection est la consigne « ne traduis jamais les noms propres » (Gemini uniquement — Google et MyMemory ne l'ont pas : ils traduisent bel et bien les prénoms et toponymes).
- Gestion des erreurs : retry 3 essais, backoff 1,5 s/3 s, statut par segment, message « Segment trop long ». Correct.
- Reprise : correcte sauf le bug des segments bloqués en `en_cours` (§2).
- Vitesse : ~2 700 requêtes pour un livre de 600 pages (~900 000 car., segment moyen mesuré en prod : 333 car.). À 4 workers + ~0,3-0,8 s/requête : **estimation 5 à 10 minutes par livre** dans de bonnes conditions — les « une minute » du README (`test-vitesse.ts`) supposent une concurrence ~10 et un réseau rapide.
- **Délais anti-quota morts** : `delaiEntreRequetes` de chaque fournisseur (`gemini.ts:39`, `libretranslate.ts:31`, `mymemory.ts:24`) ne s'applique que dans la boucle interne multi-fragments, jamais atteinte via la route (plafond 6 000 = 1 fragment). En pratique, aucun espacement global n'existe : seul le délai client de 80 ms limite le débit.
- **Données non vérifiables** : les chiffres « ~1 500 requêtes/jour » du code et du README ne sont plus publiés par Google. Des sources tierces cohérentes (mars-avril 2026) donnent **10 RPM / 250 RPD** pour Gemini 2.5 Flash gratuit. À confirmer par Carrel dans AI Studio — c'est une donnée structurante pour la suite.

---

## 6. Coût réel de la traduction

### Aujourd'hui — coût monétaire = 0 €
- Les 4 fournisseurs sont gratuits. Coût réel actuel : hébergement Vercel Hobby (0 €) + Supabase Free (0 €). Le projet est utilisé : **9 comptes, 12 livres, 212 chapitres, 12 506 segments, 25 Mo de base (4,9 % du Free)**.

### Demain — ce qui casse, par palier
- **Limites gratuites mesurées/documentées** :
  - MyMemory : **5 000 car./jour** anonyme, **50 000 car./jour** avec e-mail (`mymemory.translated.net/doc/usagelimits.php`, vérifié). → un livre de 900 000 car. prendrait **18 jours**.
  - Gemini Flash gratuit : quotas non publiés ; si 250 requêtes/jour, un livre (~2 700 requêtes) prend ~11 jours ; à 1 500 req/j, ~2 jours.
  - Google non officiel : **aucun quota documenté, aucun contrat** → peut bloquer à tout moment (déjà 429 possibles ; retry 4 essais).
  - LibreTranslate auto-hébergé : illimité mais c'est **votre** CPU (une VM Oracle Always Free = 1 cœur ARM / 24 Go, débit d'environ 5-15 car./s → un livre en plusieurs heures).
  - Supabase Free : 500 Mo de base + 1 Go de stockage. Mesure réelle : 25 Mo pour 12 livres dont ~2 traduits → **~2 Mo par livre complet (chapitres + segments doublés)** → saturation vers **~200 livres traduits** ; côté stockage, ~50-150 fichiers originaux (PDF/EPUB) avant saturation du Go.
  - Vercel Hobby : **~2 700 invocations de fonction par livre** ; quotas de fair-use Hobby non contractuels, dépassement = mise en pause possible.
- **Par palier d'utilisateurs** (débit, pas monnaie) :
  - **10 utilisateurs actifs** : tient sur Google non officiel ; le quota Gemini gratuit est déjà saturé.
  - **100 utilisateurs** : ~400 requêtes simultanées sur un endpoint non contractuel → 429 et blocage quasi certains, sans rotation d'IP ni de clé. Tous les utilisateurs tombent en panne ensemble.
  - **1 000** : quotas épuisés, Supabase qui rame (chaque chapitre pagine tout son contenu), explosion des invocations Vercel, aucun mécanisme de file.
  - **10 000** : non soutenable sans refonte (file serveur + pool de clés/quotas + batching multi-segments).

### Combien coûterait un livre de 500-700 pages si la traduction devenait payante ?
Base de calcul vérifiée : **~900 000 caractères** (~150 000 mots × ~6 car.), cohérent avec la mesure prod (moyenne 333 car./segment ; 150 000 mots ≈ 225 000 tokens en entrée).
- **Gemini Flash, tier payant** : tarifs officiels relevés = **0,75 $/M tokens entrée, 3,75 $/M sortie** (doc Google, tarif en vigueur jusqu'au 31/12/2026 ; le tarif du 2.5 Flash n'a pas pu être extrait). → **≈ 1,10 $ par livre**.
- **Google Cloud Translation** : **≈ 20 $/M caractères** (doc officielle, la traduction LLM facturée 10 $/M entrée + 10 $/M sortie) → **≈ 18 $ par livre**.
- **DeepL Pro** : non vérifié (tarif non extrait).
- **LibreTranslate auto-hébergé** : 0 € d'API, mais du temps CPU.

**Conclusion forte : traduire un livre coûte aujourd'hui 0 € et coûterait ~1 $ en Gemini payant, contre ~18 $ chez Google Cloud. Le coût marginal n'est pas le problème ; le problème est le quota partagé et l'absence de contrôle.**

### Données manquantes pour un calcul exact
1. Quotas réels du tier gratuit Gemini (AI Studio → à Carrel de les relever).
2. Plan Vercel exact (Hobby ou Pro) et quotas d'invocations.
3. Coût de la VM Oracle si elle est déjà en place (0 € si Always Free).
4. Tarif DeepL si on l'envisage.

---

## 7. Audit du lecteur (produit principal)
**Solide aujourd'hui :** 3 thèmes, 3 polices, taille 14-24 px, interligne 1,5-2,4, largeur 50-85 ch, justification, préférences mémorisées (`localStorage`), sommaire latéral avec statut par chapitre, reprise automatique de la position (ratio + chapitre), statistiques de lecture, recherche dans le chapitre (insensible à la casse et aux accents), rendu SSR léger (le `texte_source` est retiré du payload client).

**Classement des améliorations par priorité :**
- **P0 (bloquant pour l'expérience mobile)** : navigation du lecteur sur mobile — replier la liste des chapitres dans un tiroir, placer le texte en premier, ajouter « chapitre suivant / précédent » en bas de page. Aujourd'hui il faut scroller 75 vh avant d'atteindre le texte.
- **P0** : reprise de position fiable sur mobile (le ratio au scroll dépend du conteneur ; à valider sur un vrai téléphone).
- **P1** : marque-pages ; affichage côte à côte original/traduction ; export EPUB ; recherche sur tout le livre ; bandeau d'actions regroupé (menus plutôt que 7 boutons).
- **P1** : signaler les chapitres en erreur dans le sommaire **et** dans la bibliothèque.
- **P2** : largeur de colonne auto, mode « lecture au lit » (luminosité), gestes de balayage, statistiques plus fines.
- **P3** : thème « encre » distinct, polices personnalisées, lecture vocale.

---

## 8. Confidentialité des livres
**Bon (vérifié sur la base réelle) :**
- Bucket `originaux` **privé** (`public=false`), 50 Mo/fichier, 4 policies `bucket_id='originaux' AND owner_id=auth.uid()::text` en rôle `authenticated` → **aucun utilisateur ne peut lister ni télécharger le fichier d'un autre**.
- RLS activée sur les 5 tables (`livres`, `chapitres`, `segments`, `favorites`, `profiles`) ; toutes les policies comparent à `auth.uid()` ; **19 policies**, aucune ouverte à `anon`/`public`. Fuite inter-utilisateurs : **aucune détectée** côté base.
- Aucune clé `service_role` dans le code ni dans l'environnement ; le `.env.local` n'est pas suivi par git (seul `.env.example` l'est).
- Route API : authentification obligatoire (401 réel vérifié en prod).

**À corriger avant de faire payer :**
1. **Le texte intégral des livres part vers un endpoint Google non officiel, sans contrat, sans DPA, hors de toute garantie de non-exploitation.** C'est en contradiction directe avec la promesse d'un espace privé — et c'est un risque juridique (contenus protégés + données personnelles). Idem si Gemini est activé (le tier gratuit Google indique explicitement que le contenu **sert à améliorer ses produits** — vérifié sur la page de tarification). Seul LibreTranslate auto-hébergé est réellement privé.
2. **Suppression d'un livre ne supprime pas le fichier** du bucket → conservation de données après suppression (RGPD) + stockage qui fuit.
3. **Aucune suppression de compte** possible → droit à l'effacement non couvert.
4. **Aucune politique de confidentialité / CGU / consentement** : l'utilisateur dépose un fichier protégé sans rien accepter ni être informé du transit vers un tiers.
5. **Aucun accès administrateur encadré** : le compte Supabase propriétaire du projet peut lire toutes les données (normal, mais à documenter dans une politique).
6. **Logs** : les erreurs fournisseurs renvoient les 200-300 premiers caractères de la réponse dans le message d'erreur (`google.ts`, `gemini.ts`) → risque d'écriture de fragments de texte dans les logs Vercel. À tronquer/supprimer.
7. **Sauvegardes** : Supabase Free ne fournit pas de sauvegardes point-in-time → perte définitive en cas d'incident. À acter avant de faire payer.

---

## 9. Analyse de la gratuité
| | A — Très généreux | B — Freemium équilibré | C — Gratuit limité |
|---|---|---|---|
| Acquisition | Maximale (bouche-à-oreille, communauté dark romance) | Forte, avec un plafond clair | Faible : le produit n'a de valeur qu'après une traduction complète |
| Rétention | Très forte (le livre reste dans la bibliothèque) | Forte | Faible |
| Conversion | Faible à court terme | Équilibrée | Immédiate mais sur une base minuscule |
| Coût | Élevé **seulement** si le moteur payant est activé ; ~1 $/livre en Gemini payant | Maîtrisé | Maîtrisé |
| Abus | Élevé sans rate-limiting (un compte peut traduire en boucle) | Moyen | Faible |
| Expérience | Excellente | Bonne si le plafond est généreux et transparent | Frustrante (démo, pas produit) |

**Recommandation : B, avec un plafond généreux** — parce que la valeur perçue est **binaire** (un livre traduit et lisible), pas graduelle. Toute limite qui empêche de terminer un livre tue la promesse. Recommandation précise pour le lancement :
- **Gratuit : 1 livre complet par mois (≤ 400 000 caractères ≈ 450 pages) + lecture illimitée de tout ce qui a été traduit + exports inclus + lecteur complet.** Aucun livre ne doit rester à moitié traduit par manque de quota.
- **Filet de sécurité anti-abus** : rate-limiting serveur (ex. 30 requêtes/minute/compte) et plafond mensuel par compte, avant tout lancement public — c'est une protection, pas une limite commerciale.

---

## 10. Monétisation
| Modèle | Avantages | Inconvénients/risques | Compatibilité avec l'architecture |
|---|---|---|---|
| Abonnement Free/Premium | Revenu récurrent, simple à comprendre, couvre les coûts fixes (VM, Gemini) | Nécessite Stripe + gestion d'abonnement + webhooks ; friction pour un usage occasionnel | Bonne : un champ `plan` sur `profiles` + un contrôle de quota dans la route API suffisent. C'est le modèle le plus proche du code actuel. |
| Crédits | Payez à l'usage, juste pour les gros lecteurs, pas de récurrence | Complexité comptable (solde, expiration, remboursement) ; conversion faible ; refus culturel des microtransactions | Nécessite une table `credits` + débit atomique. Plus lourd. |
| Paiement à l'utilisation | Aligné sur le coût réel (~1 $/livre) | Imprévisible pour l'utilisateur, anxiogène, nécessite métrage précis | Nécessite un compteur fiable (caractères traduits) — faisable (les segments sont déjà mesurés). |
| **Hybride Free + Premium + crédits** | Couvre l'occasionnel (crédits) et le régulier (abonnement) | À ne pas ouvrir tout de suite : deux systèmes à maintenir, deux UX | **Recommandé en phase 2**, une fois les quotas fiables. |

**Recommandation : abonnement Premium d'abord** (le plus simple, le plus lisible), **puis crédits en phase 2** pour les gros livres ponctuels. Le coût marginal vérifié (~1 $/livre en Gemini payant) rend un prix de **3 à 5 €/mois** largement rentable tout en restant très en dessous du prix d'un livre traduit par un service classique.

---

## 11. Gratuit / Premium / Plus tard
**FREE (au lancement)**
- Import (txt/md/pdf/epub), découpage, bibliothèque, favoris, suppression.
- **1 livre complet traduit par mois** (≤ 400 000 caractères), sans jamais laisser un livre à moitié.
- Lecture intégrale, lecteur complet (thèmes, polices, réglages), reprise de position, sommaire.
- Recherche dans le chapitre, stats de lecture.
- Exports `.md`, `.docx`, PDF (une seule voie), téléchargement de l'original.
- Traduction vers les 6 langues proposées.

**PREMIUM (≈ 3-5 €/mois)**
- Traduction plus large : 3 000 000 caractères/mois (≈ 7 livres), plusieurs livres en parallèle.
- **Qualité littéraire supérieure** (moteur Gemini payant, avec mention claire du traitement des données).
- **Traduction prioritaire** (file dédiée) et reprise automatique côté serveur (sans garder l'onglet ouvert).
- **Glossaire de personnages/lieux** et mémoire de traduction (cohérence inter-chapitres).
- **Export EPUB**, mode bilingue côte à côte, marque-pages synchronisés.
- Historique illimité, conservation des originaux étendue.

**PLUS TARD**
- Crédits pour les très gros livres ponctuels.
- Traduction de documents (DOCX/PDF scannés avec OCR).
- Packs multi-livres (séries), traduction en plusieurs langues cibles d'un même livre.
- Fonctions communautaires (partage volontaire de glossaires uniquement — **jamais** de bibliothèque publique de livres).

---

## 12. Meilleurs moments pour faire payer
Classés par acceptabilité naturelle (du plus évident au moins évident) :
1. **Le 2e livre du mois** (le plus fort) : l'utilisateur a déjà vécu la valeur complète, le plafond est compris et acceptable.
2. **Le très gros livre** (> 400 000 caractères, 700 p.+) : demande explicite d'un quota supérieur.
3. **La traduction immédiate** quand la file est chargée (priorité Premium, jamais par sabotage du gratuit).
4. **La qualité littéraire** : après avoir goûté une traduction correcte, proposer le moteur supérieur — argument honnête et vérifiable.
5. **La cohérence** (glossaire de personnages/mémoire de traduction) : douleur réelle sur les sagas.
6. **L'export EPUB** : demande concrète (lire sur Kindle/Kobo).
7. **La reprise serveur** (traduire sans garder l'onglet ouvert) : douleur réelle sur mobile.
8. **Le mode bilingue côte à côte** : usage d'apprentissage/contrôle qualité.

---

## 13. Pages nécessaires avant monétisation
**Déjà présentes** : `/connexion` (auth + inscription), `/bibliotheque`, `/livres/[id]`, `/api/translate`, `/manifest.webmanifest`.
**À améliorer** : `/` (aujourd'hui simple redirection — doit devenir la présentation publique du produit), `/bibliotheque` (état vide, chapitres en erreur), `/livres/[id]` (navigation mobile, erreurs visibles), `/connexion` (mot de passe oublié, message de confirmation e-mail).
**Manquantes, obligatoires avant paiement** : `/tarifs`, `/faq`, `/confidentialite`, `/conditions` (CGU/CGV), `/mentions-legales`, `/contact`, `/compte` (profil, plan, quota consommé, suppression de compte et de données), tunnel de paiement + `/paiement/succes` et `/paiement/echec` (pages de confirmation), `/credits` (plus tard), pages `error.tsx` / `loading.tsx` / `not-found.tsx` à la charte.
**Souhaitables** : `/favoris`, `/aide` (formats de fichiers, qualité de PDF), `/nouveautes` (journal des évolutions).

---

## 14. Scalabilité
- **10 utilisateurs** : tient avec l'endpoint Google non officiel. Supabase/Vercel Hobby suffisent. Risque : aucune limite d'abus.
- **100** : premier vrai mur — ~400 requêtes simultanées sur un endpoint non contractuel → 429/blocages pour tout le monde, aucune rotation de clé. Il faut : batching (plusieurs segments par requête), rate-limiting serveur, et un moteur auto-hébergé (VM Oracle + LibreTranslate) ou Gemini activé.
- **1 000** : quotas épuisés ; Supabase Free saturé vers ~200 livres traduits ; chaque chapitre page tout son contenu à chaque reprise (lectures O(n) répétées, `useMoteurTraduction.ts:90-97,164-172`) ; ~2,7 M invocations Vercel/mois ; aucune reprise possible si le navigateur se ferme.
- **10 000** : nécessite une refonte : file de traitement serveur (worker + queue), pool de clés/quotas par utilisateur ou moteur interne, batching, index/partition du stockage, plan Supabase payant, monitoring.
- **Goulots structurels** : (1) aucun rate-limiting ; (2) aucun fallback entre fournisseurs ; (3) traitement dépendant du client ; (4) stockage du texte en double (chapitres **et** segments) ; (5) pas de métrique d'usage.

---

## 15. Checklist avant monétisation

### P0 — BLOQUANT
- [ ] Aucune monétisation n'existe (ni paiement, ni plan, ni quota) → à construire de zéro.
- [ ] Rate-limiting sur `/api/translate` + plafond mensuel par compte (anti-abus et anti-coût).
- [ ] Quota d'usage par utilisateur, mesuré et affiché (caractères traduits / mois).
- [ ] Pages légales : CGU/CGV, confidentialité, mentions légales, contact.
- [ ] Information explicite sur le transit du texte vers un tiers + choix du moteur.
- [ ] Suppression de compte et de toutes les données (droit à l'effacement).
- [ ] Suppression effective du fichier original du bucket lors de la suppression d'un livre.
- [ ] Correction du bug des segments bloqués en `en_cours` (reprise incomplète prouvée en prod).
- [ ] Moteur de production fiabilisé : LibreTranslate déployé (VM Oracle) ou Gemini activé + chaîne de fallback.
- [ ] Landing page publique : expliquer le concept, les formats, le prix et la promesse avant inscription.

### P1 — IMPORTANT (avant lancement commercial)
- [ ] Pages tarifs, FAQ, compte/profil ; pages d'erreur et de chargement à la charte.
- [ ] Mot de passe oublié + gestion du flux de confirmation e-mail.
- [ ] Cohérence de traduction : glossaire de personnages, contexte glissant, mémoire.
- [ ] Notification de fin de traduction (au minimum un badge à la reconnexion).
- [ ] Signalement des chapitres en erreur dans la bibliothèque et le sommaire.
- [ ] Lecteur mobile : tiroir de chapitres, chapitre suivant/précédent.
- [ ] Marque-pages et recherche sur tout le livre.
- [ ] Monitoring (erreurs, quotas, temps moyens) et journalisation sans fuite de texte.
- [ ] Purge automatique des originaux des livres non consultés (durée à fixer).

### P2 — APRÈS LANCEMENT
- [ ] Export EPUB ; mode bilingue côte à côte.
- [ ] Reprise de traduction côté serveur (sans onglet ouvert).
- [ ] File d'attente et priorité Premium ; crédits pour gros livres.
- [ ] Optimisation : batching de segments, suppression du double stockage du texte.
- [ ] Content warnings / classification d'âge / tropes (sécurité communautaire + identification du genre).
- [ ] Page favoris ; catégories et tri par genre/trope.

### P3 — PLUS TARD
- [ ] OCR des PDF scannés ; import DOCX.
- [ ] Traduction simultanée vers plusieurs langues cibles.
- [ ] Réduction du nombre de langues proposées au lancement (en→fr d'abord).
- [ ] Nettoyage des ~30 scripts de développement ; script `npm test` réel.
- [ ] Nettoyage des 3 voies d'export PDF et du thème « encre ».

---

## 16. Rapport final

### État actuel (pourcentages argumentés, critères explicites)
- **Produit : 70 %.** Le parcours cœur (importer → traduire → lire → exporter) fonctionne de bout en bout et est utilisé en réel (12 livres, 2 149 segments traduits). Manquent : page publique, marque-pages, bilingue côte à côte, EPUB, profil, navigation mobile du lecteur, gestion visible des erreurs.
- **UX/UI : 65 %.** Identité graphique et lecteur nettement au-dessus de la moyenne ; mais aucune découverte (le site ne se présente pas), navigation mobile pénible, pages d'état absentes, quelques incohérences (tokens CSS dupliqués, wording fautif, couleur de manifest divergente).
- **Traduction : 55 %.** Moteur robuste (parallélisme, retry, reprise, multi-fournisseurs, assemblage fidèle 1:1) mais **aucune cohérence inter-chapitres ni glossaire**, pas de fallback automatique, et la production tourne sur un endpoint Google non officiel.
- **Sécurité : 60 %.** RLS complète et vérifiée sur les 5 tables, bucket privé étanche, aucune clé privilégiée exposée ; manquent rate-limiting, purge des fichiers, effacement du compte, cadre légal, et le transit vers un tiers non contractuel est un risque juridique et de réputation.
- **Infrastructure : 45 %.** Fonctionne en Hobby/Free pour quelques dizaines d'utilisateurs ; aucun monitoring, aucune sauvegarde, aucune file serveur, dépendance à l'onglet ouvert, quotas gratuits non dimensionnés au-delà de ~50 utilisateurs.
- **Monétisation : 5 %.** Rien n'existe : ni paiement, ni plan, ni quota, ni page tarifs, ni mesure d'usage.

### Gratuité recommandée
**≈ 85-90 % du produit doit rester gratuit au lancement** : import, traduction d'**un livre entier par mois**, lecture complète et confortable, exports, favoris, reprise. Raison : la valeur perçue est binaire (un livre traduit et lisible, sinon rien) et le coût marginal réel est ~0-1 $/livre. Facturer trop tôt ou plafonner au milieu d'un livre détruirait l'acquisition sans protéger grand-chose. Le Premium doit financer le volume, la qualité, la vitesse et la cohérence — jamais l'accès de base.

### Modèle économique recommandé
```
FREE — 1 livre complet / mois (≤ 400 000 car.)
   · import, traduction, lecture complète, exports, favoris, reprise
        ↓
PREMIUM — 3-5 €/mois
   · 7 livres/mois, traduction prioritaire et sans onglet ouvert
   · qualité littéraire supérieure, glossaire + mémoire de traduction
   · export EPUB, mode bilingue, marque-pages, historique illimité
        ↓
PHASE 2 — crédits pour les très gros livres ponctuels (jamais d'obligation)
```

### Ce qui manque avant monétisation (liste minimale)
1. Paiement + gestion d'abonnement + pages de confirmation.
2. Quota d'usage par compte, mesuré, affiché, avec rate-limiting serveur.
3. Droit à l'effacement (compte + fichiers + originaux).
4. Pages légales et information sur le transit du texte.
5. Fiabilisation du moteur de production (LibreTranslate auto-hébergé ou Gemini + fallback).
6. Landing page publique.
7. Correction du bug de reprise (`en_cours` orphelins).

### Verdict de préparation
**PAS ENCORE PRÊT À MONÉTISER.**

Le cœur produit fonctionne et la qualité visuelle est excellente, mais il n'existe aujourd'hui **aucun mécanisme de contrôle** : ni paiement, ni quota, ni limite d'appels, ni page légale, ni suppression de compte, ni moteur de production réellement maîtrisé — la production dépend d'un endpoint Google non officiel, sans contrat, qui peut bloquer à tout moment et vers lequel le texte intégral des livres est envoyé. Faire payer dans ces conditions exposerait à un risque juridique (contenus protégés, RGPD), à une panne partagée par tous les utilisateurs, et à des coûts non maîtrisables en cas d'abus.

Le chemin est court : 3 chantiers techniques (quota + rate-limiting, moteur de production fiabilisé, purge/effacement), 1 chantier légal (4 pages), 2 chantiers produit (landing page, correction de la reprise). Une fois ces 6 points faits, le produit est monétisable — et le coût marginal vérifié (~1 $/livre en Gemini payant) rend un Premium à 3-5 €/mois confortablement rentable.
