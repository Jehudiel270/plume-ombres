-- ============================================================
-- Plume d'Ombres — ALERTES DE PAIEMENT POUR LES ADMINISTRATEURS
--
-- Objectif : le super-administrateur (et tout administrateur à qui
-- l'on ouvre la zone) reçoit une notification à chaque paiement
-- RÉUSSI ou ÉCHOUÉ, selon ce qu'il a coché. La zone « Alertes » est
-- une SECTION comme les autres : elle se délègue à un autre admin
-- depuis le tableau de bord.
--
-- Contenu :
--   1. notifications.cle  → clé d'idempotence (jamais deux alertes
--      pour le même paiement) ;
--   2. section 'notifications' ajoutée aux sections délégables ;
--   3. table admin_alertes (case « réussi », case « échoué ») ;
--   4. mes_alertes / definir_alertes (soi-même, ou un autre compte
--      pour le super-administrateur) ;
--   5. notifier_paiement(reference, statut) → écrit les notifications
--      de l'acheteur et des administrateurs abonnés ;
--   6. surveiller_paiements() → filet de sécurité pour les paiements
--      restés « en attente » (le webhook n'est jamais arrivé).
--
-- Migration STRICTEMENT additive.
-- ============================================================

-- ---------- 1. Clé d'idempotence ----------
alter table public.notifications
  add column if not exists cle text;

comment on column public.notifications.cle is
  'Clé d''idempotence : une seule notification par clé (ex. paiement:<ref>:<compte>).';

create unique index if not exists notifications_cle_uidx
  on public.notifications (cle)
  where cle is not null;

-- ---------- 2. Section délégable « notifications » ----------
alter table public.admin_sections
  drop constraint if exists admin_sections_connues;

alter table public.admin_sections
  add constraint admin_sections_connues check (
    sections <@ array[
      'comptes', 'abonnements', 'paiements', 'audience', 'systeme', 'notifications'
    ]::text[]
  );

-- ---------- 3. Table des préférences d'alerte ----------
create table if not exists public.admin_alertes (
  compte_id uuid primary key references auth.users (id) on delete cascade,
  paiement_reussi boolean not null default true,
  paiement_echoue boolean not null default true,
  maj_le timestamptz not null default now()
);

comment on table public.admin_alertes is
  'Préférences d''alerte de paiement par administrateur. Absence de ligne = tout coché.';

alter table public.admin_alertes enable row level security;

drop policy if exists admin_alertes_select_own on public.admin_alertes;
create policy admin_alertes_select_own on public.admin_alertes
  for select to authenticated
  using (auth.uid() = compte_id);

-- Aucune écriture directe : tout passe par definir_alertes().
revoke all on table public.admin_alertes from anon, authenticated;
grant select on table public.admin_alertes to authenticated;
grant all on table public.admin_alertes to service_role;

-- ---------- 4. Lecture / écriture des préférences ----------
create or replace function public.mes_alertes()
returns table (paiement_reussi boolean, paiement_echoue boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_super boolean := false;
begin
  if auth.uid() is null then
    return;
  end if;
  select (p.role = 'super_admin') into v_super
    from public.profiles p where p.id = auth.uid();
  v_super := coalesce(v_super, false);
  return query
    select coalesce(a.paiement_reussi, v_super),
           coalesce(a.paiement_echoue, v_super)
      from (select auth.uid() as uid) moi
      left join public.admin_alertes a on a.compte_id = moi.uid;
end
$function$;

revoke all on function public.mes_alertes() from public, anon;
grant execute on function public.mes_alertes() to authenticated, service_role;

create or replace function public.definir_alertes(
  p_reussi boolean,
  p_echoue boolean,
  p_compte uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_cible uuid := coalesce(p_compte, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'definir_alertes : non connecté' using errcode = '42501';
  end if;
  -- Un administrateur ne règle QUE ses propres alertes ; seul le
  -- super-administrateur peut régler celles d'un autre compte.
  if v_cible <> auth.uid() and not public.est_super_admin() then
    raise exception 'definir_alertes : réservé au super-administrateur'
      using errcode = '42501';
  end if;

  insert into public.admin_alertes as a (compte_id, paiement_reussi, paiement_echoue, maj_le)
  values (v_cible, coalesce(p_reussi, true), coalesce(p_echoue, true), now())
  on conflict (compte_id) do update set
    paiement_reussi = excluded.paiement_reussi,
    paiement_echoue = excluded.paiement_echoue,
    maj_le = now();
end
$function$;

revoke all on function public.definir_alertes(boolean, boolean, uuid) from public, anon;
grant execute on function public.definir_alertes(boolean, boolean, uuid) to authenticated, service_role;

-- Vue super-administrateur : qui reçoit quoi (pour l'écran de réglage).
create or replace function public.admin_alertes_liste()
returns table (compte_id uuid, paiement_reussi boolean, paiement_echoue boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.est_super_admin() and auth.role() <> 'service_role' then
    raise exception 'admin_alertes_liste : réservé au super-administrateur'
      using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(a.paiement_reussi, true), coalesce(a.paiement_echoue, true)
      from public.profiles p
      left join public.admin_alertes a on a.compte_id = p.id
     where public.est_admin(p.id);
end
$function$;

revoke all on function public.admin_alertes_liste() from public, anon;
grant execute on function public.admin_alertes_liste() to authenticated, service_role;

-- ---------- 5. Notification de paiement ----------
create or replace function public.notifier_paiement(
  p_reference text,
  p_statut text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_paiement public.paiements%rowtype;
  v_reussi boolean;
  v_montant text;
  v_libelle text;
  v_titre text;
  v_corps text;
  v_inseres integer := 0;
  v_lignes integer := 0;
  v_cle text;
  v_reference text;
begin
  if p_reference is null or p_statut not in ('reussi', 'echoue') then
    return 0;
  end if;

  select * into v_paiement from public.paiements where reference = p_reference;
  if not found then
    return 0;
  end if;
  v_reference := p_reference;

  -- Autorisation : le service (webhook), l'acheteur lui-même, ou un admin.
  if auth.role() <> 'service_role'
     and auth.uid() is distinct from v_paiement.proprietaire_id
     and not public.est_admin() then
    raise exception 'notifier_paiement : non autorisé' using errcode = '42501';
  end if;

  v_reussi := p_statut = 'reussi';
  v_montant := trim(to_char(v_paiement.montant, '999999999')) || ' ' || v_paiement.devise;
  v_libelle := case
                 when v_paiement.plan like 'pack%' then 'pack de crédits'
                 else v_paiement.plan
               end;

  -- -------- Notification de l'acheteur --------
  v_cle := 'paiement:' || p_reference || ':' || v_paiement.proprietaire_id::text;
  if not exists (select 1 from public.notifications n where n.cle = v_cle) then
    insert into public.notifications (proprietaire_id, type, titre, corps, lien, cle)
    values (
      v_paiement.proprietaire_id,
      'paiement',
      case when v_reussi then 'Paiement confirmé' else 'Paiement échoué' end,
      case
        when v_reussi then 'Votre paiement de ' || v_montant || ' est confirmé. Votre ' ||
                           v_libelle || ' est actif.'
        else 'Votre paiement de ' || v_montant || ' n''a pas abouti. Aucun montant n''a été débité ; vous pouvez réessayer.'
      end,
      case when v_reussi then '/compte' else '/abonnement' end,
      v_cle
    );
    v_inseres := v_inseres + 1;
  end if;

  -- -------- Notification des administrateurs abonnés --------
  v_titre := case when v_reussi then 'Paiement reçu' else 'Paiement échoué' end;
  v_corps := v_montant || ' — ' || v_libelle ||
             coalesce(' — ' || nullif(v_paiement.operateur, ''), '') ||
             ' — réf. ' || p_reference;

  insert into public.notifications (proprietaire_id, type, titre, corps, lien, cle)
  select p.id,
         'paiement',
         v_titre,
         v_corps,
         '/admin',
         'paiement:' || v_reference || ':' || lower(p_statut) || ':' || p.id
    from public.profiles p
    left join public.admin_alertes a on a.compte_id = p.id
   where p.role in ('admin', 'super_admin')
     and p.id <> v_paiement.proprietaire_id
     -- Réglage explicite s'il existe ; à défaut, SEUL le
     -- super-administrateur reçoit. Un admin reçoit donc les alertes
     -- uniquement quand le super-admin les lui ouvre (ou s'il les
     -- coche lui-même dans l'onglet Alertes).
     and coalesce(
           case when v_reussi then a.paiement_reussi else a.paiement_echoue end,
           p.role = 'super_admin'
         )
     and not exists (
       select 1 from public.notifications n
        where n.cle = 'paiement:' || v_reference || ':' || lower(p_statut) || ':' || p.id
     );

  get diagnostics v_lignes = row_count;
  v_inseres := v_inseres + v_lignes;
  return v_inseres;
end
$function$;

comment on function public.notifier_paiement(text, text) is
  'Écrit la notification de l''acheteur + celles des administrateurs abonnés. Idempotent.';

revoke all on function public.notifier_paiement(text, text) from public, anon;
grant execute on function public.notifier_paiement(text, text) to authenticated, service_role;

-- ---------- 6. Filet de sécurité (paiements bloqués) ----------
-- Appelé par le cron quotidien : repère les paiements restés « en
-- attente » depuis plus de 2 heures, et alerte les administrateurs
-- abonnés aux paiements échoués. Ne touche JAMAIS au statut.
create or replace function public.surveiller_paiements(p_heures integer default 2)
returns table (reference text, montant integer, cree_le timestamptz, age_heures numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_seuil interval := make_interval(hours => greatest(coalesce(p_heures, 2), 1));
begin
  return query
    select p.reference,
           p.montant,
           p.created_at,
           round(extract(epoch from (now() - p.created_at)) / 3600.0, 1)
      from public.paiements p
     where p.statut = 'en_attente'
       and p.created_at < now() - v_seuil
     order by p.created_at asc
     limit 50;

  -- Alerte groupée aux administrateurs abonnés aux échecs.
  insert into public.notifications (proprietaire_id, type, titre, corps, lien, cle)
  select a.compte_id,
         'erreur',
         'Paiements bloqués en attente',
         count(*) || ' paiement(s) en attente depuis plus de ' ||
           greatest(coalesce(p_heures, 2), 1) || ' h. Vérifiez le webhook FedaPay.',
         '/admin',
         'surveillance:' || to_char(now(), 'YYYY-MM-DD') || ':' || a.compte_id::text
    from public.admin_alertes a
    join public.paiements p
      on p.statut = 'en_attente' and p.created_at < now() - v_seuil
   where a.paiement_echoue
     and not exists (
       select 1 from public.notifications n
        where n.cle = 'surveillance:' || to_char(now(), 'YYYY-MM-DD') || ':' || a.compte_id::text
     )
   group by a.compte_id;
end
$function$;

comment on function public.surveiller_paiements(integer) is
  'Repère les paiements en attente trop anciens et alerte une fois par jour les admins abonnés.';

revoke all on function public.surveiller_paiements(integer) from public, anon, authenticated;
grant execute on function public.surveiller_paiements(integer) to service_role;
