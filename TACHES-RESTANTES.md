# Plume d'Ombres — Tâches restantes
> Mise à jour du 1er octobre 2026 (v2) : intègre l'audit complet (`AUDIT-PLUME-OMBRES.md`) et les deux recherches menées sur le stockage des livres et TeraBox.
> Chaque tâche a un identifiant : dis-moi « fais A2, B1, C3 » et j'enchaîne.

---

## 0. Décisions d'architecture validées

| Sujet | Décision | Justification vérifiée |
|---|---|---|
| Moteur de traduction | **LibreTranslate auto-hébergé** (gratuit et privé) + Gemini Flash en option rapide + **chaîne de fallback automatique** | Seul moteur qui garantit la confidentialité. Oracle Always Free = **2 OCPU ARM / 12 Go** (réduit le 15/06/2026), 10 To d'egress/mois. ⚠️ **Le compte Oracle n'est pas encore créé** : ne rien bloquer dessus, le moteur actuel doit rester fonctionnel en attendant. |
| Confirmation e-mail / inscription | **Vercel Hobby est interdit pour tout usage commercial** (documentation officielle : « Asking for Donations fall under commercial usage ») | Le jour où le projet se monétise, Hobby devient non conforme et peut être coupé **sans préavis**. À trancher avant de faire payer (Vercel Pro ~20 $/mois, ou autre hébergeur). |
| Stockage des livres | **Arrêt du stockage du fichier original** (le texte est déjà en base) ; Supabase Storage (1 Go) pour les rares fichiers à garder ; **Backblaze B2** (10 Go, sans carte bancaire, API S3 officielle) en débordement si besoin | Deux recherches le confirment : le fichier original n'a qu'un usage irremplaçable (export « PDF fidèle »), qui peut être généré à la volée. Gain : 1 Go et l'egress préservés, plus de contenu tiers conservé. |
| TeraBox | **Verdict : NON en stockage primaire.** Faisable techniquement, mais hors chemin critique : archive froide optionnelle uniquement | Testé le 01/10/2026 : l'upload local par blocs existe (`precreateFile` → `superfile2` → `createFile`), MAIS API interne non documentée et cassant régulièrement, session = cookie navigateur à rafraîchir, dlink valable ~1 h (2-5 min selon les tiers), téléchargement gratuit bridé à 1 fichier à la fois, 4 Go max/fichier, CGU autorisant la réduction de l'espace gratuit en cas d'inactivité, risque de blocage de compte sans recours. |
| Chemin « lien fourni par l'utilisateur » | **Second chemin optionnel**, jamais le chemin principal | Testé : pCloud (API `getpublinkdownload`, sans clé, expire en 24 h) et Google Drive (`drive.usercontent.google.com/download?...&confirm=t`) renvoient bien les vrais octets. Mais c'est un frein majeur : ~40 % des cas réels échouent (lien privé, expiré, mauvaises permissions). |
| Front | **Refonte complète**, en commençant par découper `EspaceLivre.tsx` (1 085 lignes, cause réelle du manque de fluidité) | Composant monolithe qui re-rend tout le lecteur à chaque changement d'état. |
| Immersion | **Étendre le canvas WebGL existant** + vidéos courtes (≤2 Mo) uniquement sur les pages publiques | Contraintes : `prefers-reduced-motion`, économie de données, batterie. |

---

## CHANTIER A — Moteur de traduction gratuit et fiable

