-- ============================================================
-- 20261103000007_scope_propre_interdit.sql
--
-- Constat (signalé par le propriétaire le 3/11) : depuis l'onglet
-- « Rôles », le super-administrateur pouvait décocher SES PROPRES
-- sections. Deux défauts :
--   1. incohérence : `mes_sections()` renvoie toujours toutes les
--      sections à un super-admin, donc la ligne écrite ne servait à
--      rien — l'interface laissait croire le contraire ;
--   2. risque : le jour où le compte change de rôle, un périmètre
--      restreint hérité s'appliquerait sans que personne l'ait décidé.
--
-- Désormais la fonction refuse de modifier le périmètre de l'appelant.
-- Seul un appel `service_role` (scripts d'épreuve) peut le faire : il
-- n'a pas de session utilisateur, donc pas de « soi-même ».
--
-- Aucun droit n'est retiré à personne : les lignes inertes des
-- super-administrateurs sont simplement supprimées (elles étaient sans
-- effet, cf. `mes_sections()` dans 20261103000003).
--
-- Fichier ADDITIF et IDEMPOTENT.
-- ============================================================

create or replace function public.definir_sections_admin(
  p_cible uuid,
  p_sections text[]
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sections text[] := coalesce(p_sections, '{}'::text[]);
  v_role_cible text;
  v_service boolean := (auth.role() = 'service_role');
begin
  if not public.est_super_admin() and not v_service then
    raise exception 'reserve_au_super_admin' using errcode = '42501';
  end if;

  if p_cible is null then
    raise exception 'definir_sections_admin : cible manquante'
      using errcode = '22023';
  end if;

  -- Le cœur du correctif : personne ne règle son propre périmètre.
  if not v_service and p_cible = auth.uid() then
    raise exception 'auto_modification_interdite' using errcode = '42501';
  end if;

  select role into v_role_cible from public.profiles where id = p_cible;
  if v_role_cible is null then
    raise exception 'definir_sections_admin : compte inconnu'
      using errcode = '22023';
  end if;
  -- Comparaison NULL-sûre (leçon de 20261103000003).
  if v_role_cible is distinct from 'admin' and v_role_cible is distinct from 'super_admin' then
    raise exception 'cible_non_administrateur' using errcode = '22023';
  end if;

  if not (v_sections <@ public.sections_admin_connues()) then
    raise exception 'definir_sections_admin : section inconnue'
      using errcode = '22023';
  end if;

  insert into public.admin_sections (proprietaire_id, sections, maj_le)
  values (p_cible, v_sections, now())
  on conflict (proprietaire_id)
  do update set sections = excluded.sections, maj_le = now();

  return v_sections;
end;
$$;

revoke all on function public.definir_sections_admin(uuid, text[]) from public, anon;
grant execute on function public.definir_sections_admin(uuid, text[]) to authenticated, service_role;

comment on function public.definir_sections_admin(uuid, text[]) is
  'Règle les sections ouvertes à un administrateur. Réservé au super-administrateur, interdit sur son propre compte (auto_modification_interdite).';

-- Ménage : lignes inertes des super-administrateurs.
delete from public.admin_sections
where proprietaire_id in (
  select id from public.profiles where role = 'super_admin'
);

-- ------------------------------------------------------------
-- Correctif lié, trouvé par l'épreuve de bout en bout :
-- la section « notifications » (Alertes) était acceptée par la
-- contrainte de table et par /api/admin/sections, mais refusée par
-- sections_admin_connues() — oubli de 20261103000006, qui n'avait
-- rouvert que le CHECK. Ouvrir les alertes à un autre administrateur
-- échouait donc en base.
-- ------------------------------------------------------------
create or replace function public.sections_admin_connues()
returns text[]
language sql
immutable
as $$
  select array[
    'comptes', 'abonnements', 'paiements', 'audience', 'systeme', 'notifications'
  ]::text[];
$$;

revoke all on function public.sections_admin_connues() from public, anon;
grant execute on function public.sections_admin_connues() to authenticated, service_role;
