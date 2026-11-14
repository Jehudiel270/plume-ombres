-- ============================================================
-- Chantier « Suivis des œuvres + agenda des sorties » (A7/A22,
-- variante atelier du cahier initial).
--
-- Décision de l'administrateur (15/11/2026) sur les quatre écarts
-- restants du cahier initial :
--   * laissés de côté (risque juridique) : avis de lecteurs publics
--     (diffamation, LCEN, droit de réponse) et demandes de retrait
--     (procédure légale de retrait de contenu) ;
--   * rétablis en VARIANTE ATELIER (rien n'est exposé à des tiers) :
--     1. SUIVI DES ŒUVRES — « je suis cette œuvre » posé sur les
--        livres de SON atelier ; un livre d'autrui n'est ni lisible
--        ni suivable (RLS des livres inchangée, contrôle en policy) ;
--     2. CALENDRIER DES SORTIES → AGENDA DES SORTIES RÉELLES du
--        compte : rencontres à venir des clubs où l'on est membre,
--        échéances de défis, traductions terminées. La version du
--        cahier « la plateforme publie des chapitres, accès anticipé
--        pour les abonnés » reste derrière son interrupteur à risque
--        juridique (`calendrier`), ÉTEINT.
--
-- Et pour que « suivre » ait un effet réel : notifications de CLUB
-- (étape ouverte, rencontre proposée, sondage publié) via la RPC
-- `notifier_club` (SECURITY DEFINER, réservée aux membres) et
-- nouveau type de notification 'club' autorisé en base.
--
-- ADDITIVE et IDEMPOTENTE.
-- ============================================================

-- ---------- 1. ŒUVRES SUIVIES ----------
create table if not exists public.suivis_oeuvres (
  utilisateur_id uuid not null
    references auth.users (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (utilisateur_id, livre_id)
);

create index if not exists suivis_oeuvres_livre_idx
  on public.suivis_oeuvres (livre_id);

alter table public.suivis_oeuvres enable row level security;

-- Lecture : MES suivis, et seulement d'un livre à moi (défense en
-- profondeur : les livres sont déjà « own » en RLS).
drop policy if exists "suivis_select_own" on public.suivis_oeuvres;
create policy "suivis_select_own" on public.suivis_oeuvres
  for select using (
    auth.uid() = utilisateur_id
    and exists (
      select 1 from public.livres l
      where l.id = suivis_oeuvres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "suivis_insert_own" on public.suivis_oeuvres;
create policy "suivis_insert_own" on public.suivis_oeuvres
  for insert with check (
    auth.uid() = utilisateur_id
    and exists (
      select 1 from public.livres l
      where l.id = suivis_oeuvres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "suivis_delete_own" on public.suivis_oeuvres;
create policy "suivis_delete_own" on public.suivis_oeuvres
  for delete using (auth.uid() = utilisateur_id);

-- ---------- 2. TYPE DE NOTIFICATION 'club' ----------
-- La contrainte CHECK du 10/10/2026 n'autorisait que
-- info | traduction | paiement | erreur. Les événements de club
-- (étape ouverte, rencontre, sondage) ont leur nature propre.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('info', 'traduction', 'paiement', 'erreur', 'club'));

-- ---------- 3. RPC notifier_club ----------
-- L'application tourne sous la SESSION de l'acteur (pas de clé
-- service role) : la RLS « own » de notifications interdirait de
-- notifier autrui. Cette RPC SECURITY DEFINER fait le travail côté
-- base, et SEULEMENT pour un membre du club, à l'exclusion de
-- l'auteur de l'action.
create or replace function public.notifier_club(
  p_club_id uuid,
  p_titre text,
  p_corps text,
  p_lien text,
  p_exclure uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre integer;
begin
  -- Seul un membre du club peut déclencher l'envoi.
  if auth.uid() is null or not exists (
    select 1 from public.clubs_membres
    where club_id = p_club_id and utilisateur_id = auth.uid()
  ) then
    raise exception 'Seul un membre du club peut notifier ses membres.';
  end if;

  insert into public.notifications
    (proprietaire_id, type, titre, corps, lien)
  select
    m.utilisateur_id,
    'club',
    left(trim(coalesce(p_titre, '')), 200),
    nullif(left(trim(coalesce(p_corps, '')), 2000), ''),
    nullif(left(trim(coalesce(p_lien, '')), 500), '')
  from public.clubs_membres m
  where m.club_id = p_club_id
    and m.utilisateur_id <> coalesce(p_exclure, auth.uid());

  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

revoke all on function public.notifier_club(uuid, text, text, text, uuid)
  from public, anon;
grant execute on function public.notifier_club(uuid, text, text, text, uuid)
  to authenticated;

-- ---------- 4. PostgREST : recharger le schéma ----------
notify pgrst, 'reload schema';
