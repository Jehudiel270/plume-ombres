-- ============================================================
-- Chantier post-lancement — module 7 bis : GRAPHE NARRATIF RICHE
-- (F25, portage fidèle de la maquette components/narrative).
--
-- Ce que la maquette appelle « l'arbre de l'histoire » :
--   • des personnages avec IMPORTANCE (1 secondaire, 2 notable,
--     3 principal) — taille et mise en avant dans la toile ;
--   • des relations TYPÉES (famille, alliance, rivalité, amour,
--     autorité, dette, méfiance, trahison, secret…) avec un SENS
--     (aller / retour / réciproque), une INTENSITÉ (1–5 = épaisseur
--     du trait), un ÉTAT lisible (« cordiale, sous tension »…) et
--     une FIABILITÉ (fait / déduction / hypothèse / incertain —
--     trait plein / tirets / pointillé) ;
--   • des ÉVÉNEMENTS datés par chapitre (rencontre, alliance,
--     rupture, changement de confiance, révélation, changement
--     d'état) qui alimentent la CHRONOLOGIE.
--
-- ANTI-SPOILERS INCHANGÉS : chaque élément garde sa première
-- apparition ; l'événement est filtré par le chapitre qu'il
-- concerne (le serveur ne renvoie rien au-delà du chapitre lu).
--
-- MIGRATION ADDITIVE et IDEMPOTENTE (aucun DROP, aucun renommage).
-- ============================================================

-- ---------- PERSONNAGES : importance ----------
alter table public.graphe_personnages
  add column if not exists importance smallint not null default 2
    check (importance between 1 and 3);

-- ---------- RELATIONS : type, sens, intensité, état, fiabilité ----------
alter table public.graphe_relations
  add column if not exists type text not null default 'autre'
    check (type in (
      'famille', 'amitie', 'alliance', 'rivalite', 'amour',
      'hierarchie', 'dette', 'mefiance', 'trahison', 'secret', 'autre'
    )),
  add column if not exists sens text not null default 'none'
    check (sens in ('ab', 'ba', 'both', 'none')),
  add column if not exists intensite smallint not null default 2
    check (intensite between 1 and 5),
  add column if not exists etat text
    check (etat is null or char_length(etat) <= 160),
  add column if not exists fiabilite text not null default 'fait'
    check (fiabilite in ('fait', 'deduction', 'hypothese', 'incertain'));

-- ---------- ÉVÉNEMENTS (chronologie) ----------
create table if not exists public.graphe_evenements (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  -- Chapitre où l'événement se produit (filtrage anti-spoilers).
  chapitre_id uuid not null references public.chapitres (id) on delete cascade,
  -- rencontre / alliance / rupture / confiance / revelation / etat
  genre text not null default 'rencontre'
    check (genre in ('rencontre', 'alliance', 'rupture', 'confiance', 'revelation', 'etat')),
  titre text not null check (char_length(btrim(titre)) between 1 and 160),
  texte text check (texte is null or char_length(texte) <= 800),
  -- Relation concernée, facultative (la rupture d'une alliance…).
  relation_id uuid references public.graphe_relations (id) on delete set null,
  -- Personnages concernés (ids de graphe_personnages, validés par l'API).
  personnages uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists graphe_evenements_livre_idx
  on public.graphe_evenements (livre_id);

alter table public.graphe_evenements enable row level security;

drop policy if exists "graphe_evenements_select_own" on public.graphe_evenements;
create policy "graphe_evenements_select_own" on public.graphe_evenements
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_evenements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_evenements_insert_own" on public.graphe_evenements;
create policy "graphe_evenements_insert_own" on public.graphe_evenements
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = graphe_evenements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_evenements_delete_own" on public.graphe_evenements;
create policy "graphe_evenements_delete_own" on public.graphe_evenements
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_evenements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- COMMENTAIRES ----------
comment on column public.graphe_personnages.importance is
  '1 = secondaire, 2 = notable, 3 = principal (taille du nœud, filtre « principaux »).';
comment on column public.graphe_relations.type is
  'Type de lien (couleur de l''arête et légende) : famille, amitie, alliance, rivalite, amour, hierarchie, dette, mefiance, trahison, secret, autre.';
comment on column public.graphe_relations.sens is
  'Orientation : ab = origine vers destination, ba = inverse, both = réciproque orientée, none = symétrique.';
comment on column public.graphe_relations.fiabilite is
  'Trait : fait (plein), deduction (tirets), hypothese (pointillé), incertain (pointillé fin).';
