-- ============================================================
-- Chantier post-lancement — module 5 : Carnet de lecture (F2)
--
-- Une table :
--   • public.carnet_notes : notes, citations et surlignages pris
--     pendant la lecture, rattachés à un livre (et, quand c'est
--     connu, à un chapitre). Aucun texte intégral n'y est stocké :
--     les extraits cités sont plafonnés (800 caractères, contrainte
--     CHECK) — la règle des exports (F24) vaut pour la table.
--
-- IDEMPOTENTE : `create table if not exists`, `create index if not
-- exists`, `drop policy if exists` avant chaque `create policy`.
-- ADDITIVE : aucune suppression, aucun renommage.
--
-- RLS : chaque compte ne voit et ne modifie que les notes de SES
-- livres (même logique que glossaires / chapitres / segments).
-- ============================================================

-- ---------- CARNET (notes, citations, surlignages) ----------
create table if not exists public.carnet_notes (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid references public.chapitres (id) on delete set null,
  -- note : réflexion libre ; citation : passage copié ; surlignage :
  -- passage marqué pendant la lecture.
  type text not null default 'note'
    check (type in ('note', 'citation', 'surlignage')),
  -- Passage cité ou surligné, PLAFONNÉ (jamais le texte intégral).
  extrait text check (extrait is null or char_length(extrait) <= 800),
  -- Note libre du lecteur (rattachée à l'extrait s'il y en a un).
  annotation text check (annotation is null or char_length(annotation) <= 4000),
  -- Titre du chapitre au moment de la prise de note (affichage,
  -- sans jointure au cas où le chapitre serait supprimé).
  chapitre_titre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Au moins UN contenu : un extrait ou une annotation non vide.
  check (
    coalesce(btrim(extrait), '') <> ''
    or coalesce(btrim(annotation), '') <> ''
  )
);

create index if not exists carnet_notes_livre_idx
  on public.carnet_notes (livre_id, created_at desc);

alter table public.carnet_notes enable row level security;

drop policy if exists "carnet_notes_select_own" on public.carnet_notes;
create policy "carnet_notes_select_own" on public.carnet_notes
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_insert_own" on public.carnet_notes;
create policy "carnet_notes_insert_own" on public.carnet_notes
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_update_own" on public.carnet_notes;
create policy "carnet_notes_update_own" on public.carnet_notes
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_delete_own" on public.carnet_notes;
create policy "carnet_notes_delete_own" on public.carnet_notes
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );
