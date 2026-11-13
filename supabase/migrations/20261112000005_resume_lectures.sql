-- ============================================================
-- Chantier post-lancement — module 8 : Résumé à la reprise (F10)
--
-- Une table de CACHE :
--   • public.resume_lectures : UN résumé par livre, portant la
--     position jusqu'à laquelle il couvre. Régénéré seulement quand
--     le lecteur a avancé (économie d'appels de modèle).
--
-- Le résumé est produit par le modèle depuis le SEUL texte des
-- chapitres lus (contexte construit côté serveur). Aucune table
-- pour les questions : elles ne sont pas conservées.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own ».
-- ============================================================

create table if not exists public.resume_lectures (
  livre_id uuid primary key references public.livres (id) on delete cascade,
  -- Position (1 → n) du chapitre que le résumé couvre.
  jusqu_position integer not null check (jusqu_position >= 0),
  titre_chapitre text,
  contenu text not null check (char_length(contenu) between 1 and 8000),
  moteur text not null default 'modele',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resume_lectures enable row level security;

drop policy if exists "resume_lectures_select_own" on public.resume_lectures;
create policy "resume_lectures_select_own" on public.resume_lectures
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_insert_own" on public.resume_lectures;
create policy "resume_lectures_insert_own" on public.resume_lectures
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_update_own" on public.resume_lectures;
create policy "resume_lectures_update_own" on public.resume_lectures
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_delete_own" on public.resume_lectures;
create policy "resume_lectures_delete_own" on public.resume_lectures
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );
