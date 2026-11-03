# Renouvellement d'abonnement — audit réel (3 novembre 2026)

**Verdict : il n'y a AUCUN renouvellement automatique dans Plume d'Ombres.**
Ce n'est pas une option désactivée par défaut : la mécanique n'existe pas.
Il n'y a donc rien que le client puisse « désactiver » — et rien à construire
de ce côté sans décision commerciale.

## Ce qui existe vraiment

| Élément | Réalité vérifiée |
|---|---|
| Encaissement | `POST /transactions` chez FedaPay — **paiement unique**, aucun mandat ni récurrence. `lib/paiement/fedapay.ts` ne transmet ni `subscription` ni `recurring`. |
| Droits | Accordés à la confirmation du webhook (`/api/paiement/webhook`, garantie 9136), via la RPC `activer_abonnement(plan, référence, début, fin)`. Une période = `maintenant` → `maintenant + dureeJours` du plan. |
| Expiration | Calculée à la lecture : `statutEffectif()` (`lib/abonnement.ts:835`) renvoie `expire` dès que `periode_fin < maintenant`, et `planEnVigueur()` coupe les avantages. Le cron quotidien (`/api/cron/surveillance`) ne touche jamais au statut d'abonnement : il ne relance que les **paiements** restés en attente. |
| Résiliation | RPC `resilier_abonnement` existante (`lib/paiement/magasin.ts:367`) mais **aucun écran ne l'appelle** — inutile puisqu'il n'y a pas de prélèvement à arrêter. |
| Promesse affichée | Conditions §10, page Tarifs et tunnel disent bien « paiement à l'acte, aucune reconduction » : l'interface est honnête, aucune case « renouvellement automatique » n'est cochée en douce. |

Conclusion pratique : un client qui ne repaie pas est coupé à l'échéance, sans
démarche. Rien à désactiver, donc aucun risque de litige sur une reconduction
tacite (et c'est conforme à la règle UEMOA/Code de la consommation sur le
consentement préalable).

## Le vrai point à trancher

**Payer à nouveau avant l'échéance fait perdre les jours restants.**
`service.ts:249` calcule la période depuis `maintenant`, et
`activer_abonnement` écrase `periode_fin` (`on conflict … do update`).
Exemple : abonnement mensuel actif, il reste 12 jours, le client repaie
aujourd'hui → il repart de zéro et perd 12 jours.

Deux politiques possibles, c'est une décision commerciale :

- **Cumul** (recommandé, plus favorable) : `début = max(maintenant, periode_fin)`
  → les jours restants s'ajoutent. Correctif de 2 lignes dans `service.ts`
  (ou paramètre `p_prolonger` dans la RPC).
- **Remise au prorata** : les jours restants sont convertis en remise sur le
  nouveau paiement (une remise prorata est déjà calculée dans le tunnel, mais
  non affichée / non appliquée).

Tant que rien n'est décidé, la configuration actuelle (remise à zéro) est en
production et n'est écrite nulle part dans les conditions — d'où l'intérêt de
trancher.

## Si un jour le renouvellement automatique est voulu

Il faudrait : un mandat de prélèvement FedaPay (ou équivalent), un champ
`renouvellement_auto` sur `abonnements`, une case explicite dans le tunnel,
un bouton de désactivation dans « Mon compte », un cron de prélèvement avec
relance. Rien de tout cela n'existe aujourd'hui.
