-- ============================================================
-- Plume d'Ombres — Notifications PERSISTANTES (cloche + historisation).
--
-- Idempotente : réappliquable sans erreur (create ... if not exists,
-- create or replace function, drop policy if exists avant create policy,
-- drop trigger if exists).
--
-- Contenu :
--   * public.notifications — une ligne = une notification d'un compte ;
--   * RLS activée, 4 politiques « own » (select/insert/update/delete) ;
--   * public.compter_notifications_non_lues() — RPC compteur (SECURITY
--     DEFINER) : nombre de non-lues du compte courant ;
--   * public.marquer_notifications_lues(p_ids) — RPC de marquage
--     (SECURITY DEFINER) : toutes si p_ids est null, sinon les ids visés
--     DU SEUL compte courant ;
--   * trigger public.notifier_traduction_terminee — quand un livre passe
--     au statut 'traduit', crée UNE notification « Traduction terminée »
--     pour son propriétaire (sans écrire côté application).
--
-- Aucune donnée n'est retirée : la migration est strictement additive.
-- ============================================================

-- ---------- TABLE ----------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'info'
    check (type in ('info', 'traduction', 'paiement', 'erreur')),
  titre text not null,
  corps text,
  lien text,
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);

-- Liste « mes notifications, les plus récentes d'abord ».
create index if not exists notifications_proprietaire_cree_idx
  on public.notifications (proprietaire_id, cree_le desc);

-- Index PARTIEL : comptage/lookup des non-lues uniquement (léger).
create index if not exists notifications_non_lues_idx
  on public.notifications (proprietaire_id)
  where lu = false;

-- ---------- RLS ----------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = proprietaire_id);

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications
  for insert with check (auth.uid() = proprietaire_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = proprietaire_id)
  with check (auth.uid() = proprietaire_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = proprietaire_id);

-- ---------- RPC : compteur de non-lues ----------
-- Renvoie le nombre de notifications non lues du compte courant
-- (auth.uid()). SECURITY DEFINER : la lecture ne dépend pas des
-- politiques RLS, mais le filtre reste borné au propriétaire courant.
create or replace function public.compter_notifications_non_lues()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.notifications
   where proprietaire_id = auth.uid()
     and lu = false;
$$;

revoke all on function public.compter_notifications_non_lues() from public, anon;
grant execute on function public.compter_notifications_non_lues() to authenticated, service_role;

-- ---------- RPC : marquer comme lues ----------
-- Marque comme lues les notifications DU compte courant : toutes si
-- p_ids est null, sinon uniquement celles dont l'id figure dans p_ids.
-- La clause `proprietaire_id = auth.uid()` garantit qu'un compte ne
-- peut jamais marquer les notifications d'un autre.
create or replace function public.marquer_notifications_lues(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  update public.notifications
     set lu = true
   where proprietaire_id = auth.uid()
     and lu = false
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.marquer_notifications_lues(bigint[]) from public, anon;
grant execute on function public.marquer_notifications_lues(bigint[]) to authenticated, service_role;

-- ---------- TRIGGER : traduction terminée ----------
-- Crée UNE notification quand un livre passe au statut 'traduit'
-- (jamais au rejeu du même statut : old.statut is distinct from 'traduit').
-- SECURITY DEFINER : l'insertion fonctionne quel que soit l'auteur de
-- la mise à jour, sans dépendre des politiques RLS de l'appelant.
create or replace function public.notifier_traduction_terminee()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.statut = 'traduit' and old.statut is distinct from 'traduit' then
    insert into public.notifications (proprietaire_id, type, titre, corps, lien)
    values (
      new.proprietaire_id,
      'traduction',
      'Traduction terminée',
      new.titre,
      '/livres/' || new.id::text
    );
  end if;
  return new;
end $$;

-- Fonction de trigger : jamais appelable directement par les clients.
revoke all on function public.notifier_traduction_terminee() from public, anon, authenticated;

drop trigger if exists notifier_traduction_terminee on public.livres;
create trigger notifier_traduction_terminee
  after update of statut on public.livres
  for each row
  execute function public.notifier_traduction_terminee();
