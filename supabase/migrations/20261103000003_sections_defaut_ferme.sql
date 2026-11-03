-- ============================================================
-- 20261103000003_sections_defaut_ferme.sql
-- Correctif de sécurité : les sections d'administration passent en
-- DÉFAUT FERMÉ, et la comparaison de rôle devient sûre face à NULL.
--
-- Constat (épreuve de bout en bout du 3/11 avec un vrai compte) :
--   un compte sans ligne dans public.profiles donne
--   `v_role = NULL` ; l'ancien test `if v_role <> 'admin'` valait
--   NULL (donc jamais exécuté) et la fonction retournait TOUTES les
--   sections. Un administrateur sans réglage voyait aussi tout.
--
-- Désormais :
--   * super-admin          -> toutes les sections ;
--   * admin avec une ligne -> exactement ses sections ;
--   * admin sans ligne     -> AUCUNE section (défaut fermé) ;
--   * rôle inconnu/NULL    -> aucune section.
-- La « Vue d'ensemble » (onglet sans section) reste toujours visible
-- dans l'interface : un admin sans section n'est pas bloqué, il ne
-- voit simplement rien d'exploitation.
--
-- Fichier ADDITIF et IDEMPOTENT.
-- ============================================================

comment on table public.admin_sections is
  'Sections du tableau de bord ouvertes à un administrateur. Absence de ligne = aucune section (défaut fermé) ; le super-administrateur voit tout.';

create or replace function public.mes_sections()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_sections text[];
begin
  if auth.uid() is null then
    return '{}'::text[];
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role is not distinct from 'super_admin' then
    return public.sections_admin_connues();
  end if;

  -- Défaut FERMÉ : ni administrateur, ni profil lisible -> rien.
  if v_role is distinct from 'admin' then
    return '{}'::text[];
  end if;

  select sections into v_sections
  from public.admin_sections
  where proprietaire_id = auth.uid();

  return coalesce(v_sections, '{}'::text[]);
end $$;

revoke all on function public.mes_sections() from public, anon;
grant execute on function public.mes_sections() to authenticated, service_role;

-- section_autorisee s'appuie sur mes_sections : on la recrée à
-- l'identique pour que son plan soit recalculé après le changement.
create or replace function public.section_autorisee(p_section text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_section is null then
    return false;
  end if;
  if auth.role() = 'service_role' then
    return true;
  end if;
  return p_section = any (public.mes_sections());
end $$;

revoke all on function public.section_autorisee(text) from public, anon;
grant execute on function public.section_autorisee(text) to authenticated, service_role;

-- Le réglage par le super-administrateur reste inchangé, mais on rend
-- aussi son test NULL-sûr (p_sections vide = aucun accès).
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
begin
  if not public.est_super_admin() and auth.role() <> 'service_role' then
    -- Message conservé à l'identique : la route /api/admin/sections le
    -- traduit en refus explicite côté interface.
    raise exception 'reserve_au_super_admin' using errcode = '42501';
  end if;

  if p_cible is null then
    raise exception 'definir_sections_admin : cible manquante'
      using errcode = '22023';
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
end $$;

revoke all on function public.definir_sections_admin(uuid, text[]) from public, anon;
grant execute on function public.definir_sections_admin(uuid, text[]) to authenticated, service_role;
