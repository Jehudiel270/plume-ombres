# Plume d'Ombres — correctifs post-lancement (11/11/2026)

Commit `4531ccd` sur `main`, déployé et vérifié en production.

## Vérifié avant de corriger

- **FedaPay (docs officielles)** : cartes **Visa / Mastercard / débit** acceptées, 3DS inclus ; Mobile Money disponible dans les **7 pays UEMOA** (Bénin, Côte d'Ivoire, Sénégal, Togo, Burkina, Mali, Niger) avec les opérateurs réels de chaque pays.
- **Test sandbox réel** : transaction FedaPay créée **sans numéro de téléphone** → 200 + lien de paiement généré (donc le parcours carte ne dépend pas du Mobile Money).
- **Base** : le pseudo de **1 777 caractères** existait bien ; aucune contrainte de longueur sur `profiles.pseudo` (36 comptes).
- **Langue** : test réel sur la prod (compte de QA temporaire, supprimé ensuite) — le changement de langue **fonctionne et persiste**. Sur mobile, les sélecteurs étaient simplement **repliés derrière « Options »** : d'où l'impression que l'anglais ne pouvait pas être changé.
- **18 langues** testées sur la chaîne réelle (dont bambara, wolof, zoulou, kikongo, peul, amharique, chinois, japonais, arabe, hindi) : **18/18 OK**.

## Corrigé

1. **Accueil** — suppression de « Paiement en cours d'ouverture » ; promesse de langues corrigée (« plus de soixante-dix langues, dans les deux sens »).
2. **Paiement** — choix **Mobile Money / Carte bancaire** ; le téléphone n'est exigé que pour Mobile Money ; 7 pays avec leurs opérateurs ; textes corrigés partout (tarifs, CGV, mentions, confidentialité, remboursement).
3. **Inscription** — pseudo limité à **32 caractères** (compteur), **confirmation du mot de passe**, **jauge de force** ; contrainte SQL + trigger d'inscription ; pseudo géant réparé.
4. **Lecteur** — sélecteurs de langue **toujours visibles**, y compris sur mobile.
5. **Mentions obsolètes** — « 0 € » → « 0 F CFA » ; « premium — bientôt disponible » → « formules payantes ».
6. **Base** — migration `20261111000001_pseudo_et_moyen.sql` appliquée (contrainte pseudo, réparation, colonne `paiements.moyen`).

## Vérifié après déploiement

- Accueil : plus de mention obsolète, « soixante-dix langues » et « carte bancaire » présents.
- Inscription : 4 champs (pseudo, email, mot de passe, confirmation), pseudo tronqué à 32, jauge « Force : Faible ».
- Paiement : les deux moyens affichés ; en mode carte, le champ téléphone disparaît et le bouton devient actif.
- Lecteur mobile : langues visibles sans rien ouvrir.
- `tsc` propre, `eslint` propre, build webpack OK, 16 tests paiement OK.

## Ajout du 11/11 (soir) — commits `6903985` et `fb834a3`

- **Inscription** : le libellé texte « Voir » est remplacé par une **icône œil** dans le champ mot de passe (et un second œil sur la confirmation). Icône intégrée au champ, libellés accessibles « Afficher / Masquer le mot de passe ».
- **Administration — suppression de comptes** : une **corbeille** « Supprimer ce compte… » apparaît sur chaque fiche de l'onglet *Rôles*, avec confirmation. Efface définitivement le compte (livres, traductions, favoris, abonnements, crédits, paiements — tout part en cascade).
- **Règles** : un `admin` ne peut supprimer qu'un simple `utilisateur` ; supprimer un administrateur exige `super_admin` ; impossible de se supprimer soi-même ; le dernier super-admin est protégé. Chaque suppression est journalisée dans `admin_actions`.
- **Base** : migration `20261111000002_suppression_comptes_admin.sql` appliquée (RPC `admin_supprimer_compte`).
- **Preuves** : 21/21 tests unitaires ; 7/7 cas testés en base (refus admin→admin, admin→super, auto-suppression, utilisateur→admin) ; parcours réel en production avec un super-admin de test → compte effacé, journal `supprimer_compte` écrit, message de bilan affiché.

## Reste à faire (côté toi)

- ⚠️ **Un vrai paiement carte** de bout en bout (500 F) depuis ton navigateur : je ne peux pas débiter une carte réelle.
- ⚠️ Vérifier dans le tableau de bord FedaPay que **les 7 pays et les cartes** sont activés sur le compte marchand.
- ⚠️ 54 langues non testées une par une (elles passent par le même moteur que les 18 validées).
