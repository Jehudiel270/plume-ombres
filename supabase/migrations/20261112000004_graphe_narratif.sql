-- ============================================================
-- Chantier post-lancement — module 7 : Graphe narratif (F25,
-- MANUEL d'abord). Deux tables :
--
--   • public.graphe_personnages : nœuds du graphe (nom, rôle,
--     description courte) ;
--   • public.graphe_relations   : arêtes orientées et libellées
--     (« sœur de », « trahit »…).
--
-- ANTI-SPOILERS PAR CONSTRUCTION : chaque nœud et chaque arête
-- porte sa PREMIÈRE APPARITION (chapitre, nullable = présent dès le
-- début). Le SERVEUR ne renvoie que ce qui est couvert par le
-- chapitre lu transmis par le lecteur (voir lib/graphe.ts) —
-- aucune donnée au-delà ne quitte la base, pas de flou CSS.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » complète.
-- ============================================================

-- ---------- PERSONNAGES (nœuds) ----------
create table if not exists public.graphe_personnages (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  nom text not null check (char_length(btrim(nom)) between 1 and 120),
  -- protagoniste / antagoniste / allie / secondaire / autre
  role text not null default 'secondaire'
    check (role in ('protagoniste', 'antagoniste', 'allie', 'secondaire', 'autre')),
  description text check (description is null or char_length(description) <= 2000),
  -- null = présent dès le début de l'œuvre.
  premiere_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists graphe_personnages_livre_idx
  on public.graphe_personnages (livre_id);

alter table public.graphe_personnages enable row level security;

drop policy if exists "graphe_personnages_select_own" on public.graphe_personnages;
create policy "graphe_personnages_select_own" on public.graphe_personnages
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_insert_own" on public.graphe_personnages;
create policy "graphe_personnages_insert_own" on public.graphe_personnages
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_update_own" on public.graphe_personnages;
create policy "graphe_personnages_update_own" on public.graphe_personnages
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_delete_own" on public.graphe_personnages;
create policy "graphe_personnages_delete_own" on public.graphe_personnages
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- RELATIONS (arêtes) ----------
create table if not exists public.graphe_relations (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  origine_id uuid not null references public.graphe_personnages (id) on delete cascade,
  destination_id uuid not null references public.graphe_personnages (id) on delete cascade,
  libelle text not null check (char_length(btrim(libelle)) between 1 and 160),
  premiere_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  check (origine_id <> destination_id)
);

create index if not exists graphe_relations_livre_idx
  on public.graphe_relations (livre_id);

alter table public.graphe_relations enable row level security;

drop policy if exists "graphe_relations_select_own" on public.graphe_relations;
create policy "graphe_relations_select_own" on public.graphe_relations
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_insert_own" on public.graphe_relations;
create policy "graphe_relations_insert_own" on public.graphe_relations
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_update_own" on public.graphe_relations;
create policy "graphe_relations_update_own" on public.graphe_relations
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_delete_own" on public.graphe_relations;
create policy "graphe_relations_delete_own" on public.graphe_relations
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );
