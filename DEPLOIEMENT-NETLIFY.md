# Déploiement sur Netlify — Plume d'Ombres (P0.1)

> **Décision P0.1 tranchée : Netlify Free.**
> Hébergeur 100 % gratuit, **sans carte bancaire**, qui **autorise
> explicitement l'usage commercial** — contrairement à Vercel Hobby.
> Statut : **configuration prête, déploiement NON effectué.**
> Branche de travail : `w6/hebergement`. Le site Vercel
> `plume-ombres.vercel.app` reste la prod et **n'est pas touché**.
> Mise à jour : 2 octobre 2026.

Projet : Next.js **16.3.4** (App Router, React 19), `proxy.ts`
(ex-middleware Next 16), 6 routes serveur (`app/api/**`,
`runtime = 'nodejs'` dont `/api/translate`), Supabase hébergé, PWA
(service worker statique), export PDF **100 % côté navigateur** (pdf-lib).
Le flag `--webpack` est obligatoire (voir §6).

---

## 1. Le problème (rappel du blocage)

Vercel Hobby interdit tout usage commercial, **dons inclus** :
« Hobby teams are restricted to non-commercial personal use only. All
commercial usage of the platform requires either a Pro or Enterprise
plan. » — « 💡 Note: Asking for Donations fall under commercial usage. »
— <https://vercel.com/docs/limits/fair-use-guidelines> (consultée le 02/10/2026).

Le contrat est encore plus explicite : « You shall only use the Services
under a Hobby plan for your personal or non-commercial use. […] We may
shut down and terminate projects or deployments using the Hobby plan
without notice for any reason or no reason. »
— <https://vercel.com/legal/terms> (§4, consulté le 02/10/2026).

Conséquence : dès le premier euro encaissé (abonnement Premium), le
projet devient non conforme et peut être coupé **sans préavis**.

---

## 2. Comparatif SOURCÉ (relevé le 02/10/2026)

Légende : ✅ commercial autorisé · ❌ interdit · ⚠️ sous conditions.
**La colonne « durée max d'une fonction » est le critère décisif** (contrainte b).

| Hébergeur | Commercial | Prix | Durée max fonction | Bande passante / trafic | Build | Invocations / fonctions |
|---|---|---|---|---|---|---|
| **Vercel Hobby** | ❌ **NON** | 0 $ | **300 s** (5 min, défaut et max) | 100 GB transfert + 10 GB origine / mois | inclus | 1 000 000 / mois ; Active CPU 4 h |
| **Vercel Pro** | ✅ oui | **20 $/mois** (crédit de 20 $ inclus) | 300 s défaut, **800 s** max, 1800 s (bêta) | usage-based | inclus | usage-based ($0,60 / M) |
| **Netlify Free** | ✅ **oui** (usage commercial explicite) | 0 $ | **60 s, NON configurable** ; planifiée 30 s ; arrière-plan 15 min | 300 crédits/mois (≈ 15 crédits/déploiement prod, 20 crédits/GB) | inclus (~20 déploiements prod/mois) | 125 000 `functions` + 1 M `edge` (ancien plan) ; buffered 6 Mo / streamed 20 Mo |
| **Cloudflare Pages / Workers Free** | ✅ oui (aucune restriction commerciale) | 0 $ | **CPU 10 ms / invocation** (pas de durée murale garantie) | statique : illimité et gratuit | 500 builds/mois, 20 min/build, 1 build à la fois | **100 000 requêtes/jour** ; 128 Mo RAM ; 50 sous-requêtes |
| **Google Cloud Run** (Always Free) | ✅ oui | 0 $ dans le quota (carte de facturation requise) | **300 s défaut, jusqu'à 60 min (3600 s)** | 1 GiB sortant / mois (Amérique du Nord) | Cloud Build | 240 000 vCPU-s + 450 000 GiB-s / mois |
| **Render Free** | ✅ oui (aucune restriction) | 0 $ | pas de timeout serveur (service Node long) mais **extinction après 15 min d'inactivité** | 750 h-instance/mois (partagées) | inclus | service web continu (pas de modèle par invocation) |
| **Oracle Always Free (VM)** | ✅ oui | 0 $ | **aucune limite** (machine virtuelle) | 10 To egress/mois | manuel | n/a — VM 2 OCPU / 12 Go ARM |

### Sources officielles (URL + citation + date)

**Vercel Hobby — ❌ commercial**
- Commercial : « Hobby teams are restricted to non-commercial personal use only. […] Asking for Donations fall under commercial usage. » — <https://vercel.com/docs/limits/fair-use-guidelines>
- Contrat : « You shall only use the Services under a Hobby plan for your personal or non-commercial use […] We reserve the right to disable or remove any Project or website deployment on the Hobby plan with or without notice. » — <https://vercel.com/legal/terms> (§4)
- Limites : Fast Data Transfer « Up to 100 GB » ; Function Invocations « Up to 1M » ; Active CPU « Up to 4 CPU-hrs » — <https://vercel.com/docs/limits/fair-use-policy>
- Durée : Hobby « 300s default and maximum » — <https://vercel.com/docs/functions/limitations>

