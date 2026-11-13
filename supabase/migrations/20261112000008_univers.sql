-- ============================================================
-- Chantier post-lancement — module 12 : Univers multi-tomes (F17)
--
-- Deux tables :
--   • public.univers        : un univers = une SAGA organisée par le
--     lecteur (titre, description), PRIVÉE ;
--   • public.univers_livres : les tomes, ORDONNÉS (position), un
--     livre ne peut être que dans UN univers (UNIQUE livre_id).
--
-- Plan Illimité (registre). IDEMPOTENTE et ADDITIVE. RLS « own ».
-- ============================================================

create table if not exists public.univers (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.univers enable row level security;

drop policy if exists "univers_select_own" on public.univers;
create policy "univers_select_own" on public.univers
  for select using (proprietaire_id = auth.uid());

drop policy if exists "univers_insert_own" on public.univers;
create policy "univers_insert_own" on public.univers
  for insert with check (proprietaire_id = auth.uid());

drop policy if exists "univers_update_own" on public.univers;
create policy "univers_update_own" on public.univers
  for update using (proprietaire_id = auth.uid());

drop policy if exists "univers_delete_own" on public.univers;
create policy "univers_delete_own" on public.univers
  for delete using (proprietaire_id = auth.uid());

-- ---------- TOMES (livres ordonnés) ----------
create table if not exists public.univers_livres (
  id bigint generated always as identity primary key,
  univers_id uuid not null references public.univers (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  position integer not null default 1 check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (univers_id, livre_id)
);

create index if not exists univers_livres_univers_idx
  on public.univers_livres (univers_id, position);

alter table public.univers_livres enable row level security;

drop policy if exists "univers_livres_select_own" on public.univers_livres;
create policy "univers_livres_select_own" on public.univers_livres
  for select using (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "univers_livres_insert_own" on public.univers_livres;
create policy "univers_livres_insert_own" on public.univers_livres
  for insert with check (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "univers_livres_delete_own" on public.univers_livres;
create policy "univers_livres_delete_own" on public.univers_livres
  for delete using (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );
