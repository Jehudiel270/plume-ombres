-- ============================================================
-- Plume d'Ombres — Rôles et administration (W4e).
--
-- Idempotente : réappliquable sans erreur (add column if not
-- exists, create or replace, drop ... if exists, DO/blocs gardés
-- par to_regclass).
--
-- Contenu :
--   * public.profiles.role          — rôle porté par le profil
--     ('utilisateur' | 'admin'), contrainte de domaine ;
--   * public.est_admin(p_user)      — source de vérité unique du
--     rôle admin (SECURITY DEFINER, lit profiles.role et, si la
--     branche paiement est fusionnée, la liste blanche
--     public.administrateurs) ;
--   * public.proteger_role_profiles — un compte NON admin ne peut
--     pas s'octroyer le rôle admin via profiles_update_own ;
--   * politiques RLS profiles       — l'admin LIT tous les profils
--     (pseudo, rôle, dates), AUCUN contenu de livre ;
--   * public.stats_admin(...)       — statistiques AGRÉGÉES
--     (comptes, livres, chapitres, caractères par période,
--     abonnements actifs) : des NOMBRES, jamais du contenu ;
--   * public.admin_lister_comptes() — liste des comptes + état
--     d'abonnement (aucun texte de livre) ;
--   * public.admin_actions          — journal « qui a fait quoi et
--     quand » pour les attributions/révocations d'abonnement.
--
-- ⚠ INTÉGRATION : la branche `w4/paiement` fournit le schéma des
-- abonnements et les RPC public.attribuer_abonnement /
-- public.revoquer_abonnement. Le présent fichier ne crée AUCUNE
-- table d'abonnement ; il lit/écrit leurs fonctions uniquement par
-- RPC. Les blocs gardés par to_regclass() deviennent actifs dès que
-- la migration abonnement est appliquée : il suffit alors de
-- réappliquer ce fichier (idempotent) pour créer le miroir de rôle.
-- ============================================================

-- ---------- ROLE SUR LE PROFIL ----------
alter table public.profiles
  add column if not exists role text not null default 'utilisateur';

-- Contrainte de domaine (ajout idempotent : on ne la duplique pas).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_role_valide'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_valide
      check (role in ('utilisateur', 'admin'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------- est_admin : SOURCE DE VÉRITÉ UNIQUE ----------
-- Même signature que la branche paiement (p_user uuid default
-- auth.uid()) : un appel eu_zéro argument passe par auth.uid().
-- Deux sources, dans cet ordre :
--   1. profiles.role = 'admin' (source de CE lot) ;
--   2. public.administrateurs (liste blanche de la branche paiement,
--      consultée seulement si la table existe — SQL dynamique pour
--      ne pas dépendre de son ordre de fusion).
create or replace function public.est_admin(p_user uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin boolean := false;
begin
  if p_user is null then
    return false;
  end if;

  select (p.role = 'admin') into v_admin
    from public.profiles p
   where p.id = p_user;
  if coalesce(v_admin, false) then
    return true;
  end if;

  if to_regclass('public.administrateurs') is not null then
    execute 'select exists (select 1 from public.administrateurs a where a.user_id = $1)'
      into v_admin using p_user;
    if coalesce(v_admin, false) then
      return true;
    end if;
  end if;

  return false;
end $$;

revoke all on function public.est_admin(uuid) from public, anon;
grant execute on function public.est_admin(uuid) to authenticated, service_role;

-- ---------- PROTECTION DU RÔLE ----------
-- profiles_update_own autorise chaque compte à modifier SON profil ;
-- sans ce déclencheur, un compte pourrait s'écrire role = 'admin'.
-- Un appel SQL direct (auth.uid() null, ex. migration/postgres) reste
-- autorisé.
create or replace function public.proteger_role_profiles()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.est_admin(auth.uid()) then
    raise exception 'role de profil réservé aux administrateurs'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists proteger_role_profiles on public.profiles;
create trigger proteger_role_profiles
  before update on public.profiles
  for each row execute function public.proteger_role_profiles();

-- ---------- RLS : L'ADMIN LIT TOUS LES PROFILS ----------
-- NB : aucune politique admin n'est ajoutée sur livres / chapitres /
-- segments : l'admin NE PEUT PAS lire le contenu des livres des
-- autres comptes (règle produit). Les statistiques passent par des
-- fonctions agrégées ci-dessous.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.est_admin());

-- ---------- STATISTIQUES AGRÉGÉES (NOMBRES, JAMAIS DE CONTENU) ----------
-- SECURITY DEFINER : lit les tables sous RLS au nom du propriétaire,
-- mais ne renvoie QUE des comptages. Contrôle admin DANS la fonction.
create or replace function public.stats_admin(
  p_debut date default (date_trunc('month', now()) - interval '11 months')::date,
  p_fin date default now()::date
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_abonnements bigint := null;
  v_paiements bigint := null;
  v_periodes jsonb := '[]'::jsonb;
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'stats_admin : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'periode', to_char(t.periode, 'YYYY-MM'),
           'caracteres', t.caracteres
         ) order by t.periode), '[]'::jsonb)
    into v_periodes
    from (
      select u.periode, sum(u.caracteres)::bigint as caracteres
        from public.usage_mensuel u
       where u.periode between p_debut and p_fin
       group by u.periode
    ) t;

  if to_regclass('public.abonnements') is not null then
    execute 'select count(*) from public.abonnements a
              where a.statut = ''actif'' and a.periode_fin > now()'
      into v_abonnements;
  end if;
  if to_regclass('public.paiements') is not null then
    execute 'select count(*) from public.paiements p where p.statut = ''reussi'''
      into v_paiements;
  end if;

  return jsonb_build_object(
    'comptes', (select count(*) from public.profiles),
    'livres', (select count(*) from public.livres),
    'chapitres', (select count(*) from public.chapitres),
    'chapitres_traduits', (select count(*) from public.chapitres where statut = 'traduit'),
    'segments', (select count(*) from public.segments),
    'caracteres_utilises_total', (select coalesce(sum(caracteres), 0) from public.usage_mensuel),
    'caracteres_periode', (select coalesce(sum(caracteres), 0) from public.usage_mensuel
                            where periode between p_debut and p_fin),
    'periode_debut', p_debut,
    'periode_fin', p_fin,
    'periodes', v_periodes,
    'abonnements_actifs', v_abonnements,
    'paiements_reussis', v_paiements
  );
