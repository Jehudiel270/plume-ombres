-- ============================================================
-- Plume d'Ombres — Abonnement Premium et paiement (P0.9).
--
-- Idempotente : réappliquable sans erreur (create ... if not exists,
-- create or replace, drop policy if exists, seeds en upsert).
--
-- Contenu :
--   * public.plans_abonnement       — catalogue (gratuit / premium) ;
--   * public.abonnements            — ÉTAT COURANT par compte ;
--   * public.abonnements_historique — HISTORISATION (chaque événement) ;
--   * public.paiements              — traces de paiement (FedaPay…) ;
--   * public.administrateurs        — liste blanche des admins ;
--   * public.est_premium / public.limite_abonnement — avantages ;
--   * public.activer_abonnement / public.resilier_abonnement (RPC
--     SECURITY DEFINER, écritures contrôlées) ;
--   * public.attribuer_abonnement / public.revoquer_abonnement — RPC
--     ADMINISTRATEUR (utilisées par le panneau admin d'un autre lot) ;
--   * public.reserver_quota REMPLACÉE pour tenir compte du plan
--     (quota plus élevé pour Premium) SANS changer sa signature ni
--     son comportement quand aucun abonnement n'est actif.
--
-- Sécurité : RLS active partout. Les comptes ne LISENT que leurs
-- propres lignes ; toute écriture d'abonnement passe par les RPC.
-- ============================================================

-- ---------- CATALOGUE DES PLANS ----------
create table if not exists public.plans_abonnement (
  code text primary key,
  nom text not null,
  resume text,
  prix_xof integer not null default 0 check (prix_xof >= 0),
  devise text not null default 'XOF',
  duree_jours integer not null default 0 check (duree_jours >= 0),
  quota_mensuel_caracteres bigint not null default 400000 check (quota_mensuel_caracteres >= 0),
  moteur text not null default 'auto',
  avantages jsonb not null default '[]'::jsonb,
  ordre integer not null default 0,
  actif boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Seed idempotent (upsert). Prix en FRANCS CFA (XOF), indicatifs.
insert into public.plans_abonnement
  (code, nom, resume, prix_xof, devise, duree_jours, quota_mensuel_caracteres, moteur, avantages, ordre)
values
  (
    'gratuit',
    'Gratuit',
    'Offre de lancement : import, traduction, lecture et exports.',
    0, 'XOF', 0, 400000, 'auto',
    '["Import .txt, .md, .pdf (texte) et .epub","Découpage en chapitres et traduction vers le français","Lecture complète, reprise, favoris, recherche","Exports Markdown, Word et PDF"]'::jsonb,
    0
  ),
  (
    'premium_mensuel',
    'Premium — mensuel',
    'Pour traduire plusieurs livres par mois, sans plafond gênant.',
    3000, 'XOF', 30, 3000000, 'gemini',
    '["Quota de traduction élargi (plusieurs livres par mois)","Qualité littéraire supérieure (moteur payant)","Traductions en parallèle et file prioritaire","Glossaire de personnages pour les sagas"]'::jsonb,
    1
  ),
  (
    'premium_annuel',
    'Premium — annuel',
    'Deux mois offerts par rapport au mensuel.',
    30000, 'XOF', 365, 3000000, 'gemini',
    '["Tous les avantages du Premium mensuel","Deux mois offerts sur l’année","Même quota élargi, mois après mois"]'::jsonb,
    2
  )
on conflict (code) do update set
  nom = excluded.nom,
  resume = excluded.resume,
  prix_xof = excluded.prix_xof,
  devise = excluded.devise,
  duree_jours = excluded.duree_jours,
  quota_mensuel_caracteres = excluded.quota_mensuel_caracteres,
  moteur = excluded.moteur,
  avantages = excluded.avantages,
  ordre = excluded.ordre,
  actif = true,
  updated_at = now();

alter table public.plans_abonnement enable row level security;

-- Le catalogue est public en LECTURE.
drop policy if exists "plans_abonnement_select_all" on public.plans_abonnement;
create policy "plans_abonnement_select_all" on public.plans_abonnement
  for select using (true);

-- ---------- ABONNEMENT (état courant) ----------
create table if not exists public.abonnements (
  proprietaire_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null references public.plans_abonnement (code),
  statut text not null default 'inactif'
    check (statut in ('inactif','en_attente','actif','expire','resilie','echec')),
  periode_debut timestamptz,
  periode_fin timestamptz,
  paiement_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abonnements_statut_idx
  on public.abonnements (statut, periode_fin);

alter table public.abonnements enable row level security;

-- Le propriétaire LIT son propre abonnement (aucune écriture directe).
drop policy if exists "abonnements_select_own" on public.abonnements;
create policy "abonnements_select_own" on public.abonnements
  for select using (auth.uid() = proprietaire_id);

-- ---------- HISTORISATION ----------
create table if not exists public.abonnements_historique (
  id bigint generated always as identity primary key,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  plan text not null,
  statut text not null,
  periode_debut timestamptz,
  periode_fin timestamptz,
  paiement_reference text,
  motif text,
  cree_le timestamptz not null default now()
);

create index if not exists abonnements_historique_proprio_idx
  on public.abonnements_historique (proprietaire_id, cree_le desc);

alter table public.abonnements_historique enable row level security;

drop policy if exists "abonnements_historique_select_own" on public.abonnements_historique;
create policy "abonnements_historique_select_own" on public.abonnements_historique
  for select using (auth.uid() = proprietaire_id);

-- ---------- PAIEMENTS ----------
-- La référence `reference` est INTERNE (PLU-…) : on TRACE AVANT
-- d'appeler le fournisseur. `reference_fournisseur` porte l'id de la
-- transaction chez l'agrégateur (ex. FedaPay).
create table if not exists public.paiements (
  reference text primary key,
  reference_fournisseur text,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  plan text not null,
  montant integer not null check (montant >= 0),
  devise text not null default 'XOF',
  telephone text,
  statut text not null default 'en_attente'
    check (statut in ('en_attente','reussi','echoue')),
  fournisseur text,
  url_paiement text,
  operateur text,
  brut jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paiements_proprio_idx
  on public.paiements (proprietaire_id, created_at desc);
create index if not exists paiements_ref_fournisseur_idx
  on public.paiements (reference_fournisseur);

alter table public.paiements enable row level security;

-- Le propriétaire crée UNIQUEMENT des paiements à son nom, les relit
-- et les met à jour (statut recalculé par le webhook).
drop policy if exists "paiements_insert_own" on public.paiements;
create policy "paiements_insert_own" on public.paiements
  for insert with check (auth.uid() = proprietaire_id);

drop policy if exists "paiements_select_own" on public.paiements;
create policy "paiements_select_own" on public.paiements
  for select using (auth.uid() = proprietaire_id);

drop policy if exists "paiements_update_own" on public.paiements;
create policy "paiements_update_own" on public.paiements
  for update using (auth.uid() = proprietaire_id)
  with check (auth.uid() = proprietaire_id);

-- ---------- ADMINISTRATEURS ----------
-- Liste blanche des comptes admin (le panneau admin, construit par un
-- autre lot, lira/écrira cette table en service_role). RLS activée
-- SANS policy : aucun accès direct anon/authenticated ; seule la
-- fonction SECURITY DEFINER public.est_admin la consulte.
create table if not exists public.administrateurs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);

alter table public.administrateurs enable row level security;

-- ============================================================
-- FONCTIONS
-- ============================================================

-- ---------- est_admin ----------
create or replace function public.est_admin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null
     and exists (select 1 from public.administrateurs a where a.user_id = p_user);
$$;

-- ---------- est_premium : abonnement actif et non expiré ----------
create or replace function public.est_premium(p_proprietaire uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.abonnements a
     where a.proprietaire_id = p_proprietaire
       and a.statut = 'actif'
       and a.periode_fin is not null
       and a.periode_fin > now()
  );
$$;

-- ---------- limite_abonnement : quota effectif selon le plan ----------
-- Ne RÉDUIT jamais le plafond de base : un compte sans abonnement
-- actif garde exactement `p_limite` ; un compte Premium prend le plus
-- grand entre `p_limite` et le quota du plan.
create or replace function public.limite_abonnement(
  p_proprietaire uuid,
  p_limite bigint
) returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_quota bigint;
begin
  if p_proprietaire is null then
    return p_limite;
  end if;
  select pl.quota_mensuel_caracteres
    into v_quota
    from public.abonnements a
    join public.plans_abonnement pl on pl.code = a.plan
   where a.proprietaire_id = p_proprietaire
     and a.statut = 'actif'
     and a.periode_fin is not null
     and a.periode_fin > now();
  if v_quota is null then
    return p_limite;
  end if;
  return greatest(coalesce(p_limite, 0), v_quota);
end $$;

-- ---------- activer_abonnement (RPC) ----------
create or replace function public.activer_abonnement(
  p_proprietaire uuid,
  p_plan text,
  p_reference text,
  p_debut timestamptz,
  p_fin timestamptz,
  p_motif text default 'activation'
) returns table (
  proprietaire_id uuid,
  plan text,
  statut text,
  periode_debut timestamptz,
  periode_fin timestamptz,
  paiement_reference text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_maintenant timestamptz := now();
begin
  if p_proprietaire is null then
    raise exception 'activer_abonnement : propriétaire requis';
  end if;
  -- Un compte authentifié ne peut activer QUE son propre abonnement ;
  -- le service_role (webhook serveur) a auth.uid() null et passe.
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'activer_abonnement : propriétaire non autorisé'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans_abonnement pl where pl.code = p_plan) then
    raise exception 'activer_abonnement : plan inconnu %', p_plan;
  end if;

  insert into public.abonnements as a
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, created_at, updated_at)
  values
    (p_proprietaire, p_plan, 'actif', p_debut, p_fin, p_reference, v_maintenant, v_maintenant)
  on conflict (proprietaire_id) do update set
    plan = excluded.plan,
    statut = 'actif',
    periode_debut = excluded.periode_debut,
    periode_fin = excluded.periode_fin,
    paiement_reference = excluded.paiement_reference,
    updated_at = v_maintenant;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, motif)
  values
    (p_proprietaire, p_plan, 'actif', p_debut, p_fin, p_reference, coalesce(p_motif, 'activation'));

  return query
    select a.proprietaire_id, a.plan, a.statut, a.periode_debut, a.periode_fin,
           a.paiement_reference, a.created_at, a.updated_at
      from public.abonnements a
     where a.proprietaire_id = p_proprietaire;
end $$;

-- ---------- resilier_abonnement (RPC, propriétaire) ----------
create or replace function public.resilier_abonnement(
  p_proprietaire uuid,
  p_motif text default 'résiliation demandée'
) returns table (
  proprietaire_id uuid,
  plan text,
  statut text,
  periode_debut timestamptz,
  periode_fin timestamptz,
  paiement_reference text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existant public.abonnements%rowtype;
  v_maintenant timestamptz := now();
begin
  if p_proprietaire is null then
    raise exception 'resilier_abonnement : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'resilier_abonnement : propriétaire non autorisé'
      using errcode = '42501';
  end if;

  select * into v_existant
    from public.abonnements
   where proprietaire_id = p_proprietaire;
  if not found then
    return;
  end if;

  update public.abonnements
     set statut = 'resilie', updated_at = v_maintenant
   where proprietaire_id = p_proprietaire;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, motif)
  values
    (p_proprietaire, v_existant.plan, 'resilie', v_existant.periode_debut,
     v_existant.periode_fin, v_existant.paiement_reference,
     coalesce(p_motif, 'résiliation demandée'));

  return query
    select a.proprietaire_id, a.plan, a.statut, a.periode_debut, a.periode_fin,
           a.paiement_reference, a.created_at, a.updated_at
      from public.abonnements a
     where a.proprietaire_id = p_proprietaire;
end $$;

-- ---------- attribuer_abonnement (RPC ADMINISTRATEUR) ----------
-- Offre `p_duree` jours de Premium à un compte. Idempotente et
-- PROLONGEANTE : si un abonnement actif existe, on prolonge à partir
-- de sa fin ; sinon on part de maintenant. Contrôle du rôle admin
-- DANS la fonction.
create or replace function public.attribuer_abonnement(
  p_user_id uuid,
  p_duree integer default 30,
  p_motif text default 'attribution administrateur'
) returns table (
  proprietaire_id uuid,
  plan text,
  statut text,
  periode_debut timestamptz,
  periode_fin timestamptz,
  paiement_reference text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_maintenant timestamptz := now();
  v_debut timestamptz;
  v_fin timestamptz;
  v_existant public.abonnements%rowtype;
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'attribuer_abonnement : réservé aux administrateurs'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'attribuer_abonnement : compte requis';
  end if;
  if p_duree is null or p_duree <= 0 then
    raise exception 'attribuer_abonnement : durée invalide (%)', p_duree;
  end if;

  select * into v_existant
    from public.abonnements
   where proprietaire_id = p_user_id;

  if found and v_existant.statut = 'actif'
     and v_existant.periode_fin is not null
     and v_existant.periode_fin > v_maintenant then
    v_debut := v_existant.periode_fin; -- prolongation
  else
    v_debut := v_maintenant;
  end if;
  v_fin := v_debut + make_interval(days => p_duree);

  insert into public.abonnements as a
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, created_at, updated_at)
  values
    (p_user_id, 'premium_mensuel', 'actif', v_debut, v_fin, null, v_maintenant, v_maintenant)
  on conflict (proprietaire_id) do update set
    plan = excluded.plan,
    statut = 'actif',
    periode_debut = excluded.periode_debut,
    periode_fin = excluded.periode_fin,
    updated_at = v_maintenant;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, motif)
  values
    (p_user_id, 'premium_mensuel', 'actif', v_debut, v_fin,
     coalesce(p_motif, 'attribution administrateur'));

  return query
    select a.proprietaire_id, a.plan, a.statut, a.periode_debut, a.periode_fin,
           a.paiement_reference, a.created_at, a.updated_at
      from public.abonnements a
     where a.proprietaire_id = p_user_id;
