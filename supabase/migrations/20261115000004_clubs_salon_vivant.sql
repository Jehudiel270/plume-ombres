-- ============================================================
-- Chantier « salon vivant » (F11 v3) — les discussions deviennent
-- fluides : réactions émojis, messages privés entre membres.
--
-- ADDITIVE et IDEMPOTENTE :
--   • clubs_messages.prive / destinataire_id  → MP au sein du club ;
--   • clubs_reactions                         → réactions émojis.
-- La politique de lecture des messages est resserrée : un message
-- privé n'est visible QUE de son auteur et de son destinataire
-- (jamais du créateur, jamais des autres membres).
-- ============================================================

-- ---------- MESSAGES PRIVÉS ----------
-- destinataire_id vise auth.users (PAS profiles) : clubs_messages a
-- déjà une FK vers profiles via auteur_id, et deux FK vers la même
-- table rendraient l'embarqué `profiles ( pseudo )` ambigu pour
-- PostgREST (le fil resterait vide). Le pseudo du destinataire est
-- résolu côté application depuis la liste des membres.
alter table public.clubs_messages
  add column if not exists prive boolean not null default false;

alter table public.clubs_messages
  add column if not exists destinataire_id uuid
  references auth.users (id) on delete set null;

-- Lecture : membre du club ET (message public OU je suis concerné).
drop policy if exists "clubs_messages_select_membre" on public.clubs_messages;
create policy "clubs_messages_select_membre" on public.clubs_messages
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_messages.club_id
        and m.utilisateur_id = auth.uid()
    )
    and (
      clubs_messages.prive = false
      or clubs_messages.auteur_id = auth.uid()
      or clubs_messages.destinataire_id = auth.uid()
    )
  );

-- ---------- RÉACTIONS ÉMOJIS ----------
create table if not exists public.clubs_reactions (
  id bigint generated always as identity primary key,
  message_id bigint not null
    references public.clubs_messages (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  utilisateur_id uuid not null
    references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, utilisateur_id, emoji)
);

create index if not exists clubs_reactions_message_idx
  on public.clubs_reactions (message_id);
create index if not exists clubs_reactions_club_idx
  on public.clubs_reactions (club_id);

alter table public.clubs_reactions enable row level security;

-- Lecture : membre du club, message visible (pas un MP entre autres),
-- et pas un message au-delà de MA position de lecture.
create policy "clubs_reactions_select_membre" on public.clubs_reactions
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_reactions.club_id
        and m.utilisateur_id = auth.uid()
    )
    and exists (
      select 1
      from public.clubs_messages msg
      join public.clubs_membres moi
        on moi.club_id = msg.club_id and moi.utilisateur_id = auth.uid()
      where msg.id = clubs_reactions.message_id
        and (msg.chapitre_max = 0 or moi.position_lecture >= msg.chapitre_max)
        and (
          msg.prive = false
          or msg.auteur_id = auth.uid()
          or msg.destinataire_id = auth.uid()
        )
    )
  );

-- Ajout : MA réaction, sur un message que je peux lire.
create policy "clubs_reactions_insert_own" on public.clubs_reactions
  for insert with check (
    utilisateur_id = auth.uid()
    and exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_reactions.club_id
        and m.utilisateur_id = auth.uid()
    )
    and exists (
      select 1
      from public.clubs_messages msg
      join public.clubs_membres moi
        on moi.club_id = msg.club_id and moi.utilisateur_id = auth.uid()
      where msg.id = clubs_reactions.message_id
        and msg.club_id = clubs_reactions.club_id
        and (msg.chapitre_max = 0 or moi.position_lecture >= msg.chapitre_max)
        and (
          msg.prive = false
          or msg.auteur_id = auth.uid()
          or msg.destinataire_id = auth.uid()
        )
    )
  );

-- Retrait : mes réactions seulement.
create policy "clubs_reactions_delete_own" on public.clubs_reactions
  for delete using (utilisateur_id = auth.uid());

-- PostgREST doit recharger le schéma pour exposer clubs_reactions.
notify pgrst, 'reload schema';