**Vercel Pro — ✅ commercial, 20 $/mois**
- « $20/mo … to build and scale your app. », « Our Hobby plan is for personal, non-commercial use. » — <https://vercel.com/pricing>
- Durée : Pro « 300s default, 800s maximum, and 1800s extended maximum (beta) » — <https://vercel.com/docs/functions/limitations>

**Netlify Free — ✅ commercial**
- « On the Free plan, you can deploy commercial projects, personal sites, or other creative explorations you want to share on the web. » — <https://www.netlify.com/blog/introducing-netlify-free-plan/> (12/11/2024)
- « Free commercial use — Netlify: Yes / Vercel: No. Netlify's free tier supports commercial projects. » — <https://www.netlify.com/guides/netlify-vs-vercel/>
- ⚠️ Réserve contractuelle : « the Free Usage Tier is offered at Netlify's sole discretion […] Netlify may shut down Free Usage Tier website projects without notice for any reason or no reason. » — <https://www.netlify.com/legal/self-serve-subscription-agreement> (§6). Interdiction de **revendre** l'hébergement.
- Quotas (comptes créés **après le 04/09/2025**) : « 300 credits/month | Hard limit » ; au-delà, les sites sont mis en pause (`Site not available`). — <https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work>
- Coût en crédits : Production deploys 15 · Compute 10 /GB-h · Bandwidth 20 /GB · Web requests 2 /10k. — <https://www.netlify.com/pricing/>
- **Durée de fonction** : « Synchronous execution limit | 60 seconds | No » (non configurable) ; « Scheduled execution limit | 30 seconds » ; « Background execution limit | 15 minutes » ; « Buffered request/response payload | 6 MB » ; « Streamed response payload | 20 MB ». — <https://docs.netlify.com/build/functions/configuration/>
- Ancien plan gratuit (comptes d'avant le 04/09/2025) : « 100 GB bandwidth, 300 build minutes, 125,000 function and 1 million edge function invocations, 10 GB storage ». — <https://www.netlify.com/blog/introducing-netlify-free-plan/>

**Cloudflare Pages / Workers Free — ✅ commercial**
- Aucune restriction d'usage commercial dans le contrat libre-service ; confirmé par les équipes community : « there is no restriction on using the Free Plan for commercial use » — <https://community.cloudflare.com/t/use-free-plan-for-commercial-project-follow-up/732438>
- Pages : 500 builds/mois, timeout 20 min, 1 build concurrent, 20 000 fichiers, 100 projets — <https://developers.cloudflare.com/pages/platform/limits/>
- Workers Free : « Requests | 100,000/day », « CPU time | 10 ms », « Memory | 128 MB », « Subrequests | 50/request », « Environment variables | 64/Worker » — <https://developers.cloudflare.com/workers/platform/limits/>. Les Pages Functions sont comptées comme des Workers.

**Google Cloud Run — ✅ commercial**
- Free tier : « CPU — First 240,000 vCPU-seconds free per month ; RAM — First 450,000 GiB-seconds free per month » — <https://cloud.google.com/run/pricing>
- Durée : « timeout is set by default to 5 minutes (300 seconds) and can be extended up to 60 minutes (3600 seconds) » — <https://cloud.google.com/run/docs/configuring/request-timeout>. Nécessite un compte de facturation (carte) même pour rester dans le quota gratuit.

**Render Free — ✅ commercial (mais non recommandé en prod)**
- « Free instances have important limitations […] **Do not use them for production applications.** » ; « Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic » ; redémarrage ≈ 1 min ; « 750 Free instance hours » / mois. — <https://render.com/docs/free>

---

## 3. Recommandation argumentée : **Netlify Free**

### Pourquoi Netlify
1. **Gratuit ET commercial** : c'est le seul hébergeur qui combine les deux
   sans carte bancaire et sans plafond de dépense — réponse directe aux
   contraintes (a) 100 % gratuit et « usage commercial autorisé » (P0.1).
2. **Next.js 16 pleinement supporté** par l'adaptateur OpenNext (détection
   automatique) : App Router, Route Handlers, `next/image`, ISR **et
   middleware via Edge Functions** — exactement notre pile. Rien à réécrire.
3. **Effort minimal** : `netlify.toml` est déjà en place ; aucune
   conteneurisation, aucune migration de code applicatif.

### Pourquoi PAS les autres
- **Cloudflare Pages/Workers** : Worker Free plafonné à **10 ms de CPU par
  invocation** → rédhibitoire pour du SSR Next.js ; l'adaptateur
  OpenNext Cloudflare est nettement moins mature que celui de Netlify pour
  Next 16. Écarté.
