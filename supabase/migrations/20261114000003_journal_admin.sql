-- ============================================================
-- Plume d'Ombres — JOURNAL D'ADMINISTRATION (journal_admin).
-- 2026-11-14
--
-- Cette table était référencée depuis le 03/11 par quatre
-- déclencheurs de traçabilité (sections admin, interrupteurs,
-- paramètres système, clés d'API) — tous sous garde
-- `to_regclass('public.journal_admin') is not null`, donc tous
-- DORMANTS puisque la table n'avait jamais été créée.
--
-- Cette migration crée la table PUIS recrée les quatre fonctions
-- tracer_* et leurs déclencheurs (définitions identiques aux
-- fichiers d'origine) : la traçabilité devient effective.
--
-- Principes :
--   * AUCUNE clé étrangère vers auth.users (comme admin_actions) :
--     la trace survit à la suppression d'un compte ;
--   * le journal n'écrit JAMAIS de valeur sensible : pour une clé
--     d'API, seulement fournisseur, libellé, longueur, abonnement
--     minimal et position — jamais la clé elle-même ;
--   * RLS activée : lecture réservée aux administrateurs
--     (public.est_admin()) ; AUCUNE policy insert/update/delete :
--     le journal est immuable depuis l'API — il n'est écrit que par
--     les fonctions tracer_* (SECURITY DEFINER) et le rôle service ;
--   * anon : tous droits retirés explicitement (les privilèges par
--     défaut du projet en dotent toute nouvelle table) ;
--   * FICHIER ADDITIF et IDEMPOTENT (create if not exists,
--     create or replace, drop trigger if exists).
-- ============================================================

create table if not exists public.journal_admin (
  id        uuid primary key default gen_random_uuid(),
  admin_id  uuid null,
  cible_id  uuid null,
  action    text not null,
  motif     text not null default '',
  cree_le   timestamptz not null default now()
);

create index if not exists journal_admin_cree_le_idx
  on public.journal_admin (cree_le desc);
create index if not exists journal_admin_action_idx
  on public.journal_admin (action, cree_le desc);
create index if not exists journal_admin_admin_idx
  on public.journal_admin (admin_id, cree_le desc);

comment on table public.journal_admin is
  'Journal d''administration : écrit par les déclencheurs tracer_* (sections admin, interrupteurs, paramètres système, clés d''API). Aucune valeur sensible, aucune clé étrangère (la trace survit aux comptes).';

alter table public.journal_admin enable row level security;

revoke all on public.journal_admin from anon;

drop policy if exists "journal_admin_select_admin" on public.journal_admin;
create policy "journal_admin_select_admin" on public.journal_admin
  for select using (public.est_admin());

-- ============================================================
-- TRACEURS (définitions reprises à l'identique des fichiers
-- 20261103000002, 20261112000001, 20261113000001, 20261113000002)
-- ============================================================

-- 1. Sections autorisées d'un administrateur.
create or replace function public.tracer_sections_admin()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $corps$
  begin
    insert into public.journal_admin (admin_id, cible_id, action, motif)
    values (auth.uid(), new.proprietaire_id, 'sections_admin', array_to_string(new.sections, ','));
    return new;
  end;
  $corps$;

drop trigger if exists tracer_sections_admin on public.admin_sections;
create trigger tracer_sections_admin
  after insert or update on public.admin_sections
  for each row execute function public.tracer_sections_admin();

-- 2. Interrupteurs de fonctionnalités.
create or replace function public.tracer_fonctionnalites_etats()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $corps$
  declare
    v_detail text;
  begin
    v_detail := format(
      '%s : actif=%s, plan=%s, deploiement=%s, juriste_ok=%s',
      new.cle, new.actif, coalesce(new.plan_minimal, '-'),
      new.deploiement, new.juriste_ok
    );
    insert into public.journal_admin (admin_id, cible_id, action, motif)
    values (auth.uid(), null, 'fonctionnalites_etats', v_detail);
    return new;
  end;
  $corps$;

drop trigger if exists tracer_fonctionnalites_etats on public.fonctionnalites_etats;
create trigger tracer_fonctionnalites_etats
  after insert or update on public.fonctionnalites_etats
  for each row execute function public.tracer_fonctionnalites_etats();

-- 3. Paramètres système (jamais la valeur, seulement sa longueur).
create or replace function public.tracer_parametres_systeme()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $corps$
  begin
    insert into public.journal_admin (admin_id, cible_id, action, motif)
    values (
      auth.uid(), null, 'parametres_systeme',
      format('%s : valeur enregistrée (%s caractères)', new.cle, char_length(new.valeur))
    );
    return new;
  end;
  $corps$;

drop trigger if exists tracer_parametres_systeme on public.parametres_systeme;
create trigger tracer_parametres_systeme
  after insert or update on public.parametres_systeme
  for each row execute function public.tracer_parametres_systeme();

-- 4. Clés d'API (fournisseur, libellé, longueur, abonnement, position
--    — jamais la valeur ; n'écrit que pour une action d'admin connecté).
create or replace function public.tracer_cles_api()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $corps$
  begin
    if auth.uid() is not null then
      insert into public.journal_admin (admin_id, cible_id, action, motif)
      values (
        auth.uid(), new.id, 'cles_api',
        format('%s : « %s » (%s caractères), abonnement minimal %s, position %s',
          new.fournisseur, new.libelle, char_length(new.valeur),
          coalesce(new.plan_minimal, 'tous'), new.position)
      );
    end if;
    return new;
  end;
  $corps$;

drop trigger if exists tracer_cles_api on public.cles_api;
create trigger tracer_cles_api
  after insert or update on public.cles_api
  for each row execute function public.tracer_cles_api();
