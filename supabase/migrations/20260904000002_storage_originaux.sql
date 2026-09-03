-- ============================================================
-- Plume d'Ombres — Stockage des fichiers originaux (migration 2)
-- Bucket privé « originaux » : chaque utilisateur ne voit et ne
-- télécharge que ses propres fichiers (owner_id = auth.uid()::text).
-- ============================================================

-- Colonne sur les livres : chemin du fichier original dans le bucket.
alter table public.livres
  add column if not exists fichier_original text;

-- Bucket privé (50 Mo max par fichier).
insert into storage.buckets (id, name, public, file_size_limit)
values ('originaux', 'originaux', false, 52428800)
on conflict (id) do nothing;

-- Politiques d'accès au bucket (storage.objects).
drop policy if exists "originaux_insert_own" on storage.objects;
create policy "originaux_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'originaux' and owner_id = auth.uid()::text
  );

drop policy if exists "originaux_select_own" on storage.objects;
create policy "originaux_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'originaux' and owner_id = auth.uid()::text);

drop policy if exists "originaux_update_own" on storage.objects;
create policy "originaux_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'originaux' and owner_id = auth.uid()::text);

drop policy if exists "originaux_delete_own" on storage.objects;
create policy "originaux_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'originaux' and owner_id = auth.uid()::text);