- **Cloud Run** : le meilleur pour les tâches longues (60 min), mais exige
  une **carte bancaire** + un Dockerfile → friction et risque de dépassement
  du quota gratuit. Gardé en **plan B** (voir §5), pas en primaire.
- **Render Free** : documenté « do not use in production », extinction sur
  inactivité, cold start ~1 min. Écarté pour la prod.
- **Vercel Pro** : 20 $/mois, contraire à l'exigence de gratuité. Gardé en
  repli immédiat si Netlify déçoit.

### La contrainte décisive : durée d'exécution des fonctions
Netlify plafonne une fonction **synchrone à 60 s, non configurable et non
augmentable** sur le plan Free. C'est sa seule vraie faiblesse face à un
« tâche longue côté serveur ». Mais :
- Parmi les options **gratuites ET commerciales**, c'est la meilleure : seul
  Cloud Run fait mieux (mais avec carte), tandis que Cloudflare (10 ms) est
  disqualifié.
- **L'architecture cible neutralise le problème** : le moteur de traduction
  tourne sur la **VM Oracle Always Free** (aucune limite de durée, car ce
  n'est pas une fonction). Les routes Next ne font que **proxifier un appel
  court** vers cette VM ou vers un fournisseur API.
- Le code découpe déjà un chapitre en **plusieurs appels** (constante
  `MAX_TEXTE = 6000`), chacun sous 60 s.

> **Règle de conception à graver** : **aucun traitement > 60 s dans une
> route Next.js**. Les tâches longues (traduction d'un livre entier, file
> d'attente, reprise serveur) vivent sur la VM Oracle (ou, si on reste
> serverless, sur Cloud Run).

---

## 4. Procédure pas à pas (Netlify Free)

1. **Compte** — créer un compte Netlify (gratuit, **sans carte bancaire**).
   *Étape manuelle : elle exige TON compte Netlify.*
2. **Connecter le dépôt** — New site → Import from Git → sélectionner
   `Jehudiel270/plume-ombres`, branche de production = celle du merge
   (voir §7). Netlify détecte Next.js et **installe l'adaptateur OpenNext
   automatiquement**.
3. **Vérifier les réglages de build** (déjà dans `netlify.toml`) :
   command `npm run build`, publish `.next`, `NODE_VERSION=22`.
4. **Variables d'environnement** (§4-bis) — *Project configuration →
   Environment variables*, portée **Production**. Les `NEXT_PUBLIC_*` sont
   figées au build : les modifier impose un redéploiement.
5. **Deploy preview** d'abord (branche `w6/hebergement`) — vérifier avant
   toute bascule.
6. **Contrôles post-déploiement** :
   - `/` et `/tarifs`, `/faq`, `/contact`, `/mentions-legales`, `/conditions`,
     `/confidentialite` → **200** (pages publiques) ;
   - `/bibliotheque` non authentifié → redirection **307 vers
     `/connexion?suivant=…`** (garde `proxy.ts`, exécuté en Edge Function) ;
   - `POST /api/translate` sans cookie/Bearer → **401** ;
   - `GET /service-worker.js` → 200, `Content-Type: text/javascript` ;
   - une image `next/image` se charge (Netlify Image CDN) ;
   - installation PWA proposée.
7. **Bascule du domaine** (§5) — n'ajouter le domaine qu'après validation,
   et **ne pas toucher** au projet Vercel.

### 4-bis. Variables d'environnement à recopier (noms seuls)

Source de vérité : `.env.example` du dépôt. **Ne jamais commiter de valeur.**
`SUPABASE_DB_*` (migrations locales uniquement) et `VERCEL_OIDC_TOKEN`
(jeton propre à Vercel) **ne se reportent PAS**.

| Variable | Portée | Requis |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime, **publique** | **oui** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + runtime, **publique** | **oui** |
| `TRANSLATOR_DEFAULT` | runtime | non |
| `GEMINI_API_KEY` | runtime, **secrète** | non |
| `GEMINI_MODEL` | runtime | non |
| `LIBRETRANSLATE_URL` | runtime | non |
| `LIBRETRANSLATE_API_KEY` | runtime, **secrète** | non |
| `MYMEMORY_EMAIL` | runtime | non |

Les **deux variables Supabase sont les seules strictement nécessaires**
(mêmes clés que celles déjà en prod Vercel).

### 4-ter. Adaptateur / plugin Next.js

- **Rien à installer** : l'adaptateur `@netlify/plugin-nextjs` (OpenNext) est
  détecté et installé automatiquement à chaque build. Netlify recommande de
  **ne pas l'épingler** : « We recommend that you don't pin the adapter
  version […] we will automatically update the adapter to the latest version
  on each project build. » — <https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/>
- **Version de référence actuelle : `@netlify/plugin-nextjs` 5.16.1**
  (publiée le 30/09/2026, npm — <https://www.npmjs.com/package/@netlify/plugin-nextjs>).
  Prérequis : Next.js ≥ 13.5, Node.js ≥ 18.
- **Pour épingler malgré tout** (à faire dans une copie de travail, PAS
  dans ce dépôt partagé) : `npm install -D @netlify/plugin-nextjs@5.16.1`
  puis décommenter le bloc `[[plugins]]` de `netlify.toml`. Cette commande
  **n'a pas été exécutée ici**.

---

## 5. Domaine, projet Vercel existant et redirection

- **`plume-ombres.vercel.app` ne peut PAS être transféré.** C'est un
  sous-domaine **appartenant à Vercel**, servi uniquement par Vercel. Un
  site Netlify ne peut pas le reprendre.
- **Le projet Vercel existant n'est pas supprimé** : il reste la prod et sert
  de **retour arrière instantané**. Ne rien y changer pendant la bascule.
- Deux stratégies :
  - **A — Domaine personnalisé (recommandée).** Acheter/attacher un vrai
    domaine (ex. `plume-ombres.<tld>`) → Netlify (DNS + SSL automatiques),
    puis, sur Vercel, déployer un `vercel.json` de redirection globale vers
    le nouveau domaine. *Étape manuelle, documentée ici : ne pas éditer le
    projet Vercel sans validation.*
  - **B — Sous-domaine Netlify (dépannage).** Utiliser
    `plume-ombres.netlify.app` et, sur **Vercel**, ajouter un `vercel.json`
    (créé côté projet Vercel, pas forcément dans ce dépôt) :
    ```json
    { "redirects": [{ "source": "/(.*)", "destination": "https://plume-ombres.netlify.app/$1", "permanent": true }] }
    ```
    La redirection ne part qu'après validation complète de Netlify.
- **Free tier** : les domaines personnalisés + SSL sont inclus (« Add Custom
  domains with SSL » — <https://www.netlify.com/pricing/>).
- **Compte Vercel** : conservé tel quel (plan Hobby gratuit, aucune action de
  facturation). Aucune suppression de projet.

---

## 6. Vérifications de build (faites dans cette branche)

- `npx tsc --noEmit` → **0 erreur** (TSC_EXIT=0).
- `npx next build --webpack` → **vert** (BUILD_EXIT=0) ; 18 pages générées,
  `ƒ Proxy (Middleware)` bien détecté, aucune route cassée.
- **Le flag `--webpack` est obligatoire** : `npx next build` (Turbopack par
  défaut) échoue dans cet environnement (`TurbopackInternalError` — symlink
  `node_modules` hors racine, exit 1). Le script `build` de `package.json` a
  donc été corrigé en `next build --webpack` (et `dev` en `next dev --webpack`),
  pour que la commande Netlify `npm run build` produise bien le bundle webpack
  attendu. **Aucun composant, route ou module applicatif n'a été modifié.**

---

## 7. Points de compatibilité Next.js 16 (risques)

| Point | Constat sourcé | Verdict |
|---|---|---|
| Next 16 / OpenNext | « The Next.js 16 release is here and Netlify is ready. » — <https://www.netlify.com/changelog/next-js-16-deploy-on-netlify/> | ✅ |
| App Router / Route Handlers / `next/image` | « Full Support » pour les trois — <https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/> | ✅ |
| `proxy.ts` (ex-middleware) | Middleware « ✓ Full support […] via Edge Functions » ; limite : pas de C++ addons ni `fs` (notre `proxy.ts` n'utilise que cookies + auth Supabase → conforme). **Comportement neuf Next 16 : à prouver par un vrai déploiement.** | ⚠️ risque faible |
| Durée max d'une fonction | 60 s synchrone, non configurable (voir §3) | ⚠️ règle de conception §3 |
| Payload requête/réponse | 6 Mo (bufféré) / 20 Mo (streamé) ; nos échanges `translate` ≈ 6 Ko | ✅ |
| Service worker PWA | fichier statique à la racine ; exclu du matcher `proxy.ts` | ✅ |

**Risque principal** : un **segment unitaire** dont la traduction dépasse 60 s
(fournisseur lent) serait tué → erreur réseau côté client. Atténuation :
garder Gemini comme fournisseur rapide ; sinon réduire `MAX_TEXTE` de la
route, ou déporter sur la VM Oracle (§3).

---

## 8. Retour arrière

Le projet Vercel n'est pas modifié. En cas de problème, il suffit de **ne pas
basculer le DNS** (ou de retirer la redirection) : `plume-ombres.vercel.app`
reste servi par Vercel. Aucun code applicatif n'a été changé par ce chantier
(seuls `netlify.toml`, `package.json` (scripts) et cette documentation).
