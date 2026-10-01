-- ============================================================
-- P1.1 — Glossaire par livre (cohérence de traduction)
--
-- Deux tables :
--   • public.glossaires        : un glossaire par livre ;
--   • public.glossaire_entrees : source → traduction IMPOSÉE,
--     clé unique (glossaire_id, source_normalisee) qui rend la
--     correspondance INSENSIBLE À LA CASSE (la normalisation est
--     faite par l'application : lib/glossaire.ts).
--
-- IDEMPOTENTE : `create table if not exists`, `create index if not
-- exists`, `drop policy if exists` avant chaque `create policy`.
-- Une seconde exécution ne modifie rien et ne lève pas d'erreur.
--
-- RLS : chaque utilisateur ne voit et ne modifie que le glossaire
-- des livres qu'il possède (même logique que chapitres/segments).
-- ============================================================

-- ---------- GLOSSAIRES (un par livre) ----------
create table if not exists public.glossaires (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null unique references public.livres (id) on delete cascade,
  langue_source text not null default 'en',
  langue_cible text not null default 'fr',
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists glossaires_livre_idx on public.glossaires (livre_id);

alter table public.glossaires enable row level security;

drop policy if exists "glossaires_select_own" on public.glossaires;
create policy "glossaires_select_own" on public.glossaires
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = glossaires.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaires_insert_own" on public.glossaires;
create policy "glossaires_insert_own" on public.glossaires
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = glossaires.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaires_update_own" on public.glossaires;
create policy "glossaires_update_own" on public.glossaires
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = glossaires.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaires_delete_own" on public.glossaires;
create policy "glossaires_delete_own" on public.glossaires
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = glossaires.livre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- ENTRÉES DE GLOSSAIRE ----------
create table if not exists public.glossaire_entrees (
  id bigint generated always as identity primary key,
  glossaire_id uuid not null references public.glossaires (id) on delete cascade,
  -- Forme affichée (telle que saisie par l'utilisateur).
  source text not null,
  -- Forme normalisée : minuscules + espaces réduits → unicité insensible à la casse.
  source_normalisee text not null,
  -- Traduction imposée, réutilisée telle quelle par le moteur.
  traduction text not null,
  categorie text not null default 'autre'
    check (categorie in ('personnage', 'lieu', 'terme', 'autre')),
  -- true = imposée par l'utilisateur (jamais écrasée par une suggestion).
  verrouillee boolean not null default false,
  occurrences integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (glossaire_id, source_normalisee)
);

create index if not exists glossaire_entrees_glossaire_idx
  on public.glossaire_entrees (glossaire_id, source_normalisee);

alter table public.glossaire_entrees enable row level security;

drop policy if exists "glossaire_entrees_select_own" on public.glossaire_entrees;
create policy "glossaire_entrees_select_own" on public.glossaire_entrees
  for select using (
    exists (
      select 1 from public.glossaires g
      join public.livres l on l.id = g.livre_id
      where g.id = glossaire_entrees.glossaire_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaire_entrees_insert_own" on public.glossaire_entrees;
create policy "glossaire_entrees_insert_own" on public.glossaire_entrees
  for insert with check (
    exists (
      select 1 from public.glossaires g
      join public.livres l on l.id = g.livre_id
      where g.id = glossaire_entrees.glossaire_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaire_entrees_update_own" on public.glossaire_entrees;
create policy "glossaire_entrees_update_own" on public.glossaire_entrees
  for update using (
    exists (
      select 1 from public.glossaires g
      join public.livres l on l.id = g.livre_id
      where g.id = glossaire_entrees.glossaire_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "glossaire_entrees_delete_own" on public.glossaire_entrees;
create policy "glossaire_entrees_delete_own" on public.glossaire_entrees
  for delete using (
    exists (
      select 1 from public.glossaires g
      join public.livres l on l.id = g.livre_id
      where g.id = glossaire_entrees.glossaire_id and l.proprietaire_id = auth.uid()
    )
  );
