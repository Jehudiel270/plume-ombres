-- ============================================================
-- Plume d'Ombres — Suppression d'un compte par un administrateur
--
-- Manquait : un admin pouvait seulement RESTREINDRE les sections d'un
-- autre admin, et aucun compte (utile ou administrateur) ne pouvait
-- être supprimé depuis le tableau de bord. Cette migration ajoute la
-- seule brique serveur nécessaire, la RPC public.admin_supprimer_compte.
--
-- RÈGLES (appliquées DANS la fonction, pas seulement dans l'interface) :
--   * appelant non administrateur          → 42501 ;
--   * cible inexistante                    → P0002 ;
--   * suppression de SON PROPRE compte     → 42501 (garde anti-verrouillage) ;
--   * cible `admin` ou `super_admin`       → réservé au super-admin (42501) ;
--   * dernier super-admin restant          → refus (42501).
--
-- La suppression touche auth.users : TOUTES les tables métier
-- référencent auth.users(id) ON DELETE CASCADE (profils, livres,
-- chapitres, segments, favoris, abonnements, crédits, paiements,
-- sections, alertes…), donc un seul DELETE suffit.
--
-- Le journal est écrit AVANT le DELETE ; public.admin_actions ne porte
-- aucune clé étrangère vers auth.users, la trace survit donc au compte.
-- ============================================================

-- 1. Nouvelle action journalisable.
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
  check (action in (
    'attribuer', 'revoquer', 'nommer_role', 'retrograder_role', 'supprimer_compte'
  ));

-- 2. RPC de suppression.
create or replace function public.admin_supprimer_compte(
  p_user_id uuid,
  p_motif text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appelant uuid := auth.uid();
  v_role text;
  v_pseudo text;

  v_restants integer;
begin
  if v_appelant is null or not public.est_admin(v_appelant) then
    raise exception 'admin_supprimer_compte : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'admin_supprimer_compte : compte cible manquant.'
      using errcode = '22023';
  end if;

  if p_user_id = v_appelant then
    raise exception 'admin_supprimer_compte : un administrateur ne peut pas supprimer son propre compte.'
      using errcode = '42501';
  end if;

  select p.role, p.pseudo into v_role, v_pseudo
    from public.profiles p
   where p.id = p_user_id;

  if v_role is null then
    raise exception 'admin_supprimer_compte : compte % introuvable.', p_user_id
      using errcode = 'P0002';
  end if;

  -- Supprimer un administrateur (ou un super-administrateur) est
  -- réservé au super-administrateur : un simple admin ne peut pas
  -- décapiter la hiérarchie dont il dépend.
  if v_role in ('admin', 'super_admin') and not public.est_super_admin(v_appelant) then
    raise exception 'admin_supprimer_compte : seul un super-administrateur peut supprimer un compte administrateur.'
      using errcode = '42501';
  end if;

  -- Garde anti-verrouillage : il doit rester au moins un super-admin.
  if v_role = 'super_admin' then
    select count(*) into v_restants
      from public.profiles
     where role = 'super_admin' and id <> p_user_id;
    if v_restants = 0 then
      raise exception 'admin_supprimer_compte : impossible de supprimer le dernier super-administrateur.'
        using errcode = '42501';
    end if;
  end if;

  -- Journal AVANT la suppression (aucune FK vers auth.users).
  insert into public.admin_actions (admin_id, cible_id, action, role_cible, motif)
  values (
    v_appelant,
    p_user_id,
    'supprimer_compte',
    v_role,
    coalesce(nullif(btrim(p_motif), ''), 'suppression de ' || coalesce(v_pseudo, p_user_id::text))
  );

  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'utilisateur_id', p_user_id,
    'pseudo', v_pseudo,
    'role', v_role,
    'supprime', true,
    'journalise', true
  );
end $$;

revoke all on function public.admin_supprimer_compte(uuid, text) from public, anon;
grant execute on function public.admin_supprimer_compte(uuid, text)
  to authenticated, service_role;

-- 3. Lecture des courriels limitée aux administrateurs : rien à
--    changer (RPC admin_courriels_comptes déjà réservée à est_admin).
