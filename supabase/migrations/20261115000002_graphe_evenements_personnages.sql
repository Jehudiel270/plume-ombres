-- ============================================================
-- Correctif : colonne graphe_evenements.personnages manquante.
--
-- La table graphe_evenements a été créée sur la base par une
-- version antérieure du module 7 bis, avant l'ajout de la liste
-- des personnages concernés. Le « create table if not exists »
-- de 20261115000001_graphe_riche.sql a donc sauté la table
-- existante, et la colonne n'a jamais été ajoutée — d'où l'erreur
-- « column graphe_evenements.personnages does not exist ».
--
-- MIGRATION ADDITIVE et IDEMPOTENTE (aucun DROP, aucun renommage) :
-- réexécuter ne change rien.
-- ============================================================

alter table public.graphe_evenements
  add column if not exists personnages uuid[] not null default '{}';

-- Sécurité : l'index du livre (déjà présent sur la base, mais
-- idempotent si la migration est rejouée ailleurs).
create index if not exists graphe_evenements_livre_idx
  on public.graphe_evenements (livre_id);

comment on column public.graphe_evenements.personnages is
  'Personnages concernés par l''événement (ids de graphe_personnages, validés par l''API, 50 max).';

notify pgrst, 'reload schema';
