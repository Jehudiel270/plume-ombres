-- ============================================================
-- Chantier lecteur — module 13 : surlignages colorés (F2/F5)
--
-- La maquette du lecteur (zip plume-ombres-ui) propose cinq couleurs
-- de surlignage (or, rouge, azur, menthe, lilas), re-rendues dans le
-- texte du chapitre. La table carnet_notes n'avait pas de couleur :
-- on ajoute la colonne, ADDITIVE et IDEMPOTENTE, sans contrainte
-- rigide (une valeur inconnue s'affiche dans la couleur par défaut
-- plutôt que de rejeter une note existante).
--
-- Aucune suppression, aucun renommage : les notes existantes gardent
-- couleur NULL et s'affichent en « azur » (valeur par défaut de
-- l'interface, même convention que la maquette).
-- ============================================================

alter table public.carnet_notes
  add column if not exists couleur text
  check (couleur is null or char_length(couleur) <= 20);
