-- ============================================================
-- Chantier post-lancement — module 9 : XP, rangs et badges (A17)
--
-- Deux tables :
--   • public.lectures_xp : UN enregistrement par (compte, chapitre)
--     — l'XP de DÉCOUVERTE n'est jamais comptée deux fois (UNIQUE).
--     Non punitif : rien ne baisse jamais, aucun classement public.
--   • public.badges_obtenus : badges attribués, un par (compte,
--     code) — UNIQUE. Certains badges « exclusifs » n'obéissent
--     qu'au plan d'abonnement (cosmétique).
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » complète.
-- ============================================================

create table if not exists public.lectures_xp (
  id bigint generated always as identity primary key,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid not null references public.chapitres (id) on delete cascade,
  xp integer not null default 25 check (xp between 1 and 100),
  created_at timestamptz not null default now(),
  unique (utilisateur_id, chapitre_id)
);

create index if not exists lectures_xp_utilisateur_idx
  on public.lectures_xp (utilisateur_id, created_at desc);

alter table public.lectures_xp enable row level security;

drop policy if exists "lectures_xp_select_own" on public.lectures_xp;
create policy "lectures_xp_select_own" on public.lectures_xp
  for select using (utilisateur_id = auth.uid());

drop policy if exists "lectures_xp_insert_own" on public.lectures_xp;
create policy "lectures_xp_insert_own" on public.lectures_xp
  for insert with check (utilisateur_id = auth.uid());

-- ---------- BADGES OBTENUS ----------
create table if not exists public.badges_obtenus (
  id bigint generated always as identity primary key,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  obtenu_le timestamptz not null default now(),
  unique (utilisateur_id, code)
);

alter table public.badges_obtenus enable row level security;

drop policy if exists "badges_obtenus_select_own" on public.badges_obtenus;
create policy "badges_obtenus_select_own" on public.badges_obtenus
  for select using (utilisateur_id = auth.uid());

drop policy if exists "badges_obtenus_insert_own" on public.badges_obtenus;
create policy "badges_obtenus_insert_own" on public.badges_obtenus
  for insert with check (utilisateur_id = auth.uid());
