# FedaPay — état réel (constaté le 27/10/2026, lecture seule)

## 1. Mode actif : LIVE
- `FEDAPAY_ENV=live` → API `api.fedapay.com/v1`, guichet `process.fedapay.com`.
- `FEDAPAY_SECRET_KEY=sk_live_…` (32 car.) → **VALIDE** (auth OK).
- `FEDAPAY_LIVE_SECRET_KEY` VIDE — ignorée : le code ne lit que `FEDAPAY_SECRET_KEY`.
- `FEDAPAY_SANDBOX_SECRET_KEY=sk_sandb…` → **INVALIDE (401)** : sandbox inutilisable.
- `FEDAPAY_WEBHOOK_SECRET` VIDE → le webhook répond 503 « non configuré ».

## 2. Appels réels (GET uniquement)
| Appel | Code | Lecture |
|---|---|---|
| `/v1/transactions` | 400 | obsolète → « utiliser /transactions/search » (route non utilisée par le code) |
| `/v1/transactions/search?per_page=5` | 200 | 1 transaction : 2 500 XOF, 10/10/2026, `declined` (Moov, `last_error_code=API_ERROR`), `merchant_reference` + `custom_metadata` bien conservés |
| `/v1/transactions/113606714` | 200 | relecture par id OK |
| `/v1/transactions/merchant/PLU-MV2FOP8T-O5IV56` | 200 | réconciliation par notre référence OK |
| `/v1/balances` | 200 | compte live répond, solde 0 |
| `/v1/webhooks` | 200 | endpoint id 9136 → `https://plume-ombres.netlify.app/api/paiement/webhook`, `enabled=true`, `ssl_verify=false`, `disable_on_error=false` |
| `/v1/events` | 200 | 0 événement enregistré |
| `GET plume-ombres.netlify.app/api/paiement/webhook` | 503 | Netlify `usage_exceeded` — **toute** l'app est HS (page d'accueil aussi) |

## 3. Prêt côté code
`POST /transactions` (amount, currency.iso, callback_url, merchant_reference, custom_metadata) → `POST /transactions/{id}/token` → URL `process.fedapay.com/{token}`. Webhook : HMAC-SHA256 sur `"<t>.<corps brut>"` depuis `X-FEDAPAY-SIGNATURE` (`t=…,s=…`), échec fermé, puis **re-vérification** `GET /transactions/{id}` ; `approved/success` → réussi, `declined/canceled/failed/refunded/expired/reversed` → échoué, reste → en attente ; montant contrôlé, activation idempotente.

## 4. Checklist Carrel (tableau de bord FedaPay)
1. **Débloquer Netlify** (`usage_exceeded`) : sans site joignable, ni retour client ni webhook.
2. Paramètres entreprise → **Activer mon compte / Soumettre pour validation** : pièce d'identité + copie, IFU + justificatif, RCCM + justificatif (société), signature scannée.
3. **Vérifier le type de compte** : un compte non validé est limité à 5 transactions/semaine et 100–5 000 XOF ; un compte Individuel/Startup validé à 10 tx/semaine, 100–20 000 XOF, Mobile Money seulement. Les plans à 21 600 / 30 000 / 33 600 / 90 000 XOF exigent un compte **Société** (aucune limite, cartes acceptées).
4. Webhooks → endpoint 9136 : confirmer l'URL `/api/paiement/webhook`, cocher `transaction.approved`, `transaction.declined`, `transaction.canceled` (pas « tous les événements »).
5. Laisser « Désactiver le webhook en cas d'erreur » **décoché** (déjà le cas) et « Vérification SSL » désactivée seulement si certificat instable.
6. Sur l'endpoint : **Click to reveal / Copier la clé** → `wh_live_…` → renseigner `FEDAPAY_WEBHOOK_SECRET` dans `.env.local` **et** chez l'hébergeur, puis redéployer.
7. Après correction : Logs du webhook → **Redeliver** les événements manqués (FedaPay réessaie 9 fois max, désactive après 10 échecs).
8. **Régénérer une clé sandbox** (l'actuelle renvoie 401) pour tester sans argent réel.
9. Pour identifier les gains : Page de Paiement → « Ajouter une page » par plan (montant fixe) ; lien ponctuel via Transactions → Détails → « Générer un lien de paiement » (valide 24 h). Le suivi fiable reste Transactions + `merchant_reference` / `custom_metadata.plan`.
10. Configurer le **compte de versement** (Moov/MTN) : solde à 0 aujourd'hui ; frais 1,80 % Moov/MTN/Celtiis, 3,60 % Visa/Mastercard.
11. Montant minimum constaté : **100 XOF**, montant entier — tous les plans du site (500 à 90 000 XOF) sont au-dessus.
