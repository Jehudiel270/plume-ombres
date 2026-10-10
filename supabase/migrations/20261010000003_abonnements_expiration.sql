-- ============================================================
-- Plume d'Ombres — Expiration AUTOMATIQUE des abonnements.
--
-- Objectif : rendre IMPOSSIBLE qu'un abonnement dont la période est
-- terminée conserve le statut « actif ». La réconciliation est faite
-- par le CODE (planificateur pg_cron en base), jamais par une
-- surveillance humaine.
--
-- Idempotente : réappliquable sans erreur.
--
-- Contenu :
--   * extension pg_cron (planificateur de tâches en base) ;
--   * public.expirer_abonnements() — passe en 'expire' tout abonnement
--     dont periode_fin <= now() et dont le statut est encore 'actif'.
--     SECURITY DEFINER, idempotente, historise la transition (comme
--     resilier_abonnement / revoquer_abonnement) ;
--   * vérification/durcissement de la contrainte CHECK des statuts
--     ('expire' doit être autorisé) ;
--   * planification horaire (cron.schedule) ;
--   * correction des données existantes (appel immédiat).
--
-- Défense en profondeur : la couche LECTURE (lib/abonnement.ts :
-- abonnementActif/statutEffectif ; SQL : est_premium/limite_abonnement)
-- refuse déjà de considérer « actif » un abonnement échu, APRÈS ce
-- correctif la BASE elle-même ne conserve plus l'état incohérent.
-- ============================================================

-- ---------- PLANIFICATEUR ----------
create extension if not exists pg_cron;

-- ---------- STATUT 'expire' AUTORISÉ (durcissement idempotent) ----------
-- Le schéma d'origine (20261003000001) autorise déjà 'expire' ; on le
-- VÉRIFIE et on ne reconstruit la contrainte que si elle manquait
-- (défense au cas où une base porterait une contrainte plus étroite).
do $$
declare
  v_conname text;
  v_def text;
  v_ok boolean := false;
begin
  for v_conname, v_def in
    select c.conname, pg_get_constraintdef(c.oid)
      from pg_constraint c
     where c.conrelid = 'public.abonnements'::regclass
       and c.contype = 'c'
  loop
    if v_def like '%statut%' then
      if position('expire' in v_def) > 0 then
        v_ok := true;
      else
        execute format('alter table public.abonnements drop constraint %I', v_conname);
      end if;
    end if;
  end loop;

  if not v_ok then
    alter table public.abonnements
      add constraint abonnements_statut_check
      check (statut in ('inactif','en_attente','actif','expire','resilie','echec'));
  end if;
end $$;

-- ---------- FONCTION DE RÉCONCILIATION ----------
-- Passe en 'expire' les abonnements échus encore marqués 'actif'.
-- Renvoie le nombre de lignes corrigées. Idempotente : un second
-- appel (sans nouvelle donnée) renvoie 0 et n'écrit rien.
create or replace function public.expirer_abonnements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  -- Une SEULE photographie des lignes à corriger ; l'historique et la
  -- mise à jour en découlent. Les CTE modificatrices s'exécutent
  -- toutes les deux à partir de cette même photographie, donc la
  -- transition est atomique et n'est journalisée qu'une fois.
  with perimes as (
    select a.proprietaire_id, a.plan, a.periode_debut,
           a.periode_fin, a.paiement_reference
      from public.abonnements a
     where a.statut = 'actif'
       and a.periode_fin is not null
       and a.periode_fin <= now()
  ),
  hist as (
    insert into public.abonnements_historique
      (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, motif)
    select p.proprietaire_id, p.plan, 'expire', p.periode_debut,
           p.periode_fin, p.paiement_reference, 'expiration automatique'
      from perimes p
    returning 1
  ),
  maj as (
    update public.abonnements a
       set statut = 'expire',
           updated_at = now()
      from perimes p
     where a.proprietaire_id = p.proprietaire_id
    returning 1
  )
  select count(*) into v_n from maj;

  return v_n;
end $$;

-- Fonction de MAINTENANCE : jamais exposée aux clients. Le serveur
-- (service_role) peut la déclencher à la demande ; anon/authenticated
-- non. Le propriétaire du schéma (postgres) et le planificateur
-- l'exécutent sans restriction.
revoke all on function public.expirer_abonnements() from public, anon, authenticated;
grant execute on function public.expirer_abonnements() to service_role;

-- ---------- PLANIFICATION HORAIRE ----------
-- Toutes les heures, à l'heure pile. cron.schedule(...) avec un nom de
-- job existant met à jour le job (idempotent) ; on désinscrit d'abord
-- par sûreté (l'absence de job fait lever, on l'ignore).
do $$
begin
  perform cron.unschedule('expirer-abonnements-horaire');
exception when others then
  null; -- le job n'existait pas : rien à supprimer
end $$;

select cron.schedule(
  'expirer-abonnements-horaire',
  '0 * * * *',
  'select public.expirer_abonnements();'
);

-- ---------- CORRECTION DES DONNÉES EXISTANTES ----------
-- Corrige immédiatement les lignes déjà fautives (statut 'actif' alors
-- que periode_fin est dépassée). Après cette ligne, plus aucune ligne
-- ne doit rester dans cet état.
select public.expirer_abonnements();
