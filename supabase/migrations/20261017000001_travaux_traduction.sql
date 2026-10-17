-- ============================================================
-- Plume d'Ombres — Travaux de traduction PERSISTANTS (17/10/2026).
--
-- Un « travail » = une demande de traduction d'un livre qui survit à
-- la fermeture du navigateur. Le navigateur (ou un script) CRÉE le
-- travail ; un exécutant côté serveur (POST /api/translate/travail,
-- déclenché chaque minute par netlify/functions/worker-traduction.mts)
-- le fait AVANCER par lots et tient les compteurs à jour.
--
-- Idempotente : réappliquable sans erreur (create ... if not exists,
-- create or replace function, drop policy/trigger if exists).
--
-- Contenu :
--   * public.travaux_traduction — une ligne = un travail ;
--   * index de prise du plus ancien travail actif, index d'unicité
--     (un seul travail actif par livre), index « mes travaux » ;
--   * trigger de fraîcheur : maj_le toujours posé par la base ;
--   * RLS activée, 4 politiques « own » (select/insert/update/delete)
--     + une politique explicite service_role (l'exécutant serveur) ;
--   * grants : authenticated en lecture/écriture « own », service_role
--     en tout, anon sans rien.
--
-- Strictement additive : aucune table/donnée existante n'est modifiée.
-- ============================================================

-- ---------- TABLE ----------
create table if not exists public.travaux_traduction (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  -- Défaut auth.uid() : un INSERT depuis le navigateur n'a pas besoin
  -- d'envoyer proprietaire_id (la politique RLS l'exige de toute façon).
  -- L'exécutant serveur (service_role) n'a pas de auth.uid() : il DOIT
  -- fournir proprietaire_id explicitement.
  proprietaire_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'termine', 'erreur', 'annule')),
  -- Segments traités (succès + échecs) depuis la création du travail.
  traites integer not null default 0 check (traites >= 0),
  -- Segments à traduire au moment de la création (0 = à calculer par
  -- l'exécutant au premier passage).
  total integer not null default 0 check (total >= 0),
  -- Segments restés en erreur (cumul des échecs non repris).
  erreurs integer not null default 0 check (erreurs >= 0),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  -- Dernier signe de vie de l'exécutant : un travail `en_cours` dont le
  -- battement est trop vieux est considéré abandonné et repris.
  battement_le timestamptz
);

comment on table public.travaux_traduction is
  'Travaux de traduction persistants : survivent à la fermeture du navigateur, avancés par un exécutant serveur planifié.';
comment on column public.travaux_traduction.traites is
  'Segments traités (succès + échecs) depuis la création du travail.';
comment on column public.travaux_traduction.battement_le is
  'Dernier signe de vie de l''exécutant (reprise après abandon).';

-- ---------- INDEX ----------
-- Prise du travail le plus ANCIEN encore actif (requête de l'exécutant).
create index if not exists travaux_traduction_file_idx
  on public.travaux_traduction (cree_le)
  where statut in ('en_attente', 'en_cours');

-- Un seul travail actif par livre : deux exécutants ne peuvent pas
-- traduire le même livre en parallèle (idempotence de creerTravail).
create unique index if not exists travaux_traduction_actif_livre_idx
  on public.travaux_traduction (livre_id)
  where statut in ('en_attente', 'en_cours');

-- « Où en est mon travail ? » (lecture côté navigateur, RLS « own »).
create index if not exists travaux_traduction_proprietaire_idx
  on public.travaux_traduction (proprietaire_id, cree_le desc);

-- ---------- TRIGGER DE FRAÎCHEUR ----------
-- maj_le est toujours posé par la base : aucun client ne peut le figer.
create or replace function public.toucher_travail_traduction()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.maj_le := now();
  return new;
end $$;

revoke all on function public.toucher_travail_traduction() from public, anon, authenticated;

drop trigger if exists toucher_travail_traduction on public.travaux_traduction;
create trigger toucher_travail_traduction
  before update on public.travaux_traduction
  for each row
  execute function public.toucher_travail_traduction();

-- ---------- RLS ----------
alter table public.travaux_traduction enable row level security;

drop policy if exists "travaux_traduction_select_own" on public.travaux_traduction;
create policy "travaux_traduction_select_own" on public.travaux_traduction
  for select using (auth.uid() = proprietaire_id);

drop policy if exists "travaux_traduction_insert_own" on public.travaux_traduction;
create policy "travaux_traduction_insert_own" on public.travaux_traduction
  for insert with check (auth.uid() = proprietaire_id);

drop policy if exists "travaux_traduction_update_own" on public.travaux_traduction;
create policy "travaux_traduction_update_own" on public.travaux_traduction
  for update using (auth.uid() = proprietaire_id)
  with check (auth.uid() = proprietaire_id);

drop policy if exists "travaux_traduction_delete_own" on public.travaux_traduction;
create policy "travaux_traduction_delete_own" on public.travaux_traduction
  for delete using (auth.uid() = proprietaire_id);

-- Accès de l'exécutant serveur. service_role contourne déjà la RLS
-- (attribut BYPASSRLS) ; la politique est explicite pour documenter
-- l'intention et survivre à un durcissement du rôle.
drop policy if exists "travaux_traduction_service_role" on public.travaux_traduction;
create policy "travaux_traduction_service_role" on public.travaux_traduction
  for all to service_role using (true) with check (true);

-- ---------- GRANTS ----------
revoke all on public.travaux_traduction from anon;
grant select, insert, update, delete on public.travaux_traduction to authenticated;
grant all on public.travaux_traduction to service_role;
