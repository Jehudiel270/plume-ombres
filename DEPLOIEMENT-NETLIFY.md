# Déploiement sur Netlify — Plume d'Ombres

> Statut : **préparation**. Rien n'est déployé, aucun compte Netlify créé.
> Branche de travail : `chantier-netlify`. Le site Vercel `plume-ombres.vercel.app` reste la prod et n'est pas touché.

Projet : Next.js **16.3.4** (App Router, React 19), une seule route serveur
`app/api/translate/route.ts` (`runtime = 'nodejs'`), Supabase hébergé, PWA
(service worker vanilla), export PDF **100 % côté navigateur** (pdf-lib).

---

## 1. Pourquoi Netlify

Netlify autorise explicitement l'usage commercial sur son plan gratuit :
« On the Free plan, you can deploy commercial projects, personal sites, or
other creative explorations you want to share on the web. »
— <https://www.netlify.com/blog/introducing-netlify-free-plan/>
Confirmé par la FAQ officielle : « Can I use Netlify's free plan for
commercial projects? Yes. […] Netlify's free plan can be used for commercial
projects and businesses » — <https://www.netlify.com/guides/netlify-vs-vercel/>

---

## 2. Procédure pas à pas

1. **Compte** — créer un compte Netlify (gratuit, sans carte bancaire).
   *Étape manuelle : elle exige TON compte Netlify.*
2. **Connecter le dépôt** — New site → Import from Git → sélectionner le repo
   `dark-romance-translator`, branche de production = `main`.
   Netlify détecte Next.js et installe l'adaptateur OpenNext automatiquement.
3. **Vérifier les réglages de build** (déjà décrits dans `netlify.toml`) :
   build `npm run build`, publish `.next`, `NODE_VERSION=22`.
4. **Variables d'environnement** (section 3) — à saisir dans
   *Project configuration → Environment variables*, portée **Production**
   (et éventuellement *Deploy previews*). Les `NEXT_PUBLIC_*` sont figées au
   build : les modifier impose un redéploiement.
5. **Premier déploiement de vérification** — `main` déclenche un build.
6. **Contrôles post-déploiement** :
   - `/connexion` → 200 ;
   - `/` non authentifié → redirection vers `/connexion` (garde `proxy.ts`) ;
   - `POST /api/translate` sans cookie/Bearer → 401 ;
   - `GET /service-worker.js` → 200, `Content-Type: text/javascript` ;
   - une image `next/image` se charge (Netlify Image CDN) ;
   - installation PWA proposée.
7. **Bascule DNS** (plus tard, hors périmètre) — n'ajouter le domaine
   personnalisé qu'après validation, et **ne pas toucher** le domaine encore
   rattaché à Vercel.

---

## 3. Variables d'environnement à reporter

Créées côté Netlify (UI/CLI). `VERCEL_OIDC_TOKEN` **ne se reporte PAS**
(jeton propre à Vercel).

| Variable | Portée | Rôle | Requis |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime, **publique** | URL du projet Supabase | **oui** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + runtime, **publique** | clé anon (RLS protège) | **oui** |
| `TRANSLATOR_DEFAULT` | runtime | fournisseur actif (`libretranslate`/`gemini`/`mymemory`/`google`) | non |
| `GEMINI_API_KEY` | runtime, **secrète** | traduction Gemini Flash | non |
| `GEMINI_MODEL` | runtime | ex. `gemini-2.5-flash` | non |
| `LIBRETRANSLATE_URL` | runtime | instance LibreTranslate | non |
| `LIBRETRANSLATE_API_KEY` | runtime, **secrète** | si l'instance l'exige | non |
| `MYMEMORY_EMAIL` | runtime | quota MyMemory supérieur | non |

Copie locale : `.env.example` fait foi. Les deux variables Supabase sont les
seules strictement nécessaires (mêmes clés que celles déjà en prod Vercel).

---

## 4. Limites réelles du plan Free (comptes créés après le 04/09/2025)

Le plan gratuit est **à crédits**, pas à quotas séparés (bande passante,
fonctions et requêtes sont tous décomptés en crédits).

- **300 crédits/mois, plafond dur, sans recharge automatique.**
  Source : <https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work>
  — « 300 credits/month | Hard limit ». Au-delà : « all of your web projects
  (sites/apps) are paused and visitors […] will find a `Site not available`
  page ».