end $$;

-- ---------- revoquer_abonnement (RPC ADMINISTRATEUR) ----------
-- Révoque immédiatement le Premium. Idempotente (aucune erreur si
-- aucun abonnement). Contrôle du rôle admin DANS la fonction.
create or replace function public.revoquer_abonnement(
  p_user_id uuid,
  p_motif text default 'révocation administrateur'
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existant public.abonnements%rowtype;
  v_maintenant timestamptz := now();
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'revoquer_abonnement : réservé aux administrateurs'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'revoquer_abonnement : compte requis';
  end if;

  select * into v_existant
    from public.abonnements
   where proprietaire_id = p_user_id;
  if not found then
    return false;
  end if;

  update public.abonnements
     set statut = 'resilie',
         periode_fin = least(coalesce(periode_fin, v_maintenant), v_maintenant),
         updated_at = v_maintenant
   where proprietaire_id = p_user_id;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, motif)
  values
    (p_user_id, v_existant.plan, 'resilie', v_existant.periode_debut,
     v_maintenant, v_existant.paiement_reference,
     coalesce(p_motif, 'révocation administrateur'));

  return true;
end $$;

-- ---------- reserver_quota : PREMIUM-AWARE (remplace l'existante) ----------
-- Signature et sémantique INCHANGÉES : sans abonnement actif, le
-- plafond reçu (p_limite) est appliqué tel quel. Avec un abonnement
-- Premium actif, le plafond effectif est celui du plan
-- (public.limite_abonnement) : c'est le branchement « quota plus
-- élevé », sans toucher à /api/translate ni à lib/quota.ts.
create or replace function public.reserver_quota(
  p_proprietaire uuid,
  p_periode date,
  p_caracteres bigint,
  p_limite bigint
) returns table (
  autorise boolean,
  utilise bigint,
  limite bigint,
  restant bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_utilise bigint;
  v_demande bigint := greatest(coalesce(p_caracteres, 0), 0);
  v_limite bigint := public.limite_abonnement(p_proprietaire, p_limite);
begin
  if p_proprietaire is null then
    raise exception 'reserver_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'reserver_quota : propriétaire non autorisé' using errcode = '42501';
  end if;

  insert into public.usage_mensuel (proprietaire_id, periode, caracteres)
    values (p_proprietaire, p_periode, 0)
    on conflict (proprietaire_id, periode) do nothing;

  select u.caracteres into v_utilise
    from public.usage_mensuel u
   where u.proprietaire_id = p_proprietaire and u.periode = p_periode
   for update;

  if v_utilise + v_demande > v_limite then
    autorise := false;
    utilise := v_utilise;
    limite := v_limite;
    restant := greatest(v_limite - v_utilise, 0);
  else
    update public.usage_mensuel
       set caracteres = caracteres + v_demande,
           updated_at = now()
     where proprietaire_id = p_proprietaire and periode = p_periode;
    v_utilise := v_utilise + v_demande;
    autorise := true;
    utilise := v_utilise;
    limite := v_limite;
    restant := greatest(v_limite - v_utilise, 0);
  end if;
  return next;
end $$;

-- ============================================================
-- PRIVILÈGES
-- (Supabase accorde EXECUTE par défaut : on révoque explicitement puis
--  on accorde à la carte.)
-- ============================================================
revoke all on function public.est_admin(uuid) from public, anon;
grant execute on function public.est_admin(uuid) to authenticated, service_role;

revoke all on function public.est_premium(uuid) from public, anon, authenticated;
grant execute on function public.est_premium(uuid) to service_role;

revoke all on function public.limite_abonnement(uuid, bigint) from public, anon, authenticated;
grant execute on function public.limite_abonnement(uuid, bigint) to service_role;

revoke all on function public.activer_abonnement(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.activer_abonnement(uuid, text, text, timestamptz, timestamptz, text)
  to authenticated, service_role;

revoke all on function public.resilier_abonnement(uuid, text) from public, anon;
grant execute on function public.resilier_abonnement(uuid, text)
  to authenticated, service_role;

revoke all on function public.attribuer_abonnement(uuid, integer, text) from public, anon;
grant execute on function public.attribuer_abonnement(uuid, integer, text)
  to authenticated, service_role;

revoke all on function public.revoquer_abonnement(uuid, text) from public, anon;
grant execute on function public.revoquer_abonnement(uuid, text)
  to authenticated, service_role;

-- reserver_quota : ré-affirme les privilèges (fonction remplacée).
revoke all on function public.reserver_quota(uuid, date, bigint, bigint) from public, anon;
grant execute on function public.reserver_quota(uuid, date, bigint, bigint)
  to authenticated, service_role;

-- ============================================================
-- Pour devenir administrateur (à exécuter une fois par le service_role) :
--   insert into public.administrateurs (user_id)
--   values ('<uuid du compte admin>')
--   on conflict (user_id) do nothing;
-- ============================================================
