-- ============================================================
-- Dark Romance Translator — Favoris (v1)
-- Table : public.favorites — les livres marqués « favori »
-- par chaque utilisateur.
-- RLS : chaque utilisateur ne voit que ses propres favoris
-- (même modèle que les policies de public.livres).
-- ============================================================

-- ---------- FAVORIS ----------
-- Une ligne = un livre favori pour un utilisateur donné.
-- L'unicité (proprietaire_id, livre_id) interdit les doublons ;
-- la suppression d'un livre (livres) ou d'un compte (auth.users)
-- retire automatiquement les favoris liés (on delete cascade).
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proprietaire_id, livre_id)
);

-- Index : recherche rapide « ce livre est-il favori ? » et
-- liste des favoris d'un propriétaire (indexe la contrainte
-- d'unicité à l'envers, utile pour les requêtes par livre).
create index if not exists favoris_livre_idx on public.favorites (livre_id);

-- RLS activé : sans policy, aucun accès ; avec, uniquement
-- ses propres lignes.
alter table public.favorites enable row level security;

-- (Re)création idempotente des policies du même modèle que
-- public.livres : chaque utilisateur ne voit que ses lignes.
drop policy if exists "favoris_select_own" on public.favorites;
create policy "favoris_select_own" on public.favorites
  for select using (auth.uid() = proprietaire_id);
drop policy if exists "favoris_insert_own" on public.favorites;
create policy "favoris_insert_own" on public.favorites
  for insert with check (auth.uid() = proprietaire_id);
drop policy if exists "favoris_update_own" on public.favorites;
create policy "favoris_update_own" on public.favorites
  for update using (auth.uid() = proprietaire_id);
drop policy if exists "favoris_delete_own" on public.favorites;
create policy "favoris_delete_own" on public.favorites
  for delete using (auth.uid() = proprietaire_id);