-- ============================================================
-- Chantier post-lancement — module 6 : Théories de lecture (F8)
--
-- Une table :
--   • public.theories : hypothèses de lecture PERSONNELLES (atelier,
--     rien de public), rattachées à un livre et, quand c'est connu,
--     au chapitre où l'hypothèse a été posée. Statut traçant :
--     ouverte → confirmée / infirmée.
--
-- IDEMPOTENTE et ADDITIVE (aucune suppression, aucun renommage).
-- RLS « own » : chaque compte ne voit et ne modifie que SES théories.
-- ============================================================

create table if not exists public.theories (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid references public.chapitres (id) on delete set null,
  titre text not null check (char_length(btrim(titre)) between 2 and 200),
  raisonnement text not null check (char_length(btrim(raisonnement)) between 1 and 8000),
  -- Étiquettes libres (personnages, lieux…), max 5, posées par l'app.
  etiquettes text[] not null default '{}',
  -- Traçabilité : une théorie peut rester ouverte ou être tranchée.
  statut text not null default 'ouverte'
    check (statut in ('ouverte', 'confirmee', 'infirmee')),
  tranchee_au_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists theories_livre_idx
  on public.theories (livre_id, created_at desc);

alter table public.theories enable row level security;

drop policy if exists "theories_select_own" on public.theories;
create policy "theories_select_own" on public.theories
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_insert_own" on public.theories;
create policy "theories_insert_own" on public.theories
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_update_own" on public.theories;
create policy "theories_update_own" on public.theories
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_delete_own" on public.theories;
create policy "theories_delete_own" on public.theories
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );
