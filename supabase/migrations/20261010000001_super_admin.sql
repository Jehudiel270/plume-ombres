-- ============================================================
-- Plume d'Ombres — Rôle `super_admin` et nomination d'administrateurs.
--
-- Fichier ADDITIF et IDEMPOTENT (réappliquable sans erreur) : il ne
-- retire AUCUNE fonctionnalité ni AUCUNE politique existante. Il
-- ÉTEND ce que la migration `20261003000002_roles_admin.sql` a posé.
--
-- Pourquoi ce fichier est indispensable : dans toute la base, le rôle
-- d'administration est lu par UNE SEULE fonction, `public.est_admin()`.
-- Elle conditionne la politique RLS `profiles_select_admin`, la
-- politique d'écriture de `admin_actions` et le contrôle INTERNE de
-- toutes les RPC (stats_admin, admin_lister_comptes,
-- admin_courriels_comptes, admin_stats_abonnements,
-- admin_lister_paiements). Sans la mise à jour de `est_admin()`,
-- TOUT casserait pour un super-administrateur : il ne verrait ni les
-- comptes, ni les statistiques, ni les journaux.
--
-- Contenu :
--   1. profiles.role             — la contrainte accepte `super_admin` ;
--   2. public.est_admin(p_user)  — vrai pour admin ET super_admin
--      (source de vérité unique, inchangée sur le reste) ;
--   3. public.est_super_admin()  — nouveau, vrai pour super_admin seul ;
--   4. proteger_role_profiles()  — SEUL un super_admin peut changer un
--      rôle ; un admin simple en est incapable ; personne ne peut
--      modifier SON PROPRE rôle (garantit qu'il reste toujours au
--      moins un super-administrateur en base) ;
--   5. admin_actions             — colonne `role_cible` + contrainte
--      d'action étendue à `nommer_role` / `retrograder_role` ;
--   6. public.admin_changer_role(p_user_id, p_role, p_motif)
--      — RPC SECURITY DEFINER réservée au super_admin, qui change le
--      rôle ET journalise l'action DANS LA MÊME TRANSACTION.
--
-- ⚠ INTÉGRATION : comme la migration des rôles, les blocs qui
-- dépendent d'une table éventuellement absente (public.administrateurs)
-- restent gardés par to_regclass().
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA CONTRAINTE DE DOMAINE ACCEPTE `super_admin`
-- ------------------------------------------------------------
-- On recrée la contrainte nommée : les lignes existantes
-- ('utilisateur', 'admin') restent valides, on ne fait qu'AJOUTER une
-- valeur autorisée.
alter table public.profiles drop constraint if exists profiles_role_valide;
alter table public.profiles
  add constraint profiles_role_valide
  check (role in ('utilisateur', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles (role);

-- ------------------------------------------------------------
-- 2. est_admin : admin OU super_admin
-- ------------------------------------------------------------
-- Même signature que la branche paiement (p_user uuid default
-- auth.uid()). Deux sources, dans cet ordre :
--   1. profiles.role ∈ ('admin', 'super_admin') ;
--   2. public.administrateurs (liste blanche de la branche paiement,
--      consultée seulement si la table existe).
create or replace function public.est_admin(p_user uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin boolean := false;
begin
  if p_user is null then
    return false;
  end if;

  select (p.role in ('admin', 'super_admin')) into v_admin
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

-- ------------------------------------------------------------
-- 3. est_super_admin : la SEULE porte de la gestion des rôles
-- ------------------------------------------------------------
create or replace function public.est_super_admin(p_user uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_super boolean := false;
begin
  if p_user is null then
    return false;
  end if;

  select (p.role = 'super_admin') into v_super
    from public.profiles p
   where p.id = p_user;

  return coalesce(v_super, false);
end $$;

revoke all on function public.est_super_admin(uuid) from public, anon;
grant execute on function public.est_super_admin(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. PROTECTION DU RÔLE
-- ------------------------------------------------------------
-- Règles, dans l'ordre :
--   * un appel SQL direct (auth.uid() null : migration, postgres,
--     service_role en SQL) reste autorisé ;
--   * sinon, SEUL un super-administrateur peut modifier un rôle.
--     Un simple `admin` en est incapable — c'est ce qui empêche une
--     escalade de privilèges par la route « nommer un admin » ;
--   * un super-administrateur ne peut pas modifier SON PROPRE rôle :
--     il ne peut donc pas se rétrograder (ni s'auto-nommer) et il
--     subsiste TOUJOURS au moins un super-administrateur en base.
create or replace function public.proteger_role_profiles()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then
      return new;
    end if;

    if not public.est_super_admin(auth.uid()) then
      raise exception 'role de profil réservé aux super-administrateurs'
        using errcode = '42501';
    end if;

    if new.id = auth.uid() then
      raise exception 'un super-administrateur ne peut pas modifier son propre rôle'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proteger_role_profiles on public.profiles;
create trigger proteger_role_profiles
  before update on public.profiles
  for each row execute function public.proteger_role_profiles();

-- ------------------------------------------------------------
-- 5. JOURNAL DES ACTIONS : nouvelles actions + rôle visé
-- ------------------------------------------------------------
-- La contrainte d'origine (inline, posée avec la table) n'acceptait
-- que 'attribuer' / 'revoquer'. On la remplace par une contrainte
-- NOMMÉE qui AJOUTE les actions de gestion des rôles.
do $$
declare
  v_nom text;
begin
  for v_nom in
    select conname from pg_constraint
     where conrelid = 'public.admin_actions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.admin_actions drop constraint %I', v_nom);
  end loop;
end $$;

alter table public.admin_actions
  add constraint admin_actions_action_valide
  check (action in ('attribuer', 'revoquer', 'nommer_role', 'retrograder_role'));

-- Rôle visé par une action de gestion des rôles (nul pour les
-- abonnements). Colonne AJOUTÉE : aucune donnée existante touchée.
alter table public.admin_actions
  add column if not exists role_cible text;

-- ------------------------------------------------------------
-- 6. RPC : CHANGER LE RÔLE D'UN COMPTE (super-admin uniquement)
-- ------------------------------------------------------------
-- Le contrôle du rôle est DANS la fonction (SECURITY DEFINER) : un
-- appel direct à la RPC par un compte non super-admin est refusé avec
-- l'erreur 42501, quelle que soit l'interface.
--
-- La journalisation est faite ICI, dans la MÊME transaction que la
-- modification : une action de sécurité ne peut pas être appliquée
-- sans sa trace, ni tracée sans être appliquée.
create or replace function public.admin_changer_role(
  p_user_id uuid,
  p_role text,
  p_motif text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appelant uuid := auth.uid();
  v_ancien text;
  v_pseudo text;
begin
  if not public.est_super_admin(v_appelant) then
    raise exception 'admin_changer_role : réservé aux super-administrateurs'
      using errcode = '42501';
  end if;

  if p_role not in ('utilisateur', 'admin', 'super_admin') then
    raise exception 'admin_changer_role : rôle inconnu (%).', p_role
      using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'admin_changer_role : compte cible manquant.'
      using errcode = '22023';
  end if;

  if p_user_id = v_appelant then
    raise exception 'admin_changer_role : un super-administrateur ne peut pas modifier son propre rôle.'
      using errcode = '42501';
  end if;

  select p.role, p.pseudo into v_ancien, v_pseudo
    from public.profiles p
   where p.id = p_user_id;

  if v_ancien is null then
    raise exception 'admin_changer_role : compte % introuvable.', p_user_id
      using errcode = 'P0002';
  end if;

  if v_ancien = p_role then
    return jsonb_build_object(
      'utilisateur_id', p_user_id,
      'pseudo', v_pseudo,
      'role_precedent', v_ancien,
      'role_nouveau', p_role,
      'change', false,
      'journalise', false
    );
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.admin_actions (admin_id, cible_id, action, role_cible, motif)
  values (
    v_appelant,
    p_user_id,
    case when p_role = 'utilisateur' then 'retrograder_role' else 'nommer_role' end,
    p_role,
    p_motif
  );

  return jsonb_build_object(
    'utilisateur_id', p_user_id,
    'pseudo', v_pseudo,
    'role_precedent', v_ancien,
    'role_nouveau', p_role,
    'change', true,
    'journalise', true
  );
end $$;

revoke all on function public.admin_changer_role(uuid, text, text) from public, anon;
grant execute on function public.admin_changer_role(uuid, text, text)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. MIROIR DE RÔLE (si la branche paiement est présente)
-- ------------------------------------------------------------
-- La branche paiement peut remplacer public.est_admin() par une
-- version qui ne lit QUE public.administrateurs. Pour que le rôle
-- porté par profiles.role reste opérant dans TOUS les ordres de
-- fusion, on recopie les admins (dont les super-admins) dans cette
-- liste blanche, et on les en retire quand le rôle est retiré.
do $$
begin
  if to_regclass('public.administrateurs') is not null then
    execute $fn$
      create or replace function public.miroir_role_admin()
      returns trigger
      language plpgsql security definer set search_path = public, pg_temp as $body$
      begin
        if new.role in ('admin', 'super_admin') then
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