end $$;

revoke all on function public.stats_admin(date, date) from public, anon;
grant execute on function public.stats_admin(date, date) to authenticated, service_role;

-- ---------- LISTE DES COMPTES (SANS CONTENU) ----------
create or replace function public.admin_lister_comptes()
returns table (
  id uuid,
  pseudo text,
  role text,
  cree_le timestamptz,
  abonnement_statut text,
  abonnement_plan text,
  abonnement_fin timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_lister_comptes : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  if to_regclass('public.abonnements') is null then
    return query
      select p.id, p.pseudo, p.role, p.created_at,
             null::text, null::text, null::timestamptz
        from public.profiles p
       order by p.created_at desc;
  else
    return query execute
      'select p.id, p.pseudo, p.role, p.created_at,
              a.statut, a.plan, a.periode_fin
         from public.profiles p
         left join public.abonnements a on a.proprietaire_id = p.id
        order by p.created_at desc';
  end if;
end $$;

revoke all on function public.admin_lister_comptes() from public, anon;
grant execute on function public.admin_lister_comptes() to authenticated, service_role;

-- ---------- JOURNAL DES ACTIONS ADMIN ----------
-- Trace « qui a fait quoi et quand » pour les attributions et
-- révocations d'abonnement. Aucun contenu de livre.
create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null default auth.uid(),
  cible_id uuid not null,
  action text not null check (action in ('attribuer', 'revoquer')),
  duree text,
  periode_fin timestamptz,
  motif text,
  cree_le timestamptz not null default now()
);

create index if not exists admin_actions_cible_idx
  on public.admin_actions (cible_id, cree_le desc);
create index if not exists admin_actions_admin_idx
  on public.admin_actions (admin_id, cree_le desc);

alter table public.admin_actions enable row level security;

drop policy if exists "admin_actions_select_admin" on public.admin_actions;
create policy "admin_actions_select_admin" on public.admin_actions
  for select using (public.est_admin());

drop policy if exists "admin_actions_insert_admin" on public.admin_actions;
create policy "admin_actions_insert_admin" on public.admin_actions
  for insert with check (public.est_admin() and admin_id = auth.uid());

-- ---------- MIROIR DE RÔLE (si la branche paiement est présente) ----------
-- La branche paiement peut remplacer public.est_admin() par une
-- version qui ne lit QUE public.administrateurs. Pour que le rôle
-- porté par profiles.role reste opérant dans TOUS les ordres de
-- fusion, on recopie les admins de profiles.role dans cette liste
-- blanche (et on les en retire quand le rôle est retiré).
do $$
begin
  if to_regclass('public.administrateurs') is not null then
    execute $fn$
      create or replace function public.miroir_role_admin()
      returns trigger
      language plpgsql security definer set search_path = public, pg_temp as $body$
      begin
        if new.role = 'admin' then
          insert into public.administrateurs (user_id) values (new.id)
          on conflict (user_id) do nothing;
        else
          delete from public.administrateurs where user_id = new.id;
        end if;
        return new;
      end $body$;
    $fn$;
    execute 'drop trigger if exists miroir_role_admin on public.profiles';
    execute 'create trigger miroir_role_admin
               after insert or update of role on public.profiles
               for each row execute function public.miroir_role_admin()';
  end if;
end $$;
