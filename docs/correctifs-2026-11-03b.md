# Correctifs du 3 novembre — essai, alertes, domaine

## 1. Essai gratuit : un seul par personne (pas par alias)

**Décision.** Pas de vérification d'e-mail obligatoire (elle aurait ajouté un
SMTP à maintenir et 30 s de friction sur chaque inscription). La garde est
posée **en base**, sur l'adresse normalisée : minuscules, suffixe `+tag` retiré,
points ignorés pour Gmail, `googlemail.com` ramené à `gmail.com`.

- Fonction `normaliser_email()` + colonne `essais_abonnement.email_normalise`.
- `accorder_essai()` compare désormais les adresses **normalisées**.
- Conséquence : `jean.dupont+truc@gmail.com` et `jeandupont@googlemail.com`
  ne peuvent plus rejouer les 7 jours gratuits.
- Aucun impact sur les inscriptions légitimes (toujours ~1,3 s, sans e-mail).

**Pourquoi pas de plafond par IP :** au Bénin, les opérateurs mobiles
partagent des IP publiques (CGNAT) — un plafond par IP aurait bloqué des
clients réels sans gêner un fraudeur déterminé. Créer une boîte jetable coûte
plus cher que 500 F de crédits : le verrou par adresse suffit.

Preuve : `scripts/verifier-anti-abus-essai.mjs` → **8/8** (le second compte,
créé avec un alias de la même boîte, ne reçoit aucun essai).

## 2. Alertes de paiement + surveillance quotidienne

- Table `admin_alertes` : chaque administrateur coche **paiement réussi** et
  **paiement échoué** (les deux cochés par défaut).