- [ ] **A1.** Quand le compte Oracle sera créé : VM Ampere A1 (**2 OCPU / 12 Go**, Ubuntu 24.04 ARM) + IP publique réservée.
- [ ] **A2.** Installer LibreTranslate (Docker) avec `LT_LOAD_ONLY=en,fr`, clé API, redémarrage automatique.
- [ ] **A3.** Exposer en HTTPS : sous-domaine + Caddy (Let's Encrypt). Sans URL publique, LibreTranslate reste inutilisable en prod (défaut actuel : `127.0.0.1:5000`).
- [ ] **A4.** Bench réel sur la VM : caractères/seconde mesurés, temps par livre de 600 pages. Remplacer les estimations par des chiffres.
- [ ] **A5.** Configurer `LIBRETRANSLATE_URL` et `LIBRETRANSLATE_API_KEY` dans les variables de production Vercel.
- [x] **A6.** **Chaîne de fallback automatique** — LIVRÉE (vague 6). `traduireAvecSecours()` essaie les moteurs DANS L'ORDRE (LibreTranslate → Gemini → Google → MyMemory) et bascule automatiquement sur échec (réseau, timeout, 429/quota, 5xx, réponse invalide ou vide). Délai maximal par tentative (`TRANSLATOR_FALLBACK_TIMEOUT_MS`, défaut 20 s) et tentatives BORNÉES par moteur (`TRANSLATOR_FALLBACK_ESSAIS`, défaut 1, plafond 3). Ordre configurable sans redéploiement. La route `/api/translate` utilise désormais la chaîne (plus de fournisseur unique). Preuve réelle : panne du moteur privé provoquée en plein chapitre → bascule mesurée, 0 segment perdu, 0 doublon.
- [x] **A7.** **Contrôle de santé RÉEL** — LIVRÉ (vague 6) : `lib/providers/sante.ts` sonde chaque moteur par un appel court, résultat mis en cache (`TRANSLATOR_SANTE_TTL_MS`, défaut 5 min) ; route `GET /api/translate/sante` **réservée aux admins** (`?forcer=1` pour ignorer le cache) ; affichage dans l'espace admin (moteur actif, état, latence, confidentialité). **Reste : l'alerte automatique (cron) si la VM tombe → nouvelle tâche A11.**
- [x] **A8.** **Défaut de production TRANCHÉ et AFFICHÉ** — LIVRÉ (vague 6). Défaut = **LibreTranslate auto-hébergé en tête de chaîne** (privé, gratuit) ; Google non officiel n'est plus jamais choisi par défaut. L'admin voit, par moteur, « où va le texte » (auto-hébergé vs transmis à un tiers). **Côté utilisateur : AUCUN nom de fournisseur** (promesse produit) — seule la mention de confidentialité est affichée.
- [ ] **A9.** Réduire les langues proposées au lancement (en→fr d'abord) et n'élargir qu'ensuite.
- [ ] **A10.** Option Premium : moteur supérieur quel que soit le défaut.
- [ ] **A11.** **Alerte** si le moteur privé (ou toute la chaîne) devient indisponible : cron qui appelle `/api/translate/sante` et notifie (suite d'A7).
- [ ] **A12.** **Mode privé strict** (`TRANSLATOR_PRIVE_STRICT=1`) : verrou CENTRAL appliqué dans la chaîne (ordre réduit à l'auto-hébergé), donc impossible à contourner par une route ou une tâche d'arrière-plan — DÉJÀ IMPLÉMENTÉ ET TESTÉ (vague 6) ; reste à décider s'il devient le défaut de production.

> **Modèle Gemini (vague 6)** : `GEMINI_MODEL` par défaut = `gemini-flash-latest`. La famille 2.5 explicite est **refusée aux nouveaux comptes** (HTTP 404) et l'alias principal peut renvoyer **503 (forte demande)** : le fournisseur bascule alors automatiquement sur `gemini-flash-lite-latest` avant d'abandonner. Constaté en réel : `gemini-2.5-flash` → 404, `gemini-2.5-flash-lite` → 404, `gemini-flash-lite-latest` → 200.

> **Coûts mesurés (hypothèse roman 100 000 mots ≈ 150 000 tokens entrée + autant en sortie)** : Gemini payant ≈ **0,68 $/livre en 2026** (~405 FCFA), **1,35 $/livre en 2027**. Google Cloud Translation ≈ 12 $/livre → écarté. Gratuit Gemini : 100 requêtes/livre, RPD 250–500 → **~75 à 150 livres/mois**. LibreTranslate auto-hébergé : **aucune limite**, c'est lui qui portera la charge.

---

## CHANTIER B — Stockage et poids des données (réécrit après recherche)

### B-1. Ne plus stocker les originaux (gain immédiat, 0 €)
- [ ] **B1.** Migration : supprimer le double stockage `chapitres.texte_source` / `texte_traduit` (redondant avec les segments) et recalculer l'estimation de lecture depuis les segments.
- [ ] **B2.** Arrêter le stockage du fichier original à l'import (le texte du livre est déjà intégralement en base : `chapitres.texte_source` + `segments.source`).
- [ ] **B3.** Stocker 3 nombres en base (largeur, hauteur, marge d'en-bloc du PDF) pour que `lib/pdf-traduit.ts` reproduise la géométrie — remplace `mesurerOriginalPdf` qui exige le binaire.
- [ ] **B4.** Supprimer le bouton « Télécharger l'original » (`EspaceLivre.tsx:464-483`) : il rend à l'utilisateur un fichier qu'il possède déjà, en consommant du stockage et de l'egress.
- [ ] **B5.** Export « PDF — mise en page d'origine » : le générer **pendant la session d'import** (le fichier est en mémoire) ou sur re-sélection locale du fichier — jamais depuis un stockage serveur.
- [ ] **B6.** Migration : vider/désactiver le bucket `originaux` ; vérifier le gain réel (25 Mo de base aujourd'hui pour 12 livres).

### B-2. Si un stockage de fichiers reste nécessaire
- [ ] **B7.** Primaire : **Supabase Storage** (déjà en place, 1 Go, RLS, 50 Mo max/fichier).
- [ ] **B8.** Débordement : **Backblaze B2** (10 Go gratuits, **sans carte bancaire**, API S3 officielle, société cotée) — meilleur rapport fiabilité/effort.
- [ ] **B9.** Alternatives écartées et pourquoi : Cloudflare R2 (10 Go, egress gratuit, mais **carte bancaire obligatoire**) · Oracle Object Storage (20 Go, **CB + téléphone**) · Gozunga (100 Go mais société de 2024, ~1 salarié, aucun avis tiers → jamais en primaire) · Telegram (stockage illimité mais **téléchargement bot plafonné à 20 Mio**, donc inutilisable >20 Mo sans serveur Bot API local).
- [ ] **B10.** Purge : supprimer le fichier quand le livre est supprimé + expiration automatique (durée à fixer).

### B-3. TeraBox — archive froide optionnelle (hors chemin critique)
> Verdict de recherche : utilisable **uniquement** comme copie d'archivage tierce, jamais comme copie unique, et seulement après un test réel depuis une IP Vercel.
- [ ] **B11.** **Spike de validation** (prérequis à tout développement) : avec un compte TeraBox réel, uploader un EPUB de test puis re-télécharger le dlink **depuis une IP datacenter**. Critère de bascule : si le fetch du dlink (Cookie + User-Agent TeraBox) ne renvoie pas 200/302 → on abandonne TeraBox définitivement.
- [ ] **B12.** Si le spike est concluant : job d'archivage **séparé et planifié** (jamais dans le parcours utilisateur), via `terabox-api` v2.9.5 (login → `precreateFile` → upload par blocs → `createFile` → re-`getFileMeta` avec contrôle md5/taille).
- [ ] **B13.** Stocker en base `(fs_id, path, md5, size)` — **jamais le dlink** (valable ~1 h, à re-générer à la demande).
- [ ] **B14.** Re-login périodique automatisé (le cookie `ndus` se périme ; captcha/2FA probable) + désactivation automatique en cas d'erreur `4000023` / `400310`.
- [ ] **B15.** Ne jamais supprimer la source (Supabase/B2) avant vérification d'intégrité de la copie TeraBox.

### B-4. Chemin « lien fourni par l'utilisateur » (option secondaire)
- [ ] **B16.** Route serveur `app/api/import-lien/route.ts` : valider le lien, `fetch()` le fichier côté serveur, contrôler taille (≤50 Mo) et type (magic bytes), extraire le texte, écrire en base — **et ne renvoyer au navigateur qu'un statut JSON** (limite Vercel : 4,5 Mo par requête/réponse).
- [ ] **B17.** Hébergeurs supportés en v1, dans cet ordre et pas plus : **pCloud** (le plus fiable, testé) puis **Google Drive**. Ajouter archive.org si besoin.
- [ ] **B18.** Messages d'erreur explicites pour les 4 échecs typiques : lien privé, lien expiré, permission modifiée, fichier inaccessible. Ne jamais faire croire à un bug.
- [ ] **B19.** Garder l'**upload classique comme chemin principal** : le « colle un lien » ne doit jamais devenir obligatoire.

### B-5. Confidentialité
- [ ] **B20.** Politique de confidentialité : dire quel moteur voit le texte, ce qui est conservé, ce qui est effacé.
- [ ] **B21.** Suppression de compte et de toutes les données (droit à l'effacement).

---

## CHANTIER C — Refonte front et fluidité de lecture

- [x] **C1.** Découper `components/EspaceLivre.tsx` (1 085 lignes) : lecteur, barre d'actions, sommaire, exports, panneau de réglages.
- [x] **C2.** Fluidité : mémoïsation, suppression des re-renders inutiles, `content-visibility` sur les longs chapitres, calcul de scroll allégé.
- [x] **C3.** Mobile : tiroir de chapitres (le texte en premier), boutons « chapitre suivant / précédent », bandeau d'actions condensé.
- [x] **C4.** **Landing page publique** : présenter le concept, les formats, la promesse et le prix avant l'inscription.
- [ ] **C5.** Bibliothèque : états vides soignés, chapitres en erreur visibles, cartes revues, page favoris.
- [x] **C6.** Pages légales et utilitaires : tarifs, FAQ, mentions légales, CGU/CGV, confidentialité, contact, compte.
- [ ] **C7.** Pages d'état : `error.tsx`, `loading.tsx`, `not-found.tsx` à la charte.
- [ ] **C8.** Accessibilité : contrastes, focus clavier, cibles tactiles, `prefers-reduced-motion`.
- [x] **C9.** Corrections relevées à l'audit : tokens CSS `nuit-800`/`850` identiques, couleur de manifest ≠ viewport, wording « ne murmura plus », largeur du popup de réglages sur petit écran, orientation `portrait` forcée.
- [x] **C10.** Bug de reprise : les segments bloqués en `en_cours` ne sont jamais retraités (8 orphelins constatés en prod ; un chapitre peut être marqué « traduit » avec un trou).

---

## CHANTIER D — Immersion : fonds animés

- [ ] **D1.** Cahier des charges visuel : 3 scènes dark romance (brume et braises / plume et encre / nuit d'orage).
- [x] **D2.** Technique choisie par coût réel : shader/canvas (déjà en place, le plus léger) vs vidéo en boucle (plus riche, plus lourde).
- [ ] **D3.** Budget : vidéo ≤ 2 Mo, AV1/HEVC + poster WebP, `preload="none"`, jamais sur le chemin critique.
- [x] **D4.** Repli automatique : image fixe si `prefers-reduced-motion`, `saveData`, connexion lente ou batterie faible.
- [x] **D5.** Intégration : fond global des pages publiques + bordure discrète du lecteur — **jamais derrière le texte lu**.
- [ ] **D6.** Test mobile réel : FPS, batterie, données consommées.

---

## CHANTIER E — Apparence, navigation et profil (vague 5)

- [x] **E1.** Système de thèmes du site ENTIER (palettes, intensité du fond) accessible depuis toutes les pages, pas seulement le lecteur.
- [x] **E2.** Typographie dark romance : polices auto-hébergées, titres et corps renouvelés.
- [x] **E3.** Panneau « Apparence » (palette, typographie, fond) au clavier, persisté, anti-FOUC.
- [x] **E4.** Navigation professionnelle : tous les liens du site + menu utilisateur + menu mobile + état actif.
- [x] **E5.** Pied de page et liens légaux visibles ; pages légales complètes.
- [x] **E6.** Pages publiques remises à niveau (accueil, tarifs, FAQ, contact).
- [x] **E7.** Fond d'ambiance refait (décor dark romance, repli `prefers-reduced-motion`, perf mesurée).
- [x] **E8.** Profil utilisateur `/compte` : identité, apparence, favoris, suppression de compte.

## CHECKLIST MONÉTISATION

### P0 — BLOQUANT (avant d'encaisser le moindre euro)
- [ ] **P0.1** **Hébergement commercial** : Vercel Hobby interdit tout usage commercial (dons inclus) → passer à Pro (~20 $/mois) ou changer d'hébergeur avant toute monétisation.
- [x] **P0.2** Quota d'usage par compte (caractères traduits/mois), mesuré et affiché.
- [x] **P0.3** Rate-limiting serveur sur `/api/translate` (aujourd'hui : appels illimités).
- [x] **P0.4** Moteur de production fiabilisé (chantier A) — **CODE LIVRÉ (vague 6)** : chaîne de repli ordonnée + santé réelle. ⚠️ **La bascule prod n'est effective qu'après A5** (renseigner `LIBRETRANSLATE_URL` + `GEMINI_API_KEY` dans les variables Vercel) : sans elles, la chaîne traverse LibreTranslate (injoignable) et Gemini (clé absente) avant d'atteindre Google non officiel — elle ne CASSE plus, mais elle n'est pas encore privée.
- [ ] **P0.5** Pages légales : CGU/CGV, confidentialité, mentions légales, contact, information sur le transit du texte.
- [x] **P0.6** Suppression de compte et de toutes les données.
- [x] **P0.7** Bug de reprise `en_cours` corrigé (tâche C10).
- [x] **P0.8** Landing page publique (tâche C4).
- [ ] **P0.9** Paiement + abonnement + pages de confirmation succès/échec. **MODÈLE TRANCHÉ (vague 6) → PAY-AS-YOU-GO par crédits prépayés, PAS d'abonnement mensuel obligatoire** (voir encadré ci-dessous).
- [ ] **P0.10** Décision stockage tranchée (chantier B) : plus aucun fichier original conservé par défaut.

> ### Décision P0.9 — « pay as you go » (crédits prépayés)
> **Pourquoi ce modèle plutôt qu'un abonnement mensuel** : la clientèle visée paie en Mobile Money, avec des revenus irréguliers. Un prélèvement mensuel est une barrière à l'entrée et un risque d'impayés ; le prépayé convertit mieux, encaisse d'avance et supprime tout recouvrement.
> **Règles retenues :**
> 1. **Le quota gratuit mensuel est conservé** (400 000 caractères ≈ deux tiers d'un livre) : on peut essayer sans payer.
> 2. **Quand le quota gratuit est épuisé, on puise dans les crédits** achetés — jamais de blocage brutal, jamais de perte du travail en cours.
> 3. **Packs indicatifs** (à arrêter avec un comptable) : 500 FCFA = 250 000 car. · **1 000 FCFA = 600 000 car. (~1 livre)** · 2 500 FCFA = 1,8 M car. (~3 livres, −17 %) · 5 000 FCFA = 4 M car. (~7 livres, −33 %).
> 4. **Pas d'expiration** des crédits (ou 12 mois — à trancher au lancement).
> 5. **Encaissement FedaPay** (Mobile Money) ; le solde est crédité **au webhook de succès**, jamais à l'initiation.
> 6. **La traduction déjà payée n'est jamais perdue** : le quota est rendu si la traduction échoue.
> **À implémenter** : tables `packs_credits` + `credits_traduction` + `credits_mouvements`, `reserver_quota` étendu (gratuit → crédits), page `/abonnement` (solde + packs), branchement webhook. **Hors vague 6 (non lancé).**

### P1 — IMPORTANT (avant lancement commercial large)
- [x] **P1.1** Cohérence de traduction : glossaire de personnages/lieux + contexte glissant (principal déficit de qualité).
- [x] **P1.2** Notification de fin de traduction (au minimum un badge à la reconnexion).
- [ ] **P1.3** Chapitres en erreur signalés dans la bibliothèque et le sommaire.
- [ ] **P1.4** Mot de passe oublié + gestion du flux de confirmation e-mail.
- [ ] **P1.5** Marque-pages, recherche sur tout le livre, export EPUB, mode bilingue côte à côte.
- [ ] **P1.6** Monitoring : erreurs, quotas, temps moyens ; logs sans fragments de texte.
- [ ] **P1.7** Sauvegarde de la base (le Free Supabase n'en fournit pas).
- [x] **P1.8** Content warnings / classification d'âge / tropes (attente de la communauté + identification du genre).
- [ ] **P1.9** Route `/api/import-lien` (tâches B16-B18) si le chemin lien est retenu.

### P2 — APRÈS LANCEMENT
- [ ] **P2.1** Reprise de traduction côté serveur (sans onglet ouvert) + file d'attente avec priorité Premium.
- [ ] **P2.2** Crédits pour les très gros livres ponctuels.
- [ ] **P2.3** Batching de segments (plusieurs par requête) pour diviser les invocations Vercel.
- [ ] **P2.4** Catégories, tri par genre/trope, découverte.
- [ ] **P2.5** Statistiques d'usage et tableau de bord admin.

### P3 — PLUS TARD
- [ ] **P3.1** OCR des PDF scannés ; import DOCX.
- [ ] **P3.2** Traduction simultanée vers plusieurs langues cibles.
- [ ] **P3.3** Nettoyage : 3 voies d'export PDF, thème « encre », ~30 scripts de dev, vrai `npm test`.
- [ ] **P3.4** PWA hors-ligne réelle (aujourd'hui le service worker ne sert que la coquille).
- [ ] **P3.5** TeraBox en archivage étendu si le spike B11 est concluant.

---

## Ordre d'exécution — vagues restantes

**Vague 6 (celle-ci) — CLOSE.** Moteur de traduction fiabilisé (A6, A7, A8, A12) + décision pay-as-you-go (P0.9). Fusionnée dans `main` et poussée.

| Vague | Contenu | But |
|---|---|---|
| **W7** | **B1 → B6, B10** (ne plus stocker les originaux) + **A9** (réduire les langues à en→fr) | Allègement immédiat, 0 €, gros effet |
| **W8** | **C5, C7, C8** (bibliothèque, pages d'état, accessibilité) + **P1.3** (chapitres en erreur visibles) | Finir l'interface, aucune donnée muette |
| **W9** | **P0.1** (hébergement commercial), **P0.9** (pay-as-you-go : crédits, FedaPay), **P0.5** (CGU/CGV + information sur le transit du texte), **P0.10** | **Vague qui permet d'encaisser** |
| **W10** | **P1.4** (mot de passe oublié), **P1.6** (monitoring), **P1.7** (sauvegarde BDD), **A11** (alerte cron) | Exploitation fiable |
| **W11** | **P2** (reprise serveur, batching, catégories, stats) puis **P3** | Après lancement |

**Hors vague — bloquant la promesse « texte privé » en production** : **A1 → A5** (VM Oracle Always Free, LibreTranslate en HTTPS, variables Vercel). Tant que ce n'est pas fait, la chaîne ne casse plus mais traverse des moteurs tiers.

**Total : 4 vagues (W7 → W10) avant de pouvoir encaisser**, puis W11 après lancement.

Détail historique de l'ordre :
1. **B1 → B4** : allègement immédiat (0 €, gros effet, aucune dépendance externe). → **W7**
2. **C10** (bug de reprise) + **A6** (chaîne de fallback) : fiabilité. → **FAIT (vague 6)**
3. **A1 → A5** quand le compte Oracle est créé ; sinon **P0.4** reste partiellement ouvert. → **hors vague, prioritaire**
4. **C1 → C2 → C3** : fluidité et refonte du lecteur. → **FAIT (vagues 2-5)**
5. **P0.5** : cadre légal. → **W9**
6. **P0.1 → P0.9** : hébergement commercial, pay-as-you-go. → **W9**
7. **B11** (spike TeraBox) en tâche de fond, sans jamais bloquer le reste.
