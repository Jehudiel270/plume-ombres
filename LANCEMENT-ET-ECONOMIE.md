# Plume d'Ombres — Lancement : ce qu'il te reste + économie unitaire

*Document de travail — 10 octobre 2026. Chiffres issus du catalogue réel (`public.plans_abonnement`, `public.packs_credits`) et des tarifs publics FedaPay.*

---

## A. Il te reste 3 actions (rien d'autre)

| # | Action | Où | Pourquoi |
|---|---|---|---|
| 1 | **Compte Oracle Cloud Always Free** | cloud.oracle.com | Héberger LibreTranslate → **moteur de traduction privé et gratuit**, et supprimer le `127.0.0.1:5000` actuel (injoignable en prod) |
| 2 | **Rechargement automatique Gemini** | aistudio.google.com → *Billing* → **Prepay** → *Setup auto-reload* | Ne plus recharger à la main : seuil + montant + plafond mensuel |
| 3 | **KYC FedaPay** | tableau de bord FedaPay | Sans validation du compte marchand, **pas d'encaissement réel** |

**Le 4ᵉ, gratuit et 2 minutes (fortement conseillé)** : Netlify → *Team settings → Members* → approuver `Jehudiel270` comme **Git Contributor** (ou activer l'auto-approbation). Sinon chaque déploiement oblige à repasser le dépôt en public.

> Rappel Gemini (action 2) : *seuil 5 $, recharge 20 $, plafond mensuel 50 $*. Un livre coûte ~0,50 $ → tu ne touches plus à rien pendant des dizaines de traductions. Et **restreins la clé** à `generativelanguage.googleapis.com` (obligatoire depuis juin 2026).

---

## B. Combien tu gagnes par traduction

**Hypothèses de calcul**
- **1 roman ≈ 600 000 caractères** (référence utilisée dans le site lui-même).
- **Gemini 2.5 Flash payant** : 0,30 $/M de tokens en entrée, 2,50 $/M en sortie.
  600 000 caractères ≈ 150 k tokens en entrée + ~180 k en sortie → **≈ 0,50 $ ≈ 300 F CFA par roman**.
- **FedaPay Bénin (encaissement Mobile Money)** : **1,80 %** (MTN, Moov, Celtiis). Retrait vers Mobile Money : **gratuit**.
- Parité retenue : 1 $ ≈ 600 F CFA.

### Packs de crédits — ta meilleure marge

| Pack | Prix | Caractères | ≈ romans | Coût IA | **Marge nette** | % |
|---|---|---|---|---|---|---|
| Découverte | 500 F | 250 000 | 0,4 | 125 F | **≈ 366 F** | **73 %** |
| Lecteur | 1 000 F | 600 000 | 1 | 300 F | **≈ 682 F** | **68 %** |
| Bibliothèque | 2 500 F | 1 800 000 | 3 | 900 F | **≈ 1 555 F** | **62 %** |
| Collection | 5 000 F | 4 000 000 | 6,7 | 2 000 F | **≈ 2 910 F** | **58 %** |

### Abonnements — pire cas (le client consomme **tout** son quota)

| Offre | Prix | Quota | ≈ romans | Coût IA | **Marge nette** | % |
|---|---|---|---|---|---|---|
| Lecteur mensuel | 1 500 F | 1,2 M/mois | 2 /mois | 600 F | **≈ 873 F** | 58 % |
| Lecteur annuel | 14 400 F | 14,4 M/an | 24 /an | 7 200 F | **≈ 6 941 F** | 48 % |
| Passionné mensuel | 3 500 F | 4 M/mois | 6,7 /mois | 2 000 F | **≈ 1 437 F** | 41 % |
| Passionné annuel | 33 600 F | 48 M/an | 80 /an | 24 000 F | **≈ 8 995 F** | 27 % |
| Illimité mensuel | 9 000 F | 25 M/mois | 41,7 /mois | 12 500 F | **− 3 662 F** | **perte** |
| Illimité annuel | 90 000 F | 300 M/an | 500 /an | 150 000 F | **− 61 620 F** | **perte** |

### 3 alertes à connaître

1. **« Illimité » est structurellement à perte** (−3 700 F/mois, −61 600 F/an si le quota est consommé). Il est **masqué** aujourd'hui : garde-le masqué, ou baisse son quota à ~10 M de caractères (coût ≈ 5 000 F → marge ≈ 4 000 F).
2. **Chaque utilisateur gratuit actif te coûte ≈ 200 F/mois** (400 000 caractères). **100 utilisateurs gratuits actifs = 20 000 F/mois de ta poche**. C'est ton vrai budget d'acquisition.
3. **École annuel** : 21 600 F/personne/an pour 4 M/mois. À 11 personnes qui consomment tout, le coût dépasse le prix. Plafonne-le (usage raisonnable) ou réduis le quota.

### 3 leviers pour gagner plus

- **Pousser les packs** (58–73 % de marge) plutôt que les abonnements (27–48 %). Un « 1 livre à 1 000 F » se vend mieux qu'un abonnement, et rapporte plus.
- **Garder Gemini en 1ᵉʳ moteur externe** : son palier gratuit (1 500 requêtes/jour, sans carte) absorbe la majorité du trafic — tu ne paies que le dépassement. Le mettre **en dernier** ne fait pas économiser : ça envoie les traductions vers Google non officiel et MyMemory (qui plafonne à ~50 000 caractères/jour, soit **moins d'un livre**).
- **L'essai gratuit coûte ≈ 900 F par compte** (3 livres max). À suivre comme un coût d'acquisition, pas comme une dépense subie.

---

## C. Ce dont j'ai besoin pour l'après-MVP

### Déjà en ma possession (rien à faire)
Supabase (URL, clé anon, service_role, mot de passe base, jeton d'API) · FedaPay live (clés + secret webhook) · Gemini (clé + modèle) · SMTP Brevo · jeton Netlify · les 2 comptes GitHub.

### À me fournir, chantier par chantier

| Chantier d'amélioration | Ce qu'il me faut de ta part |
|---|---|
| **LibreTranslate auto-hébergé** (moteur privé) | IP publique + accès SSH à la VM Oracle (ou la clé) → je déploie et branche `LIBRETRANSLATE_URL` |
| **TTS neuronal (Piper)**, extraits audio | même VM (RAM/CPU) — rien à acheter |
| **Notifications push** (fin de traduction, séries) | rien : je génère la paire de clés VAPID |
| **Sync cloud, hors-ligne, recherche bilingue, notes/surlignage, séries, content warnings** | rien : Supabase suffit, quotas gratuits largement suffisants |
| **Glossaire auto / résumés de chapitres** | la clé Gemini + l'auto-reload (= action n°2) |
| **Domaine propre** | achat du domaine + accès à la zone DNS |
| **Paiement par carte** (en plus du Mobile Money) | couvert par le KYC FedaPay (action n°3) |

### Dépendances externes gratuites à garder vivantes
Supabase Free (**500 Mo — à surveiller**, la base grossit avec les livres) · Netlify Free (300 crédits/mois, ~20 déploiements) · Brevo (300 mails/jour) · Oracle Always Free (VM) · GitHub.

---

## D. Les rapports de l'agent — joints

**`RECHERCHE-PDF-FONCTIONNALITES.md`** — lecture **intégrale** de ton PDF de cadrage (19 pages) :
inventaire exhaustif des **24 fonctionnalités du catalogue + 9 complémentaires = 33**, chacune avec la mention exacte **« abonnement requis » / « pas d'abonnement requis »**, puis **tous les coûts cités** (avec la page source), les **risques** (surtout juridiques — droit d'auteur béninois, loi 2005-30) et leurs mitigations, l'**infrastructure** décrite, et une section « à vérifier / contradictions » (le PDF raisonne en USD et ignore les prix FCFA, les packs de crédits et FedaPay).

**`RECHERCHE-RIMUSCAN-POSEIDON.md`** — recherche web sur **rimu-scan.fr** et **Poseidon Scans**, plus 6 concurrents (SushiScan, Lire-Manga, Scan-VF, Japscan, Ortega Scans, Mangas.io) : fonctionnalités observées **site par site** avec l'URL de preuve, **tableau de synthèse** (fonctionnalité × site), puis « **ce qu'on peut ajouter à Plume d'Ombres** » avec prérequis techniques, difficulté et la mention **« abonnement requis » / « pas d'abonnement requis »**, et les pistes écartées avec leur raison.

> Bonus (plus ancien, déjà dans le dépôt) : `IDEES-AMELIORATIONS.md`, 20 idées plus « génériques » (TTS, bilingue aligné, notes, séries + push, hors-ligne…), chacune avec effort/impact/coût et sources.

Tout est compatible **100 % gratuit / auto-hébergé** — le seul poste qui coûte vraiment, c'est la traduction (facturée en section B).
