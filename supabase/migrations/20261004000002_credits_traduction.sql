-- ============================================================
-- Plume d'Ombres — PAY-AS-YOU-GO par crédits prépayés (P0.9+).
--
-- Idempotente : réappliquable sans erreur (create ... if not exists,
-- create or replace, drop policy if exists, seeds en upsert).
--
-- Modèle : AUCUN abonnement mensuel obligatoire. Un compte peut
-- acheter des PACKS DE CRÉDITS (caractères de traduction). Le quota
-- du plan (le cas échéant) est consommé EN PREMIER ; quand il est
-- épuisé, on consomme les CRÉDITS prépayés. Si les crédits ne
-- suffisent pas, la réservation est refusée.
--
-- Contenu :
--   * public.packs_credits       — catalogue des packs (achat unitaire) ;
--   * public.credits_traduction  — SOLDE de crédits par compte ;
--   * public.credits_mouvements  — journal (garant d'IDEMPOTENCE via
--                                  l'unicité de reference_paiement) ;
--   * public.crediter_pack       — RPC idempotente (webhook de succès) ;
--   * public.solde_credits       — RPC de lecture du solde ;
--   * public.reserver_quota      — REMPLACÉE (plan puis crédits) ;
--   * public.liberer_quota       — REMPLACÉE (crédits puis plan).
--
-- Sécurité : RLS active partout. Chaque compte ne LIT que ses
-- propres lignes ; AUCUNE écriture directe (RPC SECURITY DEFINER).
-- ============================================================

-- ---------- CATALOGUE DES PACKS ----------
create table if not exists public.packs_credits (
  code text primary key,
  nom text not null,
  caracteres bigint not null check (caracteres > 0),
  prix_xof integer not null check (prix_xof >= 0),
  devise text not null default 'XOF',
  avantage text,
  ordre integer not null default 0,
  actif boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Seed idempotent (upsert). Prix en FRANCS CFA (XOF), indicatifs.
insert into public.packs_credits
  (code, nom, caracteres, prix_xof, devise, avantage, ordre, actif)
values
  (
    'credits_250',
    'Pack Découverte',
    250000, 500, 'XOF',
    'Un premier roman traduit, sans engagement.',
    10, true
  ),
  (
    'credits_600',
    'Pack Lecteur',
    600000, 1000, 'XOF',
    'Deux à trois romans — le meilleur rapport qualité/prix.',
    11, true
  ),
  (
    'credits_1800',
    'Pack Bibliothèque',
    1800000, 2500, 'XOF',
    'Une saga complète, chapitre après chapitre.',
    12, true
  ),
  (
    'credits_4000',
    'Pack Collection',
    4000000, 5000, 'XOF',
    'Pour les gros lecteurs : jamais à court de caractères.',
    13, true
  )
on conflict (code) do update set
  nom = excluded.nom,
  caracteres = excluded.caracteres,
  prix_xof = excluded.prix_xof,
  devise = excluded.devise,
  avantage = excluded.avantage,
  ordre = excluded.ordre,
  actif = true,
  updated_at = now();

alter table public.packs_credits enable row level security;

-- Catalogue lisible par les comptes connectés.
drop policy if exists "packs_credits_select_all" on public.packs_credits;
create policy "packs_credits_select_all" on public.packs_credits
  for select using (true);

-- ---------- SOLDE DE CRÉDITS (un par compte) ----------
create table if not exists public.credits_traduction (
  proprietaire_id uuid primary key references auth.users (id) on delete cascade,
  solde bigint not null default 0 check (solde >= 0),
  updated_at timestamptz not null default now()
);

alter table public.credits_traduction enable row level security;

-- Le propriétaire LIT son propre solde (aucune écriture directe).
drop policy if exists "credits_traduction_select_own" on public.credits_traduction;
create policy "credits_traduction_select_own" on public.credits_traduction
  for select using (auth.uid() = proprietaire_id);

-- ---------- JOURNAL DES MOUVEMENTS ----------
-- `reference_paiement` UNIQUE = garant d'idempotence : un même
-- paiement ne peut créditer le compte qu'une seule fois.
create table if not exists public.credits_mouvements (
  id bigserial primary key,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  pack_code text,
  caracteres bigint not null,
  montant integer,
  devise text,
  reference_paiement text unique,
  created_at timestamptz not null default now()
);

create index if not exists credits_mouvements_proprio_idx
  on public.credits_mouvements (proprietaire_id, created_at desc);

alter table public.credits_mouvements enable row level security;

drop policy if exists "credits_mouvements_select_own" on public.credits_mouvements;
create policy "credits_mouvements_select_own" on public.credits_mouvements
  for select using (auth.uid() = proprietaire_id);

-- ---------- usure mensuelle : colonne `credits` ----------
-- `caracteres` = quota du plan consommé ; `credits` = crédits prépayés
-- consommés sur la période. Les deux sont rendus par liberer_quota.
alter table public.usage_mensuel
  add column if not exists credits bigint not null default 0 check (credits >= 0);

-- ============================================================
-- FONCTIONS
-- ============================================================

-- ---------- crediter_pack (RPC, IDEMPOTENTE) ----------
-- Crédite `caracteres` du pack au compte et journalise le mouvement.
-- Si `p_reference_paiement` a déjà été traité, ne fait RIEN et
-- renvoie le solde courant. Autorisation : le compte lui-même, ou
-- service_role (auth.uid() null, cas du webhook serveur).
create or replace function public.crediter_pack(
  p_proprietaire uuid,
  p_pack text,
  p_reference_paiement text,
  p_montant integer
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caracteres bigint;
  v_devise text;
  v_solde bigint;
  v_insere integer;
begin
  if p_proprietaire is null then
    raise exception 'crediter_pack : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'crediter_pack : propriétaire non autorisé'
      using errcode = '42501';
  end if;
  if p_reference_paiement is null or p_reference_paiement = '' then
    raise exception 'crediter_pack : référence de paiement requise';
  end if;

  -- Idempotence : le journal est la source de vérité.
  insert into public.credits_mouvements
    (proprietaire_id, pack_code, caracteres, montant, devise, reference_paiement)
  values
    (p_proprietaire, p_pack, 0, p_montant, null, p_reference_paiement)
  on conflict (reference_paiement) do nothing;
  get diagnostics v_insere = row_count;

  if v_insere = 0 then
    -- Déjà traité : aucun crédit ajouté, on renvoie le solde actuel.
    select c.solde into v_solde
      from public.credits_traduction c
     where c.proprietaire_id = p_proprietaire;
    return coalesce(v_solde, 0);
  end if;

  -- Pack valide et actif ?
  select p.caracteres, p.devise
    into v_caracteres, v_devise
    from public.packs_credits p
   where p.code = p_pack and p.actif;
  if v_caracteres is null then
    raise exception 'crediter_pack : pack inconnu ou inactif (%)', p_pack;
  end if;

  -- Complète le mouvement (les colonnes du pack sont désormais connues).
  update public.credits_mouvements
     set caracteres = v_caracteres,
         devise = v_devise
   where reference_paiement = p_reference_paiement;

  insert into public.credits_traduction as c (proprietaire_id, solde, updated_at)
  values (p_proprietaire, v_caracteres, now())
  on conflict (proprietaire_id) do update set
    solde = c.solde + v_caracteres,
    updated_at = now();

  select c.solde into v_solde
    from public.credits_traduction c
   where c.proprietaire_id = p_proprietaire;
  return coalesce(v_solde, 0);
end $$;

-- ---------- solde_credits (RPC, lecture) ----------
create or replace function public.solde_credits(p_proprietaire uuid)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_solde bigint;
begin
  if p_proprietaire is null then
    raise exception 'solde_credits : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'solde_credits : propriétaire non autorisé'
      using errcode = '42501';
  end if;
  select c.solde into v_solde
    from public.credits_traduction c
   where c.proprietaire_id = p_proprietaire;
  return coalesce(v_solde, 0);
end $$;

-- ---------- reserver_quota : PLAN PUIS CRÉDITS (remplace) ----------
-- Signature et table de retour INCHANGÉES (autorise, utilise,
-- limite, restant) : lib/quota.ts n'a rien à changer.
--   * on consomme d'abord le quota du plan (limite_abonnement) ;
--   * le reliquat est pris sur les CRÉDITS prépayés ;
--   * si les crédits ne suffisent pas, autorise = false.
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
  v_caracteres bigint;
  v_credits bigint;
  v_solde bigint;
  v_demande bigint := greatest(coalesce(p_caracteres, 0), 0);
  v_limite bigint := public.limite_abonnement(p_proprietaire, p_limite);
  v_restant_plan bigint;
  v_part_plan bigint;
  v_part_credits bigint;
begin
  if p_proprietaire is null then
    raise exception 'reserver_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'reserver_quota : propriétaire non autorisé' using errcode = '42501';
  end if;

  insert into public.usage_mensuel (proprietaire_id, periode, caracteres, credits)
    values (p_proprietaire, p_periode, 0, 0)
    on conflict (proprietaire_id, periode) do nothing;

  -- Verrou de ligne : sérialise les réservations concurrentes du compte.
  select u.caracteres, u.credits into v_caracteres, v_credits
    from public.usage_mensuel u
   where u.proprietaire_id = p_proprietaire and u.periode = p_periode
   for update;

  v_restant_plan := greatest(v_limite - v_caracteres, 0);
  v_part_plan := least(v_demande, v_restant_plan);
  v_part_credits := v_demande - v_part_plan;

  -- Le reliquat doit être couvert par les crédits prépayés.
  if v_part_credits > 0 then
    select c.solde into v_solde
      from public.credits_traduction c
     where c.proprietaire_id = p_proprietaire
     for update;
    if coalesce(v_solde, 0) < v_part_credits then
      autorise := false;
      utilise := v_caracteres;
      limite := v_limite;
      restant := v_restant_plan;
      return next;
      return;
    end if;
  end if;

  update public.usage_mensuel
     set caracteres = caracteres + v_part_plan,
         credits = credits + v_part_credits,
         updated_at = now()
   where proprietaire_id = p_proprietaire and periode = p_periode;

  if v_part_credits > 0 then
    update public.credits_traduction
       set solde = solde - v_part_credits,
           updated_at = now()
     where proprietaire_id = p_proprietaire;
  end if;

  autorise := true;
  utilise := v_caracteres + v_part_plan;
  limite := v_limite;
  restant := greatest(v_limite - (v_caracteres + v_part_plan), 0);
  return next;
end $$;

-- ---------- liberer_quota : CRÉDITS PUIS PLAN (remplace) ----------
-- Rend une réservation : on rend D'ABORD les crédits consommés du
-- mois (et on ré-incrémente le solde), PUIS le quota du plan.
create or replace function public.liberer_quota(
  p_proprietaire uuid,
  p_periode date,
  p_caracteres bigint
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_liberes bigint := greatest(coalesce(p_caracteres, 0), 0);
  v_caracteres bigint;
  v_credits bigint;
  v_rendus_credits bigint;
  v_rendus_plan bigint;
begin
  if p_proprietaire is null then
    raise exception 'liberer_quota : propriétaire requis';
  end if;
  if auth.uid() is not null and p_proprietaire <> auth.uid() then
    raise exception 'liberer_quota : propriétaire non autorisé' using errcode = '42501';
  end if;

  select u.caracteres, u.credits into v_caracteres, v_credits
    from public.usage_mensuel u
   where u.proprietaire_id = p_proprietaire and u.periode = p_periode
   for update;
  if not found then
    return;
  end if;

  v_rendus_credits := least(v_credits, v_liberes);
  v_rendus_plan := v_liberes - v_rendus_credits;

  update public.usage_mensuel
     set caracteres = greatest(v_caracteres - v_rendus_plan, 0),
         credits = v_credits - v_rendus_credits,
         updated_at = now()
   where proprietaire_id = p_proprietaire and periode = p_periode;

  if v_rendus_credits > 0 then
    insert into public.credits_traduction as c (proprietaire_id, solde, updated_at)
    values (p_proprietaire, v_rendus_credits, now())
    on conflict (proprietaire_id) do update set
      solde = c.solde + v_rendus_credits,
      updated_at = now();
  end if;
end $$;

-- ============================================================
-- PRIVILÈGES
-- (Supabase accorde EXECUTE par défaut : on révoque explicitement,
--  puis on accorde à la carte — jamais anon.)
-- ============================================================

-- Tables : lecture seule côté client (RLS restreint aux lignes du compte).
revoke all on table public.packs_credits from public, anon, authenticated;
grant select on table public.packs_credits to authenticated;

revoke all on table public.credits_traduction from public, anon, authenticated;
grant select on table public.credits_traduction to authenticated;

revoke all on table public.credits_mouvements from public, anon, authenticated;
grant select on table public.credits_mouvements to authenticated;

revoke all on table public.packs_credits from service_role;
grant select, insert, update, delete on table public.packs_credits to service_role;
revoke all on table public.credits_traduction from service_role;
grant select, insert, update, delete on table public.credits_traduction to service_role;
revoke all on table public.credits_mouvements from service_role;
grant select, insert, update, delete on table public.credits_mouvements to service_role;

-- Fonctions : authenticated + service_role uniquement.
revoke all on function public.crediter_pack(uuid, text, text, integer) from public, anon;
grant execute on function public.crediter_pack(uuid, text, text, integer)
  to authenticated, service_role;

revoke all on function public.solde_credits(uuid) from public, anon;
grant execute on function public.solde_credits(uuid)
  to authenticated, service_role;

-- reserver_quota / liberer_quota : ré-affirme les privilèges (remplacées).
revoke all on function public.reserver_quota(uuid, date, bigint, bigint) from public, anon;
grant execute on function public.reserver_quota(uuid, date, bigint, bigint)
  to authenticated, service_role;

revoke all on function public.liberer_quota(uuid, date, bigint) from public, anon;
grant execute on function public.liberer_quota(uuid, date, bigint)
  to authenticated, service_role;
