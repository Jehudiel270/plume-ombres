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

## 9. Un super-administrateur pouvait régler son propre périmètre

Constat : dans l'onglet **Rôles**, la ligne du compte connecté s'affichait avec
ses cases à cocher, et la route acceptait l'écriture. Trois défauts
s'empilaient : l'interface proposait un réglage, la route l'acceptait, et la
base l'enregistrait — alors que `mes_sections()` renvoie **toujours toutes les
sections** à un super-administrateur : la ligne écrite ne servait à rien, mais
elle aurait ressorti le jour d'un changement de rôle.

Correctif à trois niveaux (migration `20261103000007_scope_propre_interdit.sql`) :

1. **Base** — `definir_sections_admin()` lève `auto_modification_interdite`
   quand la cible est l'appelant. Seul un appel `service_role` (scripts
   d'épreuve, sans session) échappe à la règle.
2. **Route** — `/api/admin/sections` traduit ce refus en message clair.
3. **Interface** — la ligne du compte connecté est en lecture seule, en bas de
   liste, avec la mention « votre compte ».

Ménage : les lignes `admin_sections` des super-administrateurs (inertes) sont
supprimées par la même migration.

Découvert au passage, par l'épreuve de bout en bout : la section **Alertes**
était acceptée par la contrainte de table et par la route, mais refusée par
`sections_admin_connues()` (20261103000006 n'avait rouvert que le `CHECK`).
Ouvrir les alertes à un autre administrateur échouait donc en base. Corrigé
dans la même migration.

Épreuve : `node --env-file=.env.local scripts/verifier-sections-e2e.mjs` →
**18/18**, dont les quatre nouvelles assertions (refus de l'auto-réglage,
conservation des six sections, réglage d'un autre administrateur, nettoyage).

## 10. Onglet « Rôles » : blocs repliables

La liste des périmètres tenait sur plusieurs écrans dès deux administrateurs.
Chaque administrateur est désormais un bloc replié par défaut (balise
`<details>`, sans JavaScript) dont le résumé affiche déjà l'essentiel : pseudo,
rôle et « 3/6 sections ». Pistes de modernisation du tableau de bord :
`docs/idees-dashboard.md`.

## 11. Animations au défilement — public et tableau de bord

**Demande** : « ajoute des animations au scroll côté admin comme public aussi ».

**Mise en œuvre — un seul mécanisme pour les deux mondes.**
`components/RevelerAuScroll.tsx` est monté une fois dans `app/layout.tsx`. Il découvre
les blocs portant `data-reveler`, leur pose une classe, puis la retire quand ils
entrent dans la fenêtre (`IntersectionObserver`, marge basse −8 %, seuil 8 %).
Aucune page n'a été enveloppée dans un composant : le serveur pose un attribut,
le client anime. Conséquence directe : **aucun composant serveur n'est devenu
client** (pas de JavaScript ajouté aux pages).

**Où** : toutes les pages publiques via `SectionPublique` (une retouche, neuf
pages), les deux sections basses de l'accueil, les quatre packs de `/tarifs`,
les questions de la FAQ, les cartes du tableau de bord, et tout contenu d'onglet
admin (`OngletsAdmin`) — y compris ce qui est monté après coup (changement
d'onglet, filtrage, pagination) grâce à un `MutationObserver` débattu à 80 ms.

**Accessibilité et sobriété.** Si `prefers-reduced-motion: reduce` est actif, ou si
le navigateur signale une connexion en économie de données / 2G, on pose
`html[data-economie="1"]` et **rien n'est animé** : les blocs sont visibles sans
transition. Le mouvement est aussi neutralisé en CSS, ce qui couvre le cas où
JavaScript n'aurait pas encore parlé.

**Prévisualisation** : volontairement absent de cette passe (décision du
2026-11-03) — elle viendra dans la version avec prévisualisation.

## 12. Tableau de bord — lisibilité et réactivité

Huit améliorations issues de `docs/idees-dashboard.md`, toutes sans nouvelle
dépendance npm.

1. **Trois chiffres en tête** (`BandeauAujourdhui`) : encaissé du jour, pages vues
   du jour, caractères traduits du mois — avec variation par rapport à la
   période précédente et courbe d'allure SVG maison. Calculés à partir de données
   **déjà chargées** : aucune requête Supabase supplémentaire.
2. **Voyants d'exploitation** (`BandeauSante`) : base de données (lectures en
   échec), encaissements (aucun depuis sept jours), traduction, disponibilité des
   moteurs. Chaque voyant cliquable ouvre l'onglet qui traite le problème. Un
   voyant rouge se voit sans ouvrir un onglet. Réserve assumée : la santé du
   **webhook FedaPay** n'est pas sondable depuis le navigateur — elle reste
   prouvée côté serveur par `scripts/verif-webhook-prod.mjs`.
3. **Palette de recherche `Ctrl+K` / `⌘K`** (`CommandPalette`) : onglets autorisés,
   comptes, références de paiement. Entrée → l'onglet s'ouvre et la recherche est
   **déposée dans le filtre** de la section cible. Le raccourci respecte les
   sections que l'administrateur a le droit de voir.
4. **Blocs repliables** (`BlocRepliable`, `<details>` natif) : l'onglet Système
   empilait quatre panneaux entiers. Chaque résumé affiche son compte, donc replié
   n'est pas muet. Zéro JavaScript.
5. **Filtres de paiements dans l'URL** (`?pay_q=`, `?pay_statut=`, `?pay_fournisseur=`,
   `?pay_periode=`) : un filtre devient partageable et survit au rechargement.
   Écriture par `history.replaceState` — surtout pas par le routeur : un
   `router.replace` relancerait le composant serveur et refermerait l'onglet.
6. **Densité d'affichage** : bouton « Vue compacte » mémorisé par navigateur
   (`localStorage`), sans toucher au contenu.
7. **Chiffres tabulaires** (`font-variant-numeric: tabular-nums`) sur les tableaux
   et les cartes : les montants ne dansent plus d'une ligne à l'autre.
8. **États vides explicites** : la palette dit quoi taper (« un pseudo, une
   référence PLU-… ou un nom d'onglet »), les cartes disent « aucun paiement
   encaissé » plutôt que d'afficher un zéro muet.

9. **Squelette de chargement** (`app/admin/loading.tsx`) : la forme de la page
   pendant les lectures Supabase, sans inventer de chiffres, avec `role="status"`
   pour les lecteurs d'écran.

**Pièges rencontrés** — la base de code refuse les composants non purs :
`Date.now()` pendant le rendu et `setState` synchrone dans un effet sont des
erreurs de lint bloquantes. La fraîcheur des encaissements se juge donc sur la
série déjà agrégée, et les lectures après hydratation (`localStorage`, URL) sont
différées d'un tour de boucle.

### Preuve d'exécution (Edge headless, JS activé, production)

| Contrôle | Résultat |
|---|---|
| `data-reveler` servis par la production (accueil / tarifs / FAQ) | 6 / 11 / 12 éléments |
| Blocs armés puis révélés au chargement | accueil 6/6, tarifs 11/11, FAQ 12/12 |
| `--force-prefers-reduced-motion` | **0 bloc armé**, contenu intégralement visible |
| Feuille de style servie | `.revele` présent dans le CSS de production |

Commande reproductible : `--headless=new --dump-dom` d'Edge sur l'URL publique, puis
comptage des classes `reveler`/`revele` dans le DOM final. Le tableau de bord
partage le même composant et la même feuille de style ; il n'est pas vérifiable
en headless car `/admin` exige une session (307 vers `/connexion`).
