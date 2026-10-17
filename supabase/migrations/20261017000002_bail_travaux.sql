-- ============================================================
-- Plume d'Ombres — BAIL d'exécution des travaux de traduction (17/10/2026).
--
-- Problème : le navigateur et l'exécutant serveur pouvaient traduire le
-- MÊME livre en même temps (le battement ne suffisait pas : il n'est
-- qu'un signe de vie, pas une propriété exclusive). Conséquence : quota
-- consommé deux fois et lots traduits en double.
--
-- Un « bail » (lease) explicite remplace ce protocole implicite :
--   * `executeur`       — identifiant du titulaire du bail (unique par
--                         passage : « serveur:<uuid> », « onglet:<uuid> ») ;
--   * `bail_expire_le`  — fin de validité du bail. Un travail dont le
--                         bail est valide appartient à son titulaire ;
--                         bail NULL ou échu = travail libre.
--
-- L'attribution est un UPDATE conditionnel atomique (CAS) exécuté par
-- PostgreSQL : deux exécutants concurrents ne peuvent pas gagner tous
-- les deux (revérification de la clause WHERE après verrou de ligne).
--
-- Strictement ADDITIVE : deux colonnes nullables + un index. Aucune
-- table, aucune donnée, aucune politique existante n'est modifiée.
-- SQL standard, aucun service propriétaire : transposable à Neon.
-- Réappliquable sans erreur (add column if not exists).
-- ============================================================

alter table public.travaux_traduction
  add column if not exists executeur text,
  add column if not exists bail_expire_le timestamptz;

comment on column public.travaux_traduction.executeur is
  'Titulaire du bail d''exécution (identifiant unique par passage). NULL = travail libre.';
comment on column public.travaux_traduction.bail_expire_le is
  'Fin de validité du bail. NULL ou échu = travail libre, reprenable.';

-- Reprise : retrouver les travaux dont le bail est libre ou échu sans
-- balayer la table (index partiel : les lignes sans bail n'y figurent pas).
create index if not exists travaux_traduction_bail_expire_idx
  on public.travaux_traduction (bail_expire_le)
  where bail_expire_le is not null;
