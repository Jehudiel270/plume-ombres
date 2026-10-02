-- ============================================================
-- Plume d'Ombres — Repères de contenu (chantier W2 / idée E5)
--
-- Le public dark romance attend des repères explicites avant
-- d'ouvrir un livre (pratique standard AO3 / Wattpad) :
--   * classification d'âge au niveau du livre ;
--   * avertissements de contenu (content warnings) et tropes ;
--   * drapeau « spoiler » pour masquer les libellés qui
--     divulgâchent l'intrigue ;
--   * drapeau « grave » : déclenche l'écran d'avertissement.
--
-- Migration IDEMPOTENTE : peut être rejouée sans erreur.
-- ============================================================

-- ---------- CLASSIFICATION D'ÂGE (au niveau du livre) ----------
alter table public.livres
  add column if not exists classification_age text not null default 'non_classee';

-- Contrainte de domaine ajoutée séparément (idempotence : on ne
-- recrée pas la contrainte si elle existe déjà).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'livres_classification_age_check'
  ) then
    alter table public.livres
      add constraint livres_classification_age_check
      check (
        classification_age in (
          'non_classee', 'tout_public', 'ado', 'mature', 'explicite'
        )
      );
  end if;
end $$;

comment on column public.livres.classification_age is
  'Classification d''âge du livre (échelle AO3/Wattpad) : non_classee, tout_public, ado (13+), mature (17+), explicite (18+).';

-- ---------- AVERTISSEMENTS / TROPES ----------
-- Une ligne = un repère de contenu d'un livre. `categorie` distingue
-- un avertissement (ce à quoi le lecteur s'expose) d'un trope (ce
-- qu'il vient chercher). `origine` trace une proposition automatique
-- que le propriétaire a explicitement acceptée.
create table if not exists public.avertissements (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  categorie text not null default 'avertissement'
    check (categorie in ('avertissement', 'trope')),
  libelle text not null,
  spoiler boolean not null default false,
  grave boolean not null default false,
  origine text not null default 'manuel'
    check (origine in ('manuel', 'suggestion_acceptee')),
  created_at timestamptz not null default now(),
  unique (livre_id, libelle)
);

create index if not exists avertissements_livre_idx
  on public.avertissements (livre_id, categorie);

comment on table public.avertissements is
  'Repères de contenu par livre : avertissements (content warnings) et tropes.';
comment on column public.avertissements.spoiler is
  'Vrai si le libellé divulgâche l''intrigue : masqué par défaut dans la fiche.';
comment on column public.avertissements.grave is
  'Vrai si le repère déclenche l''écran d''avertissement avant lecture.';
comment on column public.avertissements.origine is
  'manuel, ou suggestion_acceptee (proposition automatique validée par le propriétaire).';

-- RLS : même modèle que public.chapitres — accès réservé au
-- propriétaire du livre concerné.
alter table public.avertissements enable row level security;

drop policy if exists "avertissements_select_own" on public.avertissements;
create policy "avertissements_select_own" on public.avertissements
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = avertissements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "avertissements_insert_own" on public.avertissements;
create policy "avertissements_insert_own" on public.avertissements
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = avertissements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "avertissements_update_own" on public.avertissements;
create policy "avertissements_update_own" on public.avertissements
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = avertissements.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "avertissements_delete_own" on public.avertissements;
create policy "avertissements_delete_own" on public.avertissements
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = avertissements.livre_id and l.proprietaire_id = auth.uid()
    )
  );
