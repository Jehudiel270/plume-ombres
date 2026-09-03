-- ============================================================
-- Dark Romance Translator — schéma de base (v1)
-- Tables : profiles, livres, chapitres, segments
-- RLS : chaque utilisateur ne voit que ses propres livres.
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null default 'lecteur',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ---------- LIVRES ----------
create table if not exists public.livres (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  titre text not null,
  auteur text,
  langue_source text not null default 'en',
  langue_cible text not null default 'fr',
  nom_fichier text,
  statut text not null default 'importe'
    check (statut in ('importe', 'pret', 'en_traduction', 'traduit', 'erreur')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists livres_proprietaire_idx on public.livres (proprietaire_id);

alter table public.livres enable row level security;

create policy "livres_select_own" on public.livres
  for select using (auth.uid() = proprietaire_id);
create policy "livres_insert_own" on public.livres
  for insert with check (auth.uid() = proprietaire_id);
create policy "livres_update_own" on public.livres
  for update using (auth.uid() = proprietaire_id);
create policy "livres_delete_own" on public.livres
  for delete using (auth.uid() = proprietaire_id);

-- ---------- CHAPITRES ----------
create table if not exists public.chapitres (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  position integer not null,
  titre text not null default 'Chapitre',
  texte_source text not null default '',
  texte_traduit text,
  statut text not null default 'a_traduire'
    check (statut in ('a_traduire', 'en_traduction', 'traduit', 'erreur')),
  updated_at timestamptz not null default now(),
  unique (livre_id, position)
);

create index if not exists chapitres_livre_idx on public.chapitres (livre_id, position);

alter table public.chapitres enable row level security;

create policy "chapitres_select_own" on public.chapitres
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = chapitres.livre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "chapitres_insert_own" on public.chapitres
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = chapitres.livre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "chapitres_update_own" on public.chapitres
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = chapitres.livre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "chapitres_delete_own" on public.chapitres
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = chapitres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- SEGMENTS ----------
-- Un segment = une unité de traduction (paragraphe, ou partie de paragraphe
-- si celui-ci dépasse la limite du fournisseur). La colonne "suite" contient
-- l'espacement (sauts de ligne, lignes vides) qui suivait l'unité dans le
-- texte original : l'assemblage 1:1 consiste à concaténer traduit + suite,
-- ce qui préserve exactement la structure (paragraphes, lignes vides).
create table if not exists public.segments (
  id bigint generated always as identity primary key,
  chapitre_id uuid not null references public.chapitres (id) on delete cascade,
  position integer not null,
  source text not null,
  suite text not null default '',
  traduit text,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'fait', 'erreur')),
  tentative integer not null default 0,
  erreur text,
  updated_at timestamptz not null default now(),
  unique (chapitre_id, position)
);

create index if not exists segments_chapitre_idx on public.segments (chapitre_id, position);

alter table public.segments enable row level security;

create policy "segments_select_own" on public.segments
  for select using (
    exists (
      select 1 from public.chapitres c
      join public.livres l on l.id = c.livre_id
      where c.id = segments.chapitre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "segments_insert_own" on public.segments
  for insert with check (
    exists (
      select 1 from public.chapitres c
      join public.livres l on l.id = c.livre_id
      where c.id = segments.chapitre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "segments_update_own" on public.segments
  for update using (
    exists (
      select 1 from public.chapitres c
      join public.livres l on l.id = c.livre_id
      where c.id = segments.chapitre_id and l.proprietaire_id = auth.uid()
    )
  );
create policy "segments_delete_own" on public.segments
  for delete using (
    exists (
      select 1 from public.chapitres c
      join public.livres l on l.id = c.livre_id
      where c.id = segments.chapitre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- DECLENCHEUR : mise à jour updated_at ----------
create or replace function public.maj_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists maj_livres_updated_at on public.livres;
create trigger maj_livres_updated_at before update on public.livres
  for each row execute function public.maj_updated_at();

drop trigger if exists maj_chapitres_updated_at on public.chapitres;
create trigger maj_chapitres_updated_at before update on public.chapitres
  for each row execute function public.maj_updated_at();

drop trigger if exists maj_segments_updated_at on public.segments;
create trigger maj_segments_updated_at before update on public.segments
  for each row execute function public.maj_updated_at();
