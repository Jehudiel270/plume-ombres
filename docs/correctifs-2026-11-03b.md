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
