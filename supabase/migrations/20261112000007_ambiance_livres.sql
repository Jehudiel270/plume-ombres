-- ============================================================
-- Chantier post-lancement — module 11 : Fiches d'ambiance (F5)
--
-- Une table :
--   • public.ambiance_livres : UNE fiche par livre (genres, tropes,
--     intensité 1 → 5). Complète les avertissements de contenu qui
--     existent déjà (socle) : ici, l'AMBIANCE du récit, posée par le
--     propriétaire du livre, pour guider sa relecture ou son partage
--     privé de recommandations.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » (via livres.proprietaire_id).
-- ============================================================

create table if not exists public.ambiance_livres (
  livre_id uuid primary key references public.livres (id) on delete cascade,
  -- Listes libres posées par l'application (tableaux plafonnés).
  genres text[] not null default '{}',
  tropes text[] not null default '{}',
  -- 1 = discret … 5 = très sombre (libellés dans lib/ambiance.ts).
  intensite integer not null default 3 check (intensite between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ambiance_livres enable row level security;

drop policy if exists "ambiance_livres_select_own" on public.ambiance_livres;
create policy "ambiance_livres_select_own" on public.ambiance_livres
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_insert_own" on public.ambiance_livres;
create policy "ambiance_livres_insert_own" on public.ambiance_livres
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_update_own" on public.ambiance_livres;
create policy "ambiance_livres_update_own" on public.ambiance_livres
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_delete_own" on public.ambiance_livres;
create policy "ambiance_livres_delete_own" on public.ambiance_livres
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );
