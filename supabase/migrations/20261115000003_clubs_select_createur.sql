-- ============================================================
-- Correctif : création de club refusée (« Création refusée, réessayez. »).
--
-- CAUSE : la route POST /api/clubs insère le club puis lit son id
-- (PostgREST « return=representation » → RETURNING). La policy
-- SELECT `clubs_select_membre` exigeait d'être DÉJÀ membre, or le
-- créateur ne rejoint le club qu'APRÈS l'insertion : le RETURNING
-- était refusé (42501) et la création échouait systématiquement.
--
-- CORRECTIF : le CREATEUR voit toujours son club (cohérent : il
-- doit le voir même si l'adhésion échoue). Idempotent, additif.
-- ============================================================

drop policy if exists "clubs_select_membre" on public.clubs;
create policy "clubs_select_membre" on public.clubs
  for select to authenticated
  using (
    createur_id = auth.uid()
    or exists (
      select 1 from public.clubs_membres m
      where m.club_id = clubs.id and m.utilisateur_id = auth.uid()
    )
  );
