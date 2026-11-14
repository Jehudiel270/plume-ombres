-- ============================================================
-- Chantier « clubs profonds » (F11 v2) — le salon passe du basic
-- au complet : édition de message (fenêtre 15 min), épinglage,
-- réponses (fils légers), suppression par l'auteur OU le créateur
-- (modération), exclusion de membre par le créateur.
--
-- ADDITIVE et IDEMPOTENTE. Les politiques de clubs_messages sont
-- resserrées : fini le « tout membre peut tout modifier ».
-- ============================================================

-- ---------- NOUVELLES COLONNES DES MESSAGES ----------
alter table public.clubs_messages
  add column if not exists modifie_le timestamptz;

alter table public.clubs_messages
  add column if not exists epingle boolean not null default false;

alter table public.clubs_messages
  add column if not exists reponse_a bigint
  references public.clubs_messages (id) on delete set null;

-- ---------- POLITIQUES RESERRÉES (clubs_messages) ----------
-- Mise à jour : l'AUTEUR édite son texte ; le CRÉATEUR du club
-- épingle / gère les signalements. (Avant : tout membre pouvait
-- tout modifier — trop permissif, corrigé ici.)
drop policy if exists "clubs_messages_update_signale" on public.clubs_messages;
drop policy if exists "clubs_messages_update_auteur_ou_createur" on public.clubs_messages;
create policy "clubs_messages_update_auteur_ou_createur" on public.clubs_messages
  for update using (
    auteur_id = auth.uid()
    or exists (
      select 1 from public.clubs c
      where c.id = clubs_messages.club_id and c.createur_id = auth.uid()
    )
  )
  with check (
    auteur_id = auth.uid()
    or exists (
      select 1 from public.clubs c
      where c.id = clubs_messages.club_id and c.createur_id = auth.uid()
    )
  );

-- Suppression : l'auteur supprime le sien, le créateur module son
-- salon (retrait d'un message fautif).
drop policy if exists "clubs_messages_delete_auteur" on public.clubs_messages;
drop policy if exists "clubs_messages_delete_auteur_ou_createur" on public.clubs_messages;
create policy "clubs_messages_delete_auteur_ou_createur" on public.clubs_messages
  for delete using (
    auteur_id = auth.uid()
    or exists (
      select 1 from public.clubs c
      where c.id = clubs_messages.club_id and c.createur_id = auth.uid()
    )
  );

-- ---------- EXCLUSION D'UN MEMBRE PAR LE CRÉATEUR ----------
-- Jusqu'ici un membre ne pouvait retirer que LUI-MÊME. Le créateur
-- du club peut désormais exclure un membre (jamais lui-même :
-- la règle « le créateur supprime le club entier » prime).
drop policy if exists "clubs_membres_delete_own" on public.clubs_membres;
drop policy if exists "clubs_membres_delete_own_ou_createur" on public.clubs_membres;
create policy "clubs_membres_delete_own_ou_createur" on public.clubs_membres
  for delete using (
    utilisateur_id = auth.uid()
    or exists (
      select 1 from public.clubs c
      where c.id = clubs_membres.club_id and c.createur_id = auth.uid()
    )
  );
