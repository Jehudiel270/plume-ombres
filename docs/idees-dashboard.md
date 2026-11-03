# Idées pour moderniser le tableau de bord — Plume d'Ombres

Sourcé (oct.-nov. 2026) : AutoFi UX « Dashboard Design Guide 2026 » (hiérarchie :
tout montrer = ne rien prioriser), AdminLTE « Admin Dashboard Design 2026 »
(trois familles de tableaux de bord, densité, thème), Accessible Data Interfaces
(cartes KPI : la valeur et son unité doivent être du texte, pas une image),
Clerk / Saleor / Zowie (palette de commandes `Ctrl+K` dans les back-offices).

Contrainte tenue : **zéro nouvelle dépendance npm**, SVG maison, tout en français.

## Priorité 1 — fort effet, faible risque

1. **Trois chiffres en haut, pas dix.** Une bande « Aujourd'hui » : encaissé du
   jour, essais commencés, chapitres traduits. Le reste descend d'un cran.
   *Pourquoi* : sans hiérarchie, l'œil ne sait pas où commencer (AutoFi).
2. **Cartes KPI avec sparkline SVG** (7 ou 30 jours) et écart vs période
   précédente. Valeur + unité en texte pour les lecteurs d'écran.
3. **Palette de commandes `Ctrl+K` / `⌘K`** : sauter à un onglet, ouvrir un
   compte, un paiement, une référence. Un `input` + liste filtrée, rien de plus.
4. **Tout ce qui est long se déplie.** Déjà fait pour les sections des
   administrateurs ; même traitement pour « Système » (journal, exports) et
   « Comptes » (détail par compte).
5. **Filtres dans l'URL.** `?statut=echoue&periode=30j` : le rechargement et le
   partage gardent la vue. Aujourd'hui l'état vit dans le composant.

## Priorité 2 — confort d'exploitation

6. **Bandeau de santé en haut** : FedaPay (webhook), cron de surveillance,
   Supabase. Vert discret ; rouge seulement si une action est requise — et
   alors il remonte au-dessus des onglets.
7. **Densité réglable** (confort / compact) mémorisée en `localStorage`, et
   colonnes masquables sur le journal des paiements.
8. **États vides actionnables** : « aucun paiement échoué » avec le lien vers le
   dernier essai, plutôt qu'une zone blanche.
9. **Squelettes de chargement** au lieu du vide, et `aria-live` sur les messages
   d'enregistrement (déjà partiellement en place).
10. **Chiffres tabulaires** (`font-variant-numeric: tabular-nums`) et unités en
    petit : les colonnes s'alignent, la lecture au téléphone gagne.

## Ce qu'il ne faut pas faire

- Empiler des cartes de même poids : c'est le « look gabarit ».
- Passer au rouge pour un simple écart négatif : le rouge est réservé à ce qui
  demande une action (leçon du brief : la couleur est une décision, pas un
  décor).
- Ajouter un graphique là où un chiffre suffit.
