-- ============================================================
-- Plume d'Ombres — SECTIONS DU TABLEAU DE BORD PAR ADMINISTRATEUR.
--
-- Objectif : un super-administrateur peut ouvrir à un administrateur
-- UNIQUEMENT certaines parties du tableau de bord (comptes,
-- abonnements, paiements, audience, système) au lieu de tout.
--
-- Principes :
--   * le super-administrateur voit TOUJOURS toutes les sections ;
--   * un administrateur sans ligne dans admin_sections conserve le
--     comportement historique : toutes les sections d'exploitation
--     (aucune régression pour les admins déjà nommés) ;
--   * dès qu'une ligne existe, elle fait foi : seules les sections
--     listées sont ouvertes ;
--   * l'écriture n'est possible que par un super-administrateur, via
--     la fonction public.definir_sections_admin().
--
-- Fichier ADDITIF et IDEMPOTENT.
-- ============================================================

create table if not exists public.admin_sections (
  proprietaire_id uuid primary key references auth.users (id) on delete cascade,
  sections text[] not null default '{}',
  maj_le timestamptz not null default now(),
  constraint admin_sections_connues check (
    sections <@ array['comptes', 'abonnements', 'paiements', 'audience', 'systeme']::text[]
  )
);

comment on table public.admin_sections is
  'Sections du tableau de bord ouvertes à un administrateur. Absence de ligne = toutes les sections d''exploitation.';

alter table public.admin_sections enable row level security;

-- Aucune politique d'écriture : tout passe par les fonctions ci-dessous.
drop policy if exists admin_sections_lecture_soi on public.admin_sections;
create policy admin_sections_lecture_soi on public.admin_sections
  for select using (proprietaire_id = auth.uid() or public.est_super_admin());

revoke all on public.admin_sections from public, anon;
grant select on public.admin_sections to authenticated;

-- ------------------------------------------------------------
-- Toutes les sections connues (source unique côté base).
-- ------------------------------------------------------------
create or replace function public.sections_admin_connues()
returns text[]
language sql
immutable
as $$
  select array['comptes', 'abonnements', 'paiements', 'audience', 'systeme']::text[];
$$;

-- ------------------------------------------------------------
-- Sections effectives du compte connecté.
--   * super-admin  → toutes ;
--   * admin avec ligne → celles de la ligne ;
--   * admin sans ligne → toutes les sections d'exploitation ;
--   * autre        → aucune.
-- ------------------------------------------------------------
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

  if v_role = 'super_admin' then
    return public.sections_admin_connues();
  end if;

  if v_role <> 'admin' then
    return '{}'::text[];
  end if;

  select sections into v_sections
  from public.admin_sections
  where proprietaire_id = auth.uid();

  if v_sections is null then
    return public.sections_admin_connues();
  end if;

  return v_sections;
end;
$$;

revoke all on function public.mes_sections() from public, anon;
grant execute on function public.mes_sections() to authenticated, service_role;

-- ------------------------------------------------------------
-- Vrai si le compte connecté peut voir cette section.
-- ------------------------------------------------------------
create or replace function public.section_autorisee(p_section text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() = 'service_role' then true
    else p_section = any (public.mes_sections())
  end;
$$;

revoke all on function public.section_autorisee(text) from public, anon;
grant execute on function public.section_autorisee(text) to authenticated, service_role;

-- ------------------------------------------------------------
-- Réglage par un super-administrateur. p_sections = null remet
-- l'administrateur au comportement par défaut (toutes les sections).
-- ------------------------------------------------------------
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
  v_role_cible text;
begin
  if not public.est_super_admin() then
    raise exception 'reserve_au_super_admin' using errcode = '42501';
  end if;

  select role into v_role_cible from public.profiles where id = p_cible;
  if v_role_cible is null then
    raise exception 'compte_inconnu' using errcode = '22023';
  end if;
  if v_role_cible <> 'admin' then
    raise exception 'cible_non_administrateur' using errcode = '22023';
  end if;

  if p_sections is null then
    delete from public.admin_sections where proprietaire_id = p_cible;
    return null;
  end if;

  if not (p_sections <@ public.sections_admin_connues()) then
    raise exception 'section_inconnue' using errcode = '22023';
  end if;

  insert into public.admin_sections (proprietaire_id, sections, maj_le)
  values (p_cible, p_sections, now())
  on conflict (proprietaire_id) do update
    set sections = excluded.sections,
        maj_le = now();

  return p_sections;
end;
$$;

revoke all on function public.definir_sections_admin(uuid, text[]) from public, anon;
grant execute on function public.definir_sections_admin(uuid, text[]) to authenticated, service_role;

-- ------------------------------------------------------------
-- Journal : tracer qui a changé quoi (même table que les autres
-- actions d'administration, si elle existe).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.journal_admin') is not null then
    execute $sql$
      create or replace function public.tracer_sections_admin()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $corps$
      begin
        insert into public.journal_admin (admin_id, cible_id, action, motif)
        values (auth.uid(), new.proprietaire_id, 'sections_admin', array_to_string(new.sections, ','));
        return new;
      end;
      $corps$;
    $sql$;
    drop trigger if exists tracer_sections_admin on public.admin_sections;
    create trigger tracer_sections_admin
      after insert or update on public.admin_sections
      for each row execute function public.tracer_sections_admin();
  end if;
end;
$$;
