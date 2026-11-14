-- ============================================================
-- Chantier « clubs : discussion complète » (F11 v4) + fiche
-- d'ambiance RICHE (F5 v2).
--
-- Reprend l'intégralité du cahier initial du zip, resté hors du
-- site jusqu'ici :
--   1. RÔLES dans les clubs : admin / moderateur / membre (le
--      créateur devient admin, implicitement et explicitement) ;
--   2. PROGRAMME DE LECTURE PAR ÉTAPES (clubs_etapes) : 4 chapitres
--      par semaine, avec focus, déverrouillées étape par étape par
--      le staff — le plafond de discussion suit l'étape ouverte ;
--   3. SONDAGES (clubs_sondages + options + votes) : un vote par
--      membre (garanti par clé primaire), résultats après vote ;
--   4. RENCONTRES (clubs_rencontres + participants) : en ligne ou
--      salon écrit, avec participation « je participe » ;
--   5. FILE DE MODÉRATION (clubs_signalements + clubs_messages.masque)
--      : signalement avec motif, traitement par le staff (conserver
--      ou masquer), les messages masqués restent invisibles.
--
-- Et pour l'ambiance (F5 v2), colonnes riches d'une fiche :
--   palette nommée (5 couleurs), atmosphere, ton, rythme (niveau
--   1 → 5 + libellé), promesses sans spoiler, playlist nommée
--   (pistes : titre, humeur, minutes), citation d'ouverture du
--   chapitre 1, mots-clés.
--
-- ADDITIVE et IDEMPOTENTE. RLS : adhésion au club ; staff = rôle
-- admin ou moderateur, ou créateur du club.
-- ============================================================

-- ---------- 1. RÔLES DES MEMBRES ----------
alter table public.clubs_membres
  add column if not exists role text not null default 'membre'
  check (role in ('membre', 'moderateur', 'admin'));

-- Le créateur d'un club est admin (clubs existants inclus).
update public.clubs_membres m
set role = 'admin'
from public.clubs c
where c.id = m.club_id and c.createur_id = m.utilisateur_id
  and m.role <> 'admin';

-- ---------- 2. PROGRAMME DE LECTURE PAR ÉTAPES ----------
create table if not exists public.clubs_etapes (
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- 1 = première semaine. Plafond volontaire : 52 semaines.
  numero integer not null check (numero between 1 and 52),
  chapitre_de integer not null check (chapitre_de between 1 and 2000),
  chapitre_a integer not null check (chapitre_a between 1 and 2000),
  -- Fil conducteur de la semaine (« Les alliances se déplacent »…).
  focus text not null default '' check (char_length(focus) <= 160),
  -- null = étape verrouillée ; date = étape ouverte.
  debloque_le timestamptz,
  cree_par uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, numero),
  check (chapitre_a >= chapitre_de)
);

alter table public.clubs_etapes enable row level security;

-- Lecture : membre du club.
drop policy if exists "clubs_etapes_select_membre" on public.clubs_etapes;
create policy "clubs_etapes_select_membre" on public.clubs_etapes
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_etapes.club_id and m.utilisateur_id = auth.uid()
    )
  );

