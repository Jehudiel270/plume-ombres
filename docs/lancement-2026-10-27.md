# Lancement — état réel au 27/10/2026

Verdict court : **le site est prêt à encaisser un paiement réel**. Le seul maillon
non prouvé est le débit lui-même, qui exige de l'argent réel ; tout ce qui
l'entoure est exercé et vérifié ci-dessous.

## Prouvé par exécution (pas par lecture)

| Quoi | Preuve |
|---|---|
| Paiement live | transaction FedaPay `113905914`, 500 XOF, statut `pending`, URL `process.fedapay.com` |
| Achat via le code de prod | `scripts/preuve-achat-live.ts` : mêmes classes/magasins que la route, trace `en_attente` écrite en base puis nettoyée → `ACHAT_INITIABLE=OUI` |
| Réconciliation | FedaPay renvoie bien `merchant_reference = PLU-…` sur la transaction → le webhook retrouve le paiement par notre référence |
| Webhook en prod | non signé → **401** ; signé HMAC → **200** ; ping → **200** |
| Activation après succès | `lib/paiement/activation.test.ts` 5/5 : activer, idempotence, échec sans effet, montant incohérent refusé, référence inconnue |
| Catalogue | 4 packs de crédits actifs en base : 500 F / 250 000 car., 1 000 F / 600 000, 2 500 F / 1 800 000, 5 000 F / 4 000 000 |
| Pages publiques | 12 routes en 200 avec un `<h1>` unique, aucune fuite de secret, aucun champ entre crochets |
| Base | 25 livres, 791 chapitres, 40 324 segments ; `texte_source` réparé (578 chapitres) |
| Suite de tests | 121 tests verts (`npx tsx --test "lib/**/*.test.ts"`), `tsc --noEmit` et `eslint` propres |

## Reste à faire côté exploitant (tableau de bord FedaPay, aucun accès API)

1. **Ouverture du compte** : pièces d'identité et validation du compte marchand.
   Les plans ≥ 21 600 XOF exigent un compte **Société** ; en compte individuel,
   seuls les packs et l'abonnement passent.
2. **Événements sur l'endpoint 9136** : cocher `transaction.approved`,
   `transaction.declined`, `transaction.canceled` (les webhooks ne partent pas si
   aucune case n'est cochée).
3. **Compte de versement** Moov / MTN renseigné, sinon les fonds ne sont pas reversés.
4. **Un vrai paiement à 500 F** de ta main pour constater la livraison dans les
   logs du webhook (`200` + `applique: true`) puis rembourser la transaction côté
   FedaPay. C'est le dernier maillon.

## Points connus, non bloquants

- **Reprise côté serveur : enchaînement automatique** (commit `a6231c5`). Chaque
  passage du worker (`/api/translate/travail`) qui laisse du travail **et qui a
  réellement avancé** relance le suivant via `after()` : le livre continue même
  onglet fermé, sans service tiers. Garde-fous : jamais d'enchaînement sans
  progrès (`faits > 0`), plafond de 200 passages, échec = arrêt de la chaîne.
  Le cron quotidien 04:00 (plan Hobby, 1×/jour) reste le filet de sécurité.
  `?budget=25000` disponible si un déclencheur externe (cron-job.org, 30 s de
  timeout) est utilisé un jour.
- Le compte de test affiche « à vie · 16 septembre 2126 » : donnée de test
  (droit accordé à la main), pas un calcul du tunnel.
- `/connexion` n'affiche pas son `<h1>` dans le HTML initial : la page est un
  composant client qui lit `useSearchParams`, donc son contenu arrive après
  hydratation. Gênant seulement pour le SEO de cette page-là.
- 12 worktrees conservés sur des branches **non fusionnées** (2 à 5 commits
  d'avance, octobre) : rien n'est perdu, mais ce sont des chantiers en suspens.
- Les pages légales ne portent plus de bandeau « gabarit » : elles sont
  complètes et factuelles, mais **la relecture par un juriste reste due**
  (garantie de conformité, non-remboursement, rétractation sur contenu
  numérique). C'est un risque assumé par l'exploitant, pas un oubli.

## Corrigé le 27/10 après vérification côté client

- « Environnement : live » supprimé de la page Abonnement (détail d'exploitation).
- Noms des moteurs de traduction retirés de la FAQ (règle produit) ; la
  politique de confidentialité continue de nommer les sous-traitants, c'est
  une obligation.
- Historique des paiements : statut écrit en français (« Échoué ») au lieu de
  l'énumération brute (`echoue`).
