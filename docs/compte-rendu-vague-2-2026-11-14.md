# Compte rendu du 14 novembre 2026 — Vague 2 du tableau de bord

Poursuite directe du chantier du 13/11 : les trois idées restées « non
construites » dans le compte rendu précédent sont désormais posées, testées et
fusionnées dans `develop`.

## 1. Indicateurs de revenus (onglet « Abonnements »)

Nouveau bloc **« Revenus et dynamique des abonnements »** dans l'onglet
« Abonnements », entre la répartition des plans et les anomalies :

- **MRR (revenu mensuel récurrent)** en F CFA : chaque abonnement actif est
  ramené au mois (prix du plan × 30 ÷ durée en jours — un annuel de 30 000 F
  CFA pèse 2 466 F CFA par mois) ;
- **Abonnements actifs** avec la décomposition par plan ;
- **Revenu moyen par abonné (ARPU)** et **total encaissé depuis l'origine** ;
- **Table des mouvements des 6 derniers mois** : nouveaux abonnements,
  sorties (résiliations + expirations), encaissements et nombre de paiements
  réussis, mois par mois.

Socle : nouvelle fonction SQL `admin_stats_revenus(p_mois)` (SECURITY DEFINER,
contrôle du rôle dans la fonction, révoquée pour public/anon — même contrat
que `admin_stats_abonnements`). Elle ne renvoie QUE des nombres et des
libellés de plan : jamais de contenu, jamais de donnée personnelle.

## 2. Journal des livraisons de webhook (onglet « Paiements »)

Nouveau bloc repliable **« Livraisons de webhook (paiement) »** sous le
tableau des paiements :

- chaque notification reçue sur `/api/paiement/webhook` est tracée :
  événement, référence interne (PLU-…), statut HTTP renvoyé, résultat
  (Traité / Déjà traité / Échec) et message d'erreur tronqué ;
- **« Déjà traité »** rend visibles les retentes de FedaPay (idempotence) ;
- le résumé du bloc compte les échecs et les retentes de la fenêtre ;
- les tentatives à signature invalide (401) sont journalisées aussi : on
  voit une mauvaise clé de signature ou une requête hostile sans fouiller
  les journaux de l'hébergeur.

Socle : nouvelle table `evenements_webhook` (RLS : lecture réservée aux
administrateurs, écriture impossible hors rôle service). La route webhook
écrit SILENCIEUSEMENT — un échec de journal ne fait jamais échouer un
paiement, pour que FedaPay ne rejoue pas un événement pour rien.

## 3. Bouton « Tester » dans l'onglet « Clés API »

Chaque clé du réservoir a désormais un bouton **« Tester »** :

- le serveur envoie une requête de contrôle au fournisseur (liste des
  modèles, information de clé pour OpenRouter) : **aucun quota de
  génération n'est consommé** ;
- le message renvoyé est lisible : « Clé valide : 45 modèles accessibles »,
  « HTTP 429 : … » (quota), « Aucune réponse du fournisseur en 10 s »… ;
- **les signaux de santé suivent les mêmes règles que la consommation
  réelle** : un succès remet les compteurs à zéro et lève le temps de repos ;
  un échec imputable à la clé (401/403/429, quota) incrémente son compteur
  (repos après 3 échecs de suite) ; un échec de réseau ne touche à rien ;
- la clé part dans les entêtes (jamais dans l'URL) et sa valeur n'apparaît
  dans aucun message ; pour « Autre fournisseur » (sans point de contrôle
  connu), l'écran le dit clairement.

Socle : `lib/cles-api-sonde.ts` (points de contrôle par fournisseur, délai
de 10 s, classification attribuable / non attribuable) et route
`POST /api/admin/cles-api/tester` (garde `admin.fonctionnalites.gerer`).

## 4. Vérifications

- **Tests 261/261** (16 nouvelles preuves : mise en forme des revenus,
  comptage des retentes, sonde de clé avec fetch factice) ;
- `check:flags` **17 interrupteurs / 33 pages / 32 routes d'API** (la
  nouvelle route est automatiquement couverte comme chemin admin) ;
- **Build de production OK.**

## 5. Migrations — rien de nouveau à faire séparément

Les DEUX nouvelles migrations (`admin_stats_revenus`,
`evenements_webhook`) ont été ajoutées au FICHIER CONSOLIDÉ
`docs/sql/migrations-chantier-consolidees.sql` (additif et idempotent,
relançable sans danger). **Un seul collage dans le SQL Editor de Supabase
reste nécessaire**, comme prévu hier :

1. SQL Editor de Supabase → coller tout `docs/sql/migrations-chantier-consolidees.sql`
   → exécuter ;
2. dans Vercel, ajouter `SUPABASE_SERVICE_ROLE_KEY` (Production et Preview)
   pour que le réservoir de clés serve tous les abonnés ;
3. ouvrir `/admin` : le bloc revenus s'active dès la migration appliquée ;
   le journal des webhooks affichera les livraisons dès la première
   notification de paiement.

## 6. Resté volontairement de côté

- **Impersonation (se connecter comme un lecteur)** avec motif obligatoire :
  chantier sensible touchant à l'authentification — à décider séparément
  (note juridique souhaitable avant), non engagé ;
- indicateur de churn en pourcentage : les « sorties » mensuelles sont
  affichées, mais un taux exigerait un dénominateur fiable (parc au début
  de chaque mois) ; mieux vaut attendre quelques mois de données réelles ;
- health check « profond » séparé : le bouton « Tester » par clé couvre
  l'essentiel du besoin réel.

## 7. Git et déploiement

Branche `fonctionnalite/tableau-bord-vague-2` (un commit, basée sur
`develop`), fusionnée dans `develop` local. Comme hier, **le push vers
GitHub reste impossible depuis cet environnement** (aucun identifiant) :
depuis votre machine, `git push origin develop` après vérification, ou
dites-le-moi. Vercel déploiera `develop` dès le push ; les écrans de la
vague 2 tolèrent la migration non encore appliquée (message explicite
au lieu d'une erreur).
