-- ============================================================
-- Plume d'Ombres — Limites d'usage (Vague 2 : P0.2 quota mensuel,
-- P0.3 limitation de débit sur /api/translate).
--
-- Idempotente : peut être réappliquée sans erreur (create ... if
-- not exists, create or replace function, drop policy if exists).
--
-- Deux tables :
--   * public.rate_limit_hits : journal des appels autorisés, pour la
--     fenêtre GLISSANTE (on compte les appels des N dernières secondes).
--   * public.usage_mensuel   : caractères traduits par compte et par
--     mois civil (UTC).
--
-- L'écriture passe uniquement par des fonctions SECURITY DEFINER :
-- le client (anon/authenticated) n'a aucun accès direct en écriture.
-- ============================================================

-- ---------- RATE LIMIT ----------
create table if not exists public.rate_limit_hits (
  cle text not null,
  cree_le timestamptz not null default now()
);

-- Index de la fenêtre glissante (par clé + temps) et index de purge.
create index if not exists rate_limit_hits_cle_le_idx
  on public.rate_limit_hits (cle, cree_le);
create index if not exists rate_limit_hits_le_idx
  on public.rate_limit_hits (cree_le);

-- RLS activée sans policy : aucun accès direct pour anon/authenticated ;
-- seules les fonctions SECURITY DEFINER (propriétaire = postgres) écrivent.
alter table public.rate_limit_hits enable row level security;

-- ---------- QUOTA MENSUEL ----------
create table if not exists public.usage_mensuel (
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  periode date not null,
  caracteres bigint not null default 0 check (caracteres >= 0),
  updated_at timestamptz not null default now(),
  primary key (proprietaire_id, periode)
);

alter table public.usage_mensuel enable row level security;

-- Le propriétaire peut LIRE son propre usage (affichage futur du quota).
drop policy if exists "usage_mensuel_select_own" on public.usage_mensuel;
create policy "usage_mensuel_select_own" on public.usage_mensuel
  for select using (auth.uid() = proprietaire_id);

-- ============================================================
-- FONCTIONS
-- ============================================================

-- ---------- P0.3 : consommer un jeton de débit ----------
-- Fenêtre glissante : purge les appels hors fenêtre, compte ceux de la
-- fenêtre, insère un nouvel appel si la limite n'est pas atteinte.
-- Le verrou consultatif par clé sérialise les appels concurrents.
create or replace function public.consommer_rate_limit(
  p_cle text,
  p_fenetre_s integer,
  p_limite integer
) returns table (
  autorise boolean,
  limite integer,
  restant integer,
  reset_epoch bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_maintenant timestamptz := now();
  v_debut timestamptz;
  v_nb integer;
  v_plus_vieux timestamptz;
begin
  if p_cle is null or p_cle = '' then
    raise exception 'consommer_rate_limit : clé requise';
  end if;
  if p_fenetre_s is null or p_fenetre_s <= 0 then
    raise exception 'consommer_rate_limit : fenêtre invalide';
  end if;

  -- Limite nulle ou négative : tout est refusé, rien n'est inséré.
  if p_limite is null or p_limite <= 0 then
    autorise := false;
    limite := greatest(coalesce(p_limite, 0), 0);
    restant := 0;
    reset_epoch := extract(epoch from (v_maintenant + make_interval(secs => p_fenetre_s)))::bigint;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('rl:' || p_cle)::bigint);

  v_debut := v_maintenant - make_interval(secs => p_fenetre_s);

  delete from public.rate_limit_hits
   where cle = p_cle and cree_le < v_debut;

  select count(*), min(h.cree_le)
    into v_nb, v_plus_vieux
    from public.rate_limit_hits h
   where h.cle = p_cle and h.cree_le >= v_debut;

  if v_nb >= p_limite then
    autorise := false;
    limite := p_limite;
    restant := 0;
    reset_epoch := extract(epoch from (v_plus_vieux + make_interval(secs => p_fenetre_s)))::bigint;
  else
    insert into public.rate_limit_hits (cle, cree_le) values (p_cle, v_maintenant);
    v_nb := v_nb + 1;
    autorise := true;
    limite := p_limite;
    restant := greatest(p_limite - v_nb, 0);
    reset_epoch := extract(epoch from (v_maintenant + make_interval(secs => p_fenetre_s)))::bigint;
  end if;
  return next;