- **Coût en crédits** (<https://www.netlify.com/pricing/>) :
  *Production deploys 15 credits each* · *Compute 10 credits per GB-hour* ·
  *Bandwidth 20 credits per GB* · *Web requests 2 credits per 10k requests*.
- **Conséquence concrète** : ~15 crédits par déploiement de production, soit
  **~20 déploiements/mois** ; le reste (bande passante, invocations) est
  marginal à cette échelle. Le facteur limitant est le nombre de **déploiements
  de production**, pas le trafic.

---

## 5. Points de compatibilité Next.js 16 (et verdict)

Vérification de la stack : `proxy.ts` (ex-middleware Next 16) ; une seule
route API nodejs ; PWA par fichier statique ; PDF côté client.

| Point | Constat sourcé | Verdict |
|---|---|---|
| **Next 16 / OpenNext** | « The Next.js 16 release is here and Netlify is ready. » et « If you're upgrading from v15, no Netlify configuration changes are required. » — <https://www.netlify.com/changelog/next-js-16-deploy-on-netlify/> | ✅ Supporté |
| **App Router / Route Handlers / `next/image`** | « App Router ✓ Full Support », « Route Handlers ✓ Full Support », « Image Optimization ✓ Full Support » — <https://docs.netlify.com/integrations/frameworks/next-js/overview/> | ✅ Supporté |
| **`proxy.ts` (ex-middleware)** | Middleware « ✓ Full support [… via] Edge Functions », avec « a Node.js Middleware specific limitation » : ni C++ addons ni `fs`. Notre `proxy.ts` n'utilise que cookies + auth Supabase (fetch) → dans les clous. **À valider par un vrai déploiement** (comportement neuf du couple Next 16 + OpenNext). | ⚠️ Risque faible, à prouver |
| **Durée max d'une fonction** | « Synchronous execution limit | 60 seconds | No » (non configurable, **pas d'augmentation possible sur Free**) — <https://docs.netlify.com/build/functions/configuration> | ⚠️ À surveiller |
| **Payload requête/réponse** | « Buffered request/response payload | 6 MB | No » ; « Streamed response payload | 20 MB | No » | ✅ Sans risque (voir ci-dessous) |
| **Cron / functions planifiées** | Projet n'en utilise aucune (aucun dossier `netlify/functions`, aucun `scheduled`). La limite « Scheduled execution limit | 30 seconds » ne s'applique donc pas. | ✅ N/A |
| **Service worker PWA** | `public/service-worker.js` servi statiquement (racine, portée `/`) ; le matcher de `proxy.ts` l'exclut déjà. Indépendant de Next et de l'adaptateur. | ✅ Sans risque |

**Ce qui peut réellement casser :**

1. **Traduction d'un long chapitre → timeout 60 s.** L'unicité de la route et
   la limite applicative `MAX_TEXTE = 6000` caractères font qu'un chapitre est
   découpé en **plusieurs appels**, chacun une invocation distincte : aucun
   appel ne traite le chapitre entier. Le risque porte donc sur **un segment
   unitaire** dont la traduction dépasserait 60 s (fournisseur lent ou
   saturé) → l'invocation est tuée au bout de 60 s et le client voit une erreur
   réseau (pas le JSON 502 applicatif). Atténuation : garder un fournisseur
   rapide (Gemini) ; réduire la taille d'un segment (constante `MAX_TEXTE` de
   la route) si un timeout est observé.
2. **Payload 6 Mo (bufféré) / 20 Mo (streamé).** Requête `translate` ≈ 6 Ko,
   réponse de même ordre : très en dessous. L'export PDF étant **côté
   navigateur**, aucun gros octet ne traverse une fonction. ✅
3. **`proxy.ts` Node.js middleware.** Pas de `fs` ni d'addon C++ dans le code
   actuel, donc compatible en théorie — mais c'est la zone la plus récente
   (renommage Next 16) et elle **doit être confirmée par un déploiement réel**.

---

## 6. Retour arrière

Le site Vercel n'est pas modifié. En cas de problème, il suffit de ne pas
basculer le DNS : `plume-ombres.vercel.app` reste servi par Vercel. Aucun
code applicatif n'a été changé par ce chantier (seuls `netlify.toml` et ce
document ont été ajoutés).
