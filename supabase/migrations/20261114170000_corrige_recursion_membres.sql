-- ============================================================
-- Correction immédiate : RÉCURSION INFINIE de RLS sur
-- clubs_membres. La policy « clubs_membres_select_club » posée par
-- la migration 20261114160000 lit clubs_membres DANS sa propre
-- clause USING (sous-requête d'adhésion) — PostgreSQL refuse
-- (42P17) et TOUTE lecture des membres échouait en ligne.
--
-- On casse la récursion avec une fonction SECURITY DEFINER (elle
-- lit la table sans RLS) : « appartenir au club » devient un
-- appel d'aide, plus une sous-requête autoréférentielle.
-- ============================================================

create or replace function public.appartient_au_club(club uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.clubs_membres m
    where m.club_id = appartient_au_club.club
      and m.utilisateur_id = auth.uid()
  )
$$;

drop policy if exists "clubs_membres_select_club" on public.clubs_membres;
create policy "clubs_membres_select_club" on public.clubs_membres
  for select using (
    utilisateur_id = auth.uid()
    or public.appartient_au_club(clubs_membres.club_id)
  );

notify pgrst, 'reload schema';