- Les alertes arrivent dans la cloche de notifications (acheteur prévenu une
  fois ; administrateurs à chaque changement d'état).
- Nouvelle section délégable **« Alertes »** : le super-administrateur peut
  l'ouvrir à un autre administrateur, et régler les alertes de chacun.
- Webhook FedaPay **et** vérification au retour du client : les deux départs
  d'alerte, idempotents (clé unique `paiement:<référence>:<statut>:<compte>`).
- Cron Vercel quotidien `0 5 * * *` → `/api/cron/surveillance` : détecte les
  paiements restés **en attente** plus de 2 h, alerte une seule fois par jour,
  et renvoie le bilan des 24 h (réussis / échoués / volume). Protégé par
  `CRON_SECRET` ; aucun statut de paiement n'est jamais modifié par ce cron.

Preuve : `scripts/verifier-alertes-paiement.mjs` → **9/9** (dont idempotence,
sélectivité réussis/échoués, refus d'un appel anonyme).

## 3. Ordre de consommation des crédits

Vérifié dans `reserver_quota` : **le quota de l'offre est débité en premier**,
les crédits prépayés ne servent qu'au dépassement. L'interface le dit déjà
(« Le quota mensuel de votre offre est consommé en premier »). Aucun
changement nécessaire.

## 4. Métadonnées

- URL canonique sur les 9 pages publiques → évite le contenu dupliqué entre
  `plume-ombres.vercel.app` et `plumedombres.kodelyza.com`.
- `noindex` sur toutes les pages privées (connexion, bibliothèque, lecture,
  compte, favoris, abonnement, paiement, administration) : un robots.txt ne
  suffit pas quand l'URL circule dans une pub ou un lien partagé.
- Pages clientes : le `noindex` passe par un `layout.tsx` dédié (Next interdit
  l'export `metadata` dans un composant client).

## 5. Domaine

`plumedombres.kodelyza.com` répond déjà **200** sur le projet Vercel ;
`NEXT_PUBLIC_SITE_URL` a été basculé sur ce domaine en production, donc les
canoniques, l'image de partage et les retours de paiement pointent dessus.

## 4. Ancien domaine dans la miniature

La vignette de partage contenait l’adresse Vercel **en dur** dans l’image
(`app/opengraph-image.tsx`). Elle est maintenant dérivée de
`NEXT_PUBLIC_SITE_URL` (repli `plumedombres.kodelyza.com`), et les replis de
`layout.tsx`, `robots.ts`, `sitemap.ts` et des scripts pointent vers le domaine
définitif.

Supabase Auth : `site_url` pointait encore vers Netlify (mort) → remis sur
`https://plumedombres.kodelyza.com`, domaine ajouté aux URL autorisées
(`scripts/configurer-domaine-supabase.mjs`).

## 5. PWA : fermer et installer plus tard

Le bandeau « Installer l’application » a un bouton **×**. Le refus est mémorisé
(`plume-install-reporte`) et l’installation reste possible depuis
**Compte → Application** (`components/InstallationApplication.tsx`), avec la
marche à suivre sur iPhone et Firefox, où le navigateur n’expose pas de bouton.

## 6. FedaPay — réglage vérifié

Endpoint : https://plumedombres.kodelyza.com/api/paiement/webhook

- « Désactiver la vérification SSL » : **décoché** (donc SSL vérifié) — correct, le
  certificat du domaine est valide.
- « Désactiver le webhook en cas d'erreur » : **décoché** — correct : le webhook
  reste actif, FedaPay peut rejouer.
- La clé `wh_live_…` du tableau de bord **différait** de celle déployée :
  `FEDAPAY_WEBHOOK_SECRET` a été remplacée sur Vercel (Production) puis
  redéployée. Preuve : ping 200, sans signature 401, signature valide 200.

Les paiements restent sur le domaine kodelyza uniquement (choix retenu).

## 7. Épreuve de paiement et QR codes (3/11 au soir)

- Transaction live réelle créée **par l'application** (script `preuve-achat-live.ts`) :
  `114030253`, 500 XOF, statut `pending`, aucun franc débité, expire seule. Son
  `callback_url` vaut `https://plumedombres.kodelyza.com/paiement/succes?reference=…`
  → le client revient bien sur le domaine définitif.
- Historique live : dernière transaction **approuvée** `113989054`, 500 XOF, le
  1/11 à 11:21 (avant le changement de domaine). Aucun paiement réel n'a encore
  été encaissé *depuis* le domaine kodelyza : il faut une confirmation Mobile
  Money, donc un achat réel de 500 F par l'exploitant.
- QR codes de `D:\compressed\archivedwl-776` décodés (`zxing-wasm`) :
  `qrcode-1.jpeg` et `qrcode-2.png` encodent tous deux
  `https://plumedombres.kodelyza.com/` — valides. ⚠️ Les décodeurs JS classiques
  (`jsQR`, `@zxing/library`) échouent sur ce QR stylisé (points arrondis + logo) :
  prévoir un essai sur 2–3 téléphones avant impression, et garder au moins
  8 px par module dans la taille finale.

## 8. Aperçu de lien : l'ancien domaine restait affiché

Deux causes distinctes, corrigées toutes les deux.

1. **Cache des robots.** WhatsApp, Facebook et Telegram gardent la vignette
   *par URL d'image*. L'image était servie par `app/opengraph-image.tsx`, dont
   Next choisissait seul le suffixe : le contenu changeait, l'URL restait, donc
   les robots ne retéléchargeaient jamais. L'image est désormais une route
   dédiée **`/api/og?v=2`** (`app/api/og/route.tsx`), avec une constante `VERSION`
   à incrémenter pour forcer un rafraîchissement mondial des aperçus.
2. **Ancienne adresse encore servie.** `plume-ombres.vercel.app` répondait
   toujours. `proxy.ts` renvoie maintenant un **308** vers le domaine définitif
   (les URL de préversion `*.vercel.app` ne sont pas touchées).

Pour purger l'aperçu déjà en cache sur une plateforme : Facebook Sharing
Debugger (vaut aussi pour WhatsApp) puis « Scrape Again » ; Telegram
`@WebpageBot` avec le lien à réanalyser ; LinkedIn Post Inspector. Côté
téléphone, la vignette reste parfois en cache local : renvoyer le lien dans une
nouvelle conversation suffit.