end $$;

-- ---------- P0.2 : lire l'usage mensuel ----------
create or replace function public.lire_usage_quota(
  p_proprietaire uuid,
  p_periode date
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_utilise bigint;
begin
  if p_proprietaire is null then
    raise exception 'lire_usage_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'lire_usage_quota : propriétaire non autorisé' using errcode = '42501';
  end if;
  select u.caracteres into v_utilise
    from public.usage_mensuel u
   where u.proprietaire_id = p_proprietaire and u.periode = p_periode;
  return coalesce(v_utilise, 0);
end $$;

-- ---------- P0.2 : réserver des caractères (atomique) ----------
create or replace function public.reserver_quota(
  p_proprietaire uuid,
  p_periode date,
  p_caracteres bigint,
  p_limite bigint
) returns table (
  autorise boolean,
  utilise bigint,
  limite bigint,
  restant bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_utilise bigint;
  v_demande bigint := greatest(coalesce(p_caracteres, 0), 0);
begin
  if p_proprietaire is null then
    raise exception 'reserver_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'reserver_quota : propriétaire non autorisé' using errcode = '42501';
  end if;

  insert into public.usage_mensuel (proprietaire_id, periode, caracteres)
    values (p_proprietaire, p_periode, 0)
    on conflict (proprietaire_id, periode) do nothing;

  -- Verrou de ligne : sérialise les réservations concurrentes du compte.
  select u.caracteres into v_utilise
    from public.usage_mensuel u
   where u.proprietaire_id = p_proprietaire and u.periode = p_periode
   for update;

  if v_utilise + v_demande > p_limite then
    autorise := false;
    utilise := v_utilise;
    limite := p_limite;
    restant := greatest(p_limite - v_utilise, 0);
  else
    update public.usage_mensuel
       set caracteres = caracteres + v_demande,
           updated_at = now()
     where proprietaire_id = p_proprietaire and periode = p_periode;
    v_utilise := v_utilise + v_demande;
    autorise := true;
    utilise := v_utilise;
    limite := p_limite;
    restant := greatest(p_limite - v_utilise, 0);
  end if;
  return next;
end $$;

-- ---------- P0.2 : libérer (traduction échouée) ----------
create or replace function public.liberer_quota(
  p_proprietaire uuid,
  p_periode date,
  p_caracteres bigint
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_proprietaire is null then
    raise exception 'liberer_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'liberer_quota : propriétaire non autorisé' using errcode = '42501';
  end if;
  update public.usage_mensuel
     set caracteres = greatest(caracteres - greatest(coalesce(p_caracteres, 0), 0), 0),
         updated_at = now()
   where proprietaire_id = p_proprietaire and periode = p_periode;
end $$;

-- ---------- Purge des clés de débit inactives (entretien) ----------
create or replace function public.purger_rate_limit(p_avant_s integer default 86400)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_supprimees integer;
begin
  delete from public.rate_limit_hits
   where cree_le < now() - make_interval(secs => greatest(coalesce(p_avant_s, 86400), 1));
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end $$;

-- ============================================================
-- PRIVILÈGES : Supabase pose des privilèges PAR DÉFAUT qui
-- accordent EXECUTE à anon/authenticated ; il faut donc révoquer
-- EXPLICITEMENT anon en plus de PUBLIC, puis accorder à la carte.
-- anon ne peut QUE consommer un jeton de débit (les quotas sont
-- réservés aux comptes authentifiés).
-- ============================================================
revoke all on function public.consommer_rate_limit(text, integer, integer) from public;
grant execute on function public.consommer_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;

revoke all on function public.lire_usage_quota(uuid, date) from public, anon;
grant execute on function public.lire_usage_quota(uuid, date)
  to authenticated, service_role;

revoke all on function public.reserver_quota(uuid, date, bigint, bigint) from public, anon;
grant execute on function public.reserver_quota(uuid, date, bigint, bigint)
  to authenticated, service_role;

revoke all on function public.liberer_quota(uuid, date, bigint) from public, anon;
grant execute on function public.liberer_quota(uuid, date, bigint)
  to authenticated, service_role;

revoke all on function public.purger_rate_limit(integer) from public, anon, authenticated;
grant execute on function public.purger_rate_limit(integer) to service_role;
