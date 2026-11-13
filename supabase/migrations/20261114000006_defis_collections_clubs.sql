-- ============================================================
-- Chantier — pages manquantes des modules : défis (F14),
-- collections personnelles (A14/F22) et clubs privés (F11).
--
-- Trois familles de tables :
--   • public.defis             : objectifs de lecture PERSONNELS,
--     non manipulateurs (aucune punition, aucun classement) ;
--   • public.collections       : listes de livres constituées PAR le
--     lecteur (privées) — la variante atelier des collections ;
--   • public.clubs (+ membres, messages) : clubs PRIVÉS entre
--     comptes inscrits, rejoints par code d'invitation. Aucun texte
--     de chapitre n'est partagé : les messages portent un PLAFOND
--     anti-spoilers (n° de chapitre maximal), appliqué CÔTÉ SERVEUR.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » (clubs : RLS par adhésion).
-- ============================================================

-- ---------- DÉFIS DE LECTURE (F14) ----------
create table if not exists public.defis (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  -- Ce que l'on compte : chapitres lus, livres terminés, jours de lecture.
  genre text not null check (genre in ('chapitres', 'livres', 'jours')),
  cible integer not null check (cible between 1 and 1000),
  livre_id uuid references public.livres (id) on delete cascade,
  -- Échéance optionnelle (date seule, pas d'heure) — une échéance
  -- dépassée N'ENLÈVE RIEN : le défi reste visible, jamais punitif.
  echeance date,
  termine_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists defis_utilisateur_idx
  on public.defis (utilisateur_id, created_at desc);

alter table public.defis enable row level security;

drop policy if exists "defis_select_own" on public.defis;
create policy "defis_select_own" on public.defis
  for select using (utilisateur_id = auth.uid());

drop policy if exists "defis_insert_own" on public.defis;
create policy "defis_insert_own" on public.defis
  for insert with check (utilisateur_id = auth.uid());

drop policy if exists "defis_update_own" on public.defis;
create policy "defis_update_own" on public.defis
  for update using (utilisateur_id = auth.uid());

drop policy if exists "defis_delete_own" on public.defis;
create policy "defis_delete_own" on public.defis
  for delete using (utilisateur_id = auth.uid());

-- ---------- COLLECTIONS PERSONNELLES (A14/F22) ----------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  description text check (description is null or char_length(description) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_proprietaire_idx
  on public.collections (proprietaire_id, created_at desc);

alter table public.collections enable row level security;

drop policy if exists "collections_select_own" on public.collections;
create policy "collections_select_own" on public.collections
  for select using (proprietaire_id = auth.uid());

drop policy if exists "collections_insert_own" on public.collections;
create policy "collections_insert_own" on public.collections
  for insert with check (proprietaire_id = auth.uid());

drop policy if exists "collections_update_own" on public.collections;
create policy "collections_update_own" on public.collections
  for update using (proprietaire_id = auth.uid());

drop policy if exists "collections_delete_own" on public.collections;
create policy "collections_delete_own" on public.collections
  for delete using (proprietaire_id = auth.uid());

create table if not exists public.collections_livres (
  id bigint generated always as identity primary key,
  collection_id uuid not null references public.collections (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  position integer not null default 1 check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (collection_id, livre_id)
);

create index if not exists collections_livres_collection_idx
  on public.collections_livres (collection_id, position);

alter table public.collections_livres enable row level security;

drop policy if exists "collections_livres_select_own" on public.collections_livres;
create policy "collections_livres_select_own" on public.collections_livres
  for select using (
    exists (
      select 1 from public.collections c
      where c.id = collections_livres.collection_id and c.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "collections_livres_insert_own" on public.collections_livres;
create policy "collections_livres_insert_own" on public.collections_livres
  for insert with check (
    exists (
      select 1 from public.collections c
      where c.id = collections_livres.collection_id and c.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "collections_livres_delete_own" on public.collections_livres;
create policy "collections_livres_delete_own" on public.collections_livres
  for delete using (
    exists (
      select 1 from public.collections c
      where c.id = collections_livres.collection_id and c.proprietaire_id = auth.uid()
    )
  );

-- ---------- CLUBS PRIVÉS (F11) ----------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  createur_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 120),
  description text check (description is null or char_length(description) <= 600),
  livre_id uuid references public.livres (id) on delete set null,
  -- Code d'invitation (8 caractères lisibles, sans I/L/O ni 0/1),
  -- unique.
  code_invitation text not null unique check (code_invitation ~ '^[A-HJKMNP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clubs enable row level security;

-- ---------- MEMBRES (créée AVANT les politiques de clubs, qui la
-- référencent) ----------
create table if not exists public.clubs_membres (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  -- Position de lecture DÉCLARÉE par le membre : les messages au-delà
  -- lui sont masqués (anti-spoilers par le serveur, pas par le CSS).
  position_lecture integer not null default 0 check (position_lecture between 0 and 2000),
  rejoins_le timestamptz not null default now(),
  unique (club_id, utilisateur_id)
);

create index if not exists clubs_membres_utilisateur_idx
  on public.clubs_membres (utilisateur_id);

-- Un club se lit par ses MEMBRES (le créateur est membre).
drop policy if exists "clubs_select_membre" on public.clubs;
create policy "clubs_select_membre" on public.clubs
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs.id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_insert_createur" on public.clubs;
create policy "clubs_insert_createur" on public.clubs
  for insert with check (createur_id = auth.uid());

drop policy if exists "clubs_update_createur" on public.clubs;
create policy "clubs_update_createur" on public.clubs
  for update using (createur_id = auth.uid());

drop policy if exists "clubs_delete_createur" on public.clubs;
create policy "clubs_delete_createur" on public.clubs
  for delete using (createur_id = auth.uid());

alter table public.clubs_membres enable row level security;

drop policy if exists "clubs_membres_select_own" on public.clubs_membres;
create policy "clubs_membres_select_own" on public.clubs_membres
  for select using (utilisateur_id = auth.uid());

drop policy if exists "clubs_membres_insert_own" on public.clubs_membres;
create policy "clubs_membres_insert_own" on public.clubs_membres
  for insert with check (utilisateur_id = auth.uid());

drop policy if exists "clubs_membres_update_own" on public.clubs_membres;
create policy "clubs_membres_update_own" on public.clubs_membres
  for update using (utilisateur_id = auth.uid());

drop policy if exists "clubs_membres_delete_own" on public.clubs_membres;
create policy "clubs_membres_delete_own" on public.clubs_membres
  for delete using (utilisateur_id = auth.uid());

create table if not exists public.clubs_messages (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  auteur_id uuid not null references public.profiles (id) on delete cascade,
  contenu text not null check (char_length(btrim(contenu)) between 1 and 2000),
  -- Plafond anti-spoilers : 0 = hors intrigue (aucun masque) ;
  -- n >= 1 = message lié au chapitre n, masqué au-delà.
  chapitre_max integer not null default 0 check (chapitre_max between 0 and 2000),
  -- Signalement (modération minimale) : compteur + horodatage.
  signale boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists clubs_messages_club_idx
  on public.clubs_messages (club_id, created_at desc);

alter table public.clubs_messages enable row level security;

-- Les messages d'un club se lisent par ses membres (le filtrage
-- anti-spoilers fin s'applique dans l'API, côté serveur).
drop policy if exists "clubs_messages_select_membre" on public.clubs_messages;
create policy "clubs_messages_select_membre" on public.clubs_messages
  for select using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_messages.club_id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_messages_insert_membre" on public.clubs_messages;
create policy "clubs_messages_insert_membre" on public.clubs_messages
  for insert with check (
    auteur_id = auth.uid()
    and exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_messages.club_id and m.utilisateur_id = auth.uid()
    )
  );

-- Chaque membre peut uniquement SIGNALER un message (jamais l'éditer).
drop policy if exists "clubs_messages_update_signale" on public.clubs_messages;
create policy "clubs_messages_update_signale" on public.clubs_messages
  for update using (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_messages.club_id and m.utilisateur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs_messages.club_id and m.utilisateur_id = auth.uid()
    )
  );

drop policy if exists "clubs_messages_delete_auteur" on public.clubs_messages;
create policy "clubs_messages_delete_auteur" on public.clubs_messages
  for delete using (auteur_id = auth.uid());