-- Pose du programme : staff seulement.
drop policy if exists "clubs_etapes_insert_staff" on public.clubs_etapes;
create policy "clubs_etapes_insert_staff" on public.clubs_etapes
  for insert with check (
    cree_par = auth.uid()
    and exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_etapes.club_id
      where m.club_id = clubs_etapes.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- Déverrouillage d'une étape : staff (debloque_le passe à now()).
drop policy if exists "clubs_etapes_update_staff" on public.clubs_etapes;
create policy "clubs_etapes_update_staff" on public.clubs_etapes
  for update using (
    exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_etapes.club_id
      where m.club_id = clubs_etapes.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- Refonte du programme : staff.
drop policy if exists "clubs_etapes_delete_staff" on public.clubs_etapes;
create policy "clubs_etapes_delete_staff" on public.clubs_etapes
  for delete using (
    exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_etapes.club_id
      where m.club_id = clubs_etapes.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- ---------- 2bis. LECTURE DES MEMBRES PAR LE CLUB ----------
-- Jusqu'ici un membre ne voyait que SA propre ligne : ni liste des
-- membres, ni rôles, ni modération possibles. Le cahier initial
-- montre la liste des membres à tout le club (le chapitre de chacun
-- sert seulement à caler les discussions).
drop policy if exists "clubs_membres_select_own" on public.clubs_membres;
drop policy if exists "clubs_membres_select_club" on public.clubs_membres;
create policy "clubs_membres_select_club" on public.clubs_membres
  for select using (
    utilisateur_id = auth.uid()
    or exists (
      select 1 from public.clubs_membres moi
      where moi.club_id = clubs_membres.club_id
        and moi.utilisateur_id = auth.uid()
    )
  );

-- ---------- 3. SONDAGES ----------
-- Des restes d'un chantier antérieur (jamais branché au site)
-- traînent en base avec un schéma différent : tables vides, aucun
-- code versionné ne les lit — on repart propre sur le schéma cible.
drop table if exists public.clubs_sondages_votes cascade;
drop table if exists public.clubs_sondages cascade;

create table public.clubs_sondages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  auteur_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 200),
  -- Clôture : à cette date le vote est refusé (l'API contrôle).
  ferme_le timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create index if not exists clubs_sondages_club_idx
  on public.clubs_sondages (club_id, created_at desc);

alter table public.clubs_sondages enable row level security;

drop policy if exists "clubs_sondages_select_membre" on public.clubs_sondages;
create policy "clubs_sondages_select_membre" on public.clubs_sondages
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_sondages.club_id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_sondages_insert_membre" on public.clubs_sondages;
create policy "clubs_sondages_insert_membre" on public.clubs_sondages
  for insert with check (
    auteur_id = auth.uid()
    and exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_sondages.club_id and m.utilisateur_id = auth.uid()
    )
  );

-- Suppression : l'auteur du sondage ou le staff.
drop policy if exists "clubs_sondages_delete_auteur_ou_staff" on public.clubs_sondages;
create policy "clubs_sondages_delete_auteur_ou_staff" on public.clubs_sondages
  for delete using (
    auteur_id = auth.uid()
    or exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_sondages.club_id
      where m.club_id = clubs_sondages.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

create table if not exists public.clubs_sondages_options (
  id uuid primary key default gen_random_uuid(),
  sondage_id uuid not null references public.clubs_sondages (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  position integer not null check (position between 1 and 4),
  unique (sondage_id, position)
);

alter table public.clubs_sondages_options enable row level security;

drop policy if exists "clubs_sondages_options_select_membre" on public.clubs_sondages_options;
create policy "clubs_sondages_options_select_membre" on public.clubs_sondages_options
  for select using (
    exists (
      select 1
      from public.clubs_sondages s
      join public.clubs_membres m on m.club_id = s.club_id
      where s.id = clubs_sondages_options.sondage_id
        and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_sondages_options_insert_auteur" on public.clubs_sondages_options;
create policy "clubs_sondages_options_insert_auteur" on public.clubs_sondages_options
  for insert with check (
    exists (
      select 1 from public.clubs_sondages s
      where s.id = clubs_sondages_options.sondage_id
        and s.auteur_id = auth.uid()
    )
  );

-- UN vote par membre et par sondage (la clé primaire le garantit
-- ATOMIQUEMENT en base — pas de double vote possible).
create table public.clubs_sondages_votes (
  sondage_id uuid not null references public.clubs_sondages (id) on delete cascade,
  option_id uuid not null references public.clubs_sondages_options (id) on delete cascade,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sondage_id, utilisateur_id)
);

alter table public.clubs_sondages_votes enable row level security;

drop policy if exists "clubs_sondages_votes_select_membre" on public.clubs_sondages_votes;
create policy "clubs_sondages_votes_select_membre" on public.clubs_sondages_votes
  for select using (
    exists (
      select 1
      from public.clubs_sondages s
      join public.clubs_membres m on m.club_id = s.club_id
      where s.id = clubs_sondages_votes.sondage_id
        and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_sondages_votes_insert_own" on public.clubs_sondages_votes;
create policy "clubs_sondages_votes_insert_own" on public.clubs_sondages_votes
  for insert with check (
    utilisateur_id = auth.uid()
    and exists (
      select 1
      from public.clubs_sondages s
      join public.clubs_membres m on m.club_id = s.club_id
      where s.id = clubs_sondages_votes.sondage_id
        and m.utilisateur_id = auth.uid()
    )
  );

-- ---------- 4. RENCONTRES ----------
-- (Même nettoyage du chantier antérieur jamais branché.)
drop table if exists public.clubs_rencontres_participants cascade;
drop table if exists public.clubs_rencontres cascade;

create table public.clubs_rencontres (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  auteur_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  prevu_le timestamptz not null,
  -- « en ligne » (appel vocal) ou « salon écrit » (discussion écrite).
  mode text not null check (mode in ('en ligne', 'salon écrit')),
  -- Repère de lecture (« Chapitres 5 à 8 », « Discussion libre »…).
  note_chapitres text check (note_chapitres is null or char_length(note_chapitres) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists clubs_rencontres_club_idx
  on public.clubs_rencontres (club_id, prevu_le);

alter table public.clubs_rencontres enable row level security;

drop policy if exists "clubs_rencontres_select_membre" on public.clubs_rencontres;
create policy "clubs_rencontres_select_membre" on public.clubs_rencontres
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_rencontres.club_id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_rencontres_insert_membre" on public.clubs_rencontres;
create policy "clubs_rencontres_insert_membre" on public.clubs_rencontres
  for insert with check (
    auteur_id = auth.uid()
    and exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_rencontres.club_id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_rencontres_delete_auteur_ou_staff" on public.clubs_rencontres;
create policy "clubs_rencontres_delete_auteur_ou_staff" on public.clubs_rencontres
  for delete using (
    auteur_id = auth.uid()
    or exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_rencontres.club_id
      where m.club_id = clubs_rencontres.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

create table public.clubs_rencontres_participants (
  rencontre_id uuid not null references public.clubs_rencontres (id) on delete cascade,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rencontre_id, utilisateur_id)
);

alter table public.clubs_rencontres_participants enable row level security;

drop policy if exists "clubs_rencontres_participants_select_membre" on public.clubs_rencontres_participants;
create policy "clubs_rencontres_participants_select_membre" on public.clubs_rencontres_participants
  for select using (
    exists (
      select 1
      from public.clubs_rencontres r
      join public.clubs_membres m on m.club_id = r.club_id
      where r.id = clubs_rencontres_participants.rencontre_id
        and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_rencontres_participants_insert_own" on public.clubs_rencontres_participants;
create policy "clubs_rencontres_participants_insert_own" on public.clubs_rencontres_participants
  for insert with check (
    utilisateur_id = auth.uid()
    and exists (
      select 1
      from public.clubs_rencontres r
      join public.clubs_membres m on m.club_id = r.club_id
      where r.id = clubs_rencontres_participants.rencontre_id
        and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_rencontres_participants_delete_own" on public.clubs_rencontres_participants;
create policy "clubs_rencontres_participants_delete_own" on public.clubs_rencontres_participants
  for delete using (utilisateur_id = auth.uid());

-- ---------- 5. FILE DE MODÉRATION ----------
alter table public.clubs_messages
  add column if not exists masque boolean not null default false;

create table if not exists public.clubs_signalements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  message_id bigint not null references public.clubs_messages (id) on delete cascade,
  signalant_id uuid not null references public.profiles (id) on delete cascade,
  motif text not null check (char_length(btrim(motif)) between 1 and 200),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'conserve', 'masque')),
  traite_par uuid references public.profiles (id) on delete set null,
  traite_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clubs_signalements_club_idx
  on public.clubs_signalements (club_id, created_at desc);

alter table public.clubs_signalements enable row level security;

-- Lecture de la file : staff seulement.
drop policy if exists "clubs_signalements_select_staff" on public.clubs_signalements;
create policy "clubs_signalements_select_staff" on public.clubs_signalements
  for select using (
    exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_signalements.club_id
      where m.club_id = clubs_signalements.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- Signaler : tout membre (pas deux fois le même message).
drop policy if exists "clubs_signalements_insert_membre" on public.clubs_signalements;
create policy "clubs_signalements_insert_membre" on public.clubs_signalements
  for insert with check (
    signalant_id = auth.uid()
    and exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_signalements.club_id and m.utilisateur_id = auth.uid()
    )
  );

-- Traiter : staff.
drop policy if exists "clubs_signalements_update_staff" on public.clubs_signalements;
create policy "clubs_signalements_update_staff" on public.clubs_signalements
  for update using (
    exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_signalements.club_id
      where m.club_id = clubs_signalements.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- ---------- 6. MODÉRATION : le staff agit sur les messages ----------
-- Édition des messages : l'auteur (son texte) ou le staff
-- (épinglage, masquage d'un message fautif).
drop policy if exists "clubs_messages_update_auteur_ou_createur" on public.clubs_messages;
drop policy if exists "clubs_messages_update_auteur_ou_staff" on public.clubs_messages;
create policy "clubs_messages_update_auteur_ou_staff" on public.clubs_messages
  for update using (
    auteur_id = auth.uid()
    or exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_messages.club_id
      where m.club_id = clubs_messages.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  )
  with check (
    auteur_id = auth.uid()
    or exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_messages.club_id
      where m.club_id = clubs_messages.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- Suppression : l'auteur ou le staff.
drop policy if exists "clubs_messages_delete_auteur_ou_createur" on public.clubs_messages;
create policy "clubs_messages_delete_auteur_ou_staff" on public.clubs_messages
  for delete using (
    auteur_id = auth.uid()
    or exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_messages.club_id
      where m.club_id = clubs_messages.club_id
        and m.utilisateur_id = auth.uid()
        and (m.role in ('admin', 'moderateur') or c.createur_id = auth.uid())
    )
  );

-- Lecture : un message MASQUÉ n'est visible que du staff (et du
-- créateur) ; les autres membres ne le reçoivent jamais.
drop policy if exists "clubs_messages_select_membre" on public.clubs_messages;
create policy "clubs_messages_select_membre" on public.clubs_messages
  for select using (
    exists (
      select 1
      from public.clubs_membres m
      join public.clubs c on c.id = clubs_messages.club_id
      where m.club_id = clubs_messages.club_id
        and m.utilisateur_id = auth.uid()
    )
    and (
      clubs_messages.prive = false
      or clubs_messages.auteur_id = auth.uid()
      or clubs_messages.destinataire_id = auth.uid()
    )
    and (
      clubs_messages.masque = false
      or clubs_messages.auteur_id = auth.uid()
      or exists (
        select 1
        from public.clubs_membres st
        join public.clubs c2 on c2.id = clubs_messages.club_id
        where st.club_id = clubs_messages.club_id
          and st.utilisateur_id = auth.uid()
          and (st.role in ('admin', 'moderateur') or c2.createur_id = auth.uid())
      )
    )
  );

-- ---------- 7. AMBIANCE RICHE (F5 v2) ----------
alter table public.ambiance_livres
  add column if not exists palette jsonb not null default '[]',
  add column if not exists atmosphere text
    check (atmosphere is null or char_length(atmosphere) <= 280),
  add column if not exists ton text
    check (ton is null or char_length(ton) <= 120),
  add column if not exists rythme_niveau integer
    check (rythme_niveau is null or rythme_niveau between 1 and 5),
  add column if not exists rythme_label text
    check (rythme_label is null or char_length(rythme_label) <= 80),
  add column if not exists promesses text[] not null default '{}',
  add column if not exists playlist_nom text
    check (playlist_nom is null or char_length(playlist_nom) <= 120),
  add column if not exists playlist jsonb not null default '[]',
  add column if not exists citation_ouverture text
    check (citation_ouverture is null or char_length(citation_ouverture) <= 300),
  add column if not exists mots_cles text[] not null default '{}';

-- PostgREST doit exposer les nouvelles tables.
notify pgrst, 'reload schema';
