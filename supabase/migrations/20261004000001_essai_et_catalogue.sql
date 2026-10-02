-- ============================================================
-- Plume d'Ombres — Essai gratuit 7 jours, catalogue FCFA réel et
-- plafonds de livres par plan (W6/paiement-plans).
--
-- Idempotente : réappliquable sans erreur (add column if not exists,
-- create table/index if not exists, create or replace, drop ... if
-- exists, seeds en upsert).
--
-- La traduction tourne EXCLUSIVEMENT sur la chaîne de moteurs GRATUITS
-- (auto-hébergé en premier, secours gratuits) : aucune mention de
-- moteur payant ici, et le nom d'un moteur ne doit jamais apparaître
-- dans l'interface. Les offres se différencient par le VOLUME, la FILE
-- PRIORITAIRE, le PARALLÉLISME, le GLOSSAIRE, les EXPORTS et le groupe.
--
-- Contenu :
--   * public.plans_abonnement — catalogue ÉTENDU (gratuit, essai,
--     lecteur, passionné, illimité, étudiant, groupe, école + alias
--     de compatibilité premium_mensuel / premium_annuel) ;
--   * public.abonnements — colonnes d'essai : essai_fin,
--     essai_livres_utilises, verification_etudiant ;
--   * public.essais_abonnement — REGISTRE anti-abus : 1 essai par
--     e-mail ET par numéro Mobile Money ; le numéro est libéré dès le
--     premier paiement RÉEL (paye_le) ;
--   * public.accorder_essai(...) + trigger sur auth.users ;
--   * public.sceller_essai(...) — lie un numéro Mobile Money, refuse
--     (et révoque) si le numéro est déjà pris par un essai non payé ;
--   * public.basculer_essai_echu(...) — bascule auto vers `gratuit` ;
--   * trigger sur public.livres — plafond de livres par plan
--     (essai : 3 AU TOTAL ; lecteur/étudiant/groupe : 3/mois ;
--     passionné/école : 10/mois ; illimité : sans plafond de livres) ;
--   * public.activer_abonnement(...) — contrat INCHANGÉ, marque en
--     plus l'essai comme payé (libère le numéro Mobile Money).
-- ============================================================

-- ---------- 1. CATALOGUE : nouvelles colonnes ----------
alter table public.plans_abonnement add column if not exists categorie text not null default 'individuel';
alter table public.plans_abonnement add column if not exists livres_mois integer;
alter table public.plans_abonnement add column if not exists traductions_simultanees integer not null default 1;
alter table public.plans_abonnement add column if not exists file_prioritaire boolean not null default false;
alter table public.plans_abonnement add column if not exists glossaire boolean not null default false;
alter table public.plans_abonnement add column if not exists min_personnes integer not null default 1;
alter table public.plans_abonnement add column if not exists par_personne boolean not null default false;
alter table public.plans_abonnement add column if not exists masque boolean not null default false;
alter table public.plans_abonnement add column if not exists alias_de text;
alter table public.plans_abonnement add column if not exists verification_requise boolean not null default false;
alter table public.plans_abonnement add column if not exists usage_raisonnable boolean not null default false;
alter table public.plans_abonnement add column if not exists prix_mensuel_xof integer;

-- ---------- 2. CATALOGUE : seed réel (prix FCFA) ----------
insert into public.plans_abonnement
  (code, nom, resume, prix_xof, prix_mensuel_xof, devise, duree_jours,
   quota_mensuel_caracteres, moteur, avantages, ordre, categorie,
   livres_mois, traductions_simultanees, file_prioritaire, glossaire,
   min_personnes, par_personne, masque, alias_de, verification_requise,
   usage_raisonnable, actif)
values
  (
    'gratuit',
    'Gratuit',
    'Pour lire et traduire un livre par mois, sans carte.',
    0, null, 'XOF', 0, 400000, 'auto',
    '["Environ un livre complet par mois (400 000 caractères)","Import .txt, .md, .pdf (texte) et .epub","Traduction vers le français, lecture complète et reprise","Favoris, recherche et exports Markdown, Word et PDF"]'::jsonb,
    0, 'gratuit', null, 1, false, false, 1, false, false, null, false, false, true
  ),
  (
    'essai',
    'Essai gratuit — 7 jours',
    'Tout le confort du plan Passionné pendant 7 jours, plafonné à 3 livres au total.',
    0, null, 'XOF', 7, 4000000, 'auto',
    '["7 jours offerts, sans carte ni numéro obligatoire","Même confort que le plan Passionné","Plafonné à 3 livres au total (garde-fou de coût)"]'::jsonb,
    1, 'essai', 3, 2, true, true, 1, false, true, null, false, false, true
  ),
  (
    'lecteur_mensuel',
    'Lecteur — mensuel',
    '3 livres par mois, confort de lecture et exports.',
    1500, null, 'XOF', 30, 1200000, 'auto',
    '["3 livres traduits par mois","Confort de lecture complet (polices, thème, reprise)","Exports Markdown, Word et PDF","File normale"]'::jsonb,
    2, 'individuel', 3, 1, false, false, 1, false, false, null, false, false, true
  ),
  (
    'lecteur_annuel',
    'Lecteur — annuel',
    '3 livres par mois, payés à l’année (−20 %).',
    14400, 1200, 'XOF', 365, 1200000, 'auto',
    '["Tous les avantages du plan Lecteur mensuel","14 400 F CFA l’année (au lieu de 18 000)","Soit 1 200 F CFA par mois"]'::jsonb,
    3, 'individuel', 3, 1, false, false, 1, false, false, null, false, false, true
  ),
  (
    'passionne_mensuel',
    'Passionné — mensuel',
    '10 livres par mois, glossaire de personnages et file prioritaire.',
    3500, null, 'XOF', 30, 4000000, 'auto',
    '["10 livres traduits par mois","2 traductions menées en parallèle","File prioritaire quand la file est chargée","Glossaire de personnages pour les sagas"]'::jsonb,
    4, 'individuel', 10, 2, true, true, 1, false, false, null, false, false, true
  ),
  (
    'passionne_annuel',
    'Passionné — annuel',
    '10 livres par mois, payés à l’année (−20 %).',
    33600, 2800, 'XOF', 365, 4000000, 'auto',
    '["Tous les avantages du plan Passionné mensuel","33 600 F CFA l’année (au lieu de 42 000)","Soit 2 800 F CFA par mois"]'::jsonb,
    5, 'individuel', 10, 2, true, true, 1, false, false, null, false, false, true
  ),
  (
    'illimite_mensuel',
    'Illimité — mensuel',
    'Volume illimité sous usage raisonnable, 3 traductions en parallèle et file prioritaire.',
    9000, null, 'XOF', 30, 25000000, 'auto',
    '["Volume illimité, sous usage raisonnable (jusqu’à 25 000 000 caractères par mois)","3 traductions menées en parallèle","File prioritaire quand la file est chargée","Glossaire de personnages"]'::jsonb,
    6, 'individuel', null, 3, true, true, 1, false, false, null, false, true, true
  ),
  (
    'illimite_annuel',
    'Illimité — annuel',
    'Volume illimité sous usage raisonnable, payé à l’année.',
    90000, 7500, 'XOF', 365, 25000000, 'auto',
    '["Tous les avantages du plan Illimité mensuel","90 000 F CFA l’année","Soit 7 500 F CFA par mois"]'::jsonb,
    7, 'individuel', null, 3, true, true, 1, false, false, null, false, true, true
  ),
  (
    'etudiant_mensuel',
    'Étudiant — mensuel',
    '3 livres par mois à tarif réduit — sur justificatif.',
    1200, null, 'XOF', 30, 1200000, 'auto',
    '["3 livres traduits par mois","Confort de lecture complet et exports","Tarif étudiant : vérification du statut requise"]'::jsonb,
    8, 'etudiant', 3, 1, false, false, 1, false, false, null, true, false, true
  ),
  (
    'groupe_mensuel',
    'Groupe — mensuel',
    '2 400 F CFA par personne et par mois, 3 personnes minimum.',
    2400, null, 'XOF', 30, 1200000, 'auto',
    '["2 400 F CFA par personne et par mois","3 personnes minimum (un seul payeur)","3 livres par mois et par personne","Glossaire partagé et file prioritaire"]'::jsonb,
    9, 'groupe', 3, 2, true, true, 3, true, false, null, false, false, true
  ),
  (
    'ecole_annuel',
    'École — annuel',
    '1 800 F CFA par personne et par mois, facturé à l’année (11 personnes minimum).',
    21600, 1800, 'XOF', 365, 4000000, 'auto',
    '["1 800 F CFA par personne et par mois","Facturé annuellement : 21 600 F CFA par personne et par an","11 personnes minimum (un seul payeur)","10 livres par mois et par personne, 3 traductions en parallèle"]'::jsonb,
    10, 'ecole', 10, 3, true, true, 11, true, false, null, false, false, true
  ),
  (
    'premium_mensuel',
    'Premium — mensuel (historique)',
    'Offre historique conservée : même accès qu’un plan Passionné.',
    3000, null, 'XOF', 30, 3000000, 'auto',
    '["Conservé pour l’historique et le panneau d’administration","Accès équivalent à un plan Passionné"]'::jsonb,
    90, 'legacy', 10, 2, true, true, 1, false, true, 'passionne_mensuel', false, false, true
  ),
  (
    'premium_annuel',
    'Premium — annuel (historique)',
    'Offre historique conservée : même accès qu’un plan Passionné annuel.',
    30000, null, 'XOF', 365, 3000000, 'auto',
    '["Conservé pour l’historique et le panneau d’administration","Accès équivalent à un plan Passionné annuel"]'::jsonb,
    91, 'legacy', 10, 2, true, true, 1, false, true, 'passionne_annuel', false, false, true
  )
on conflict (code) do update set
  nom = excluded.nom,
  resume = excluded.resume,
  prix_xof = excluded.prix_xof,
  prix_mensuel_xof = excluded.prix_mensuel_xof,
  devise = excluded.devise,
  duree_jours = excluded.duree_jours,
  quota_mensuel_caracteres = excluded.quota_mensuel_caracteres,
  moteur = excluded.moteur,
  avantages = excluded.avantages,
  ordre = excluded.ordre,
  categorie = excluded.categorie,
  livres_mois = excluded.livres_mois,
  traductions_simultanees = excluded.traductions_simultanees,
  file_prioritaire = excluded.file_prioritaire,
  glossaire = excluded.glossaire,
  min_personnes = excluded.min_personnes,
  par_personne = excluded.par_personne,
  masque = excluded.masque,
  alias_de = excluded.alias_de,
  verification_requise = excluded.verification_requise,
  usage_raisonnable = excluded.usage_raisonnable,
  actif = true,
  updated_at = now();

-- ---------- 3. ABONNEMENTS : colonnes d'essai ----------
alter table public.abonnements add column if not exists essai_fin timestamptz;
alter table public.abonnements add column if not exists essai_livres_utilises integer not null default 0;
alter table public.abonnements add column if not exists verification_etudiant boolean not null default false;

-- ---------- 4. REGISTRE ANTI-ABUS DE L'ESSAI ----------
create table if not exists public.essais_abonnement (
  compte_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  telephone text,
  paye_le timestamptz,
  cree_le timestamptz not null default now()
);

create unique index if not exists essais_abonnement_email_idx
  on public.essais_abonnement (lower(email));
create index if not exists essais_abonnement_tel_idx
  on public.essais_abonnement
     (right(regexp_replace(coalesce(telephone, ''), '\D', '', 'g'), 8));

alter table public.essais_abonnement enable row level security;

drop policy if exists "essais_abonnement_select_own" on public.essais_abonnement;
create policy "essais_abonnement_select_own" on public.essais_abonnement
  for select using (auth.uid() = compte_id);

-- ---------- 5. FONCTIONS ----------

-- ---------- 5a. accorder_essai : attribue l'essai (idempotent) ----------
create or replace function public.accorder_essai(
  p_compte uuid,
  p_email text,
  p_telephone text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tel text := nullif(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g'), '');
  v_suffixe text;
  v_debut timestamptz := now();
  v_fin timestamptz := now() + make_interval(days => 7);
begin
  if p_compte is null then
    raise exception 'accorder_essai : compte requis';
  end if;
  if v_tel is not null and length(v_tel) < 8 then
    v_tel := null;
  end if;
  v_suffixe := case when v_tel is null then null else right(v_tel, 8) end;

  -- Un SEUL essai par compte.
  if exists (select 1 from public.essais_abonnement e where e.compte_id = p_compte) then
    return 'deja';
  end if;

  -- Un SEUL essai par e-mail.
  if p_email is not null and exists (
    select 1 from public.essais_abonnement e where lower(e.email) = lower(p_email)
  ) then
    return 'refuse_email';
  end if;

  -- Un SEUL essai par numéro Mobile Money TANT QU'IL N'A PAS PAYÉ.
  if v_suffixe is not null and exists (
    select 1 from public.essais_abonnement e
     where e.paye_le is null
       and right(regexp_replace(coalesce(e.telephone, ''), '\D', '', 'g'), 8) = v_suffixe
  ) then
    return 'refuse_telephone';
  end if;

  insert into public.essais_abonnement (compte_id, email, telephone)
  values (p_compte, p_email, v_tel)
  on conflict (compte_id) do nothing;

  insert into public.abonnements as a
    (proprietaire_id, plan, statut, periode_debut, periode_fin,
     paiement_reference, essai_fin, essai_livres_utilises, created_at, updated_at)
  values
    (p_compte, 'essai', 'actif', v_debut, v_fin, null, v_fin, 0, v_debut, v_debut)
  on conflict (proprietaire_id) do update set
    plan = 'essai',
    statut = 'actif',
    periode_debut = excluded.periode_debut,
    periode_fin = excluded.periode_fin,
    essai_fin = excluded.essai_fin,
    essai_livres_utilises = 0,
    updated_at = v_debut;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, motif)
  values (p_compte, 'essai', 'actif', v_debut, v_fin, 'essai gratuit 7 jours');

  return 'accorde';
end $$;

-- ---------- 5b. trigger d'inscription : essai automatique ----------
create or replace function public.accorder_essai_inscription()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.accorder_essai(new.id, new.email, null);
  exception when others then
    -- Ne JAMAIS bloquer une inscription pour un souci d'essai.
    raise warning 'essai non attribué pour % : %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists essai_auto_inscription on auth.users;
create trigger essai_auto_inscription
  after insert on auth.users
  for each row execute function public.accorder_essai_inscription();

-- ---------- 5c. sceller_essai : lie un numéro Mobile Money ----------
create or replace function public.sceller_essai(p_telephone text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_tel text := nullif(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g'), '');
  v_suffixe text;
  v_email text;
  v_abo public.abonnements%rowtype;
begin
  if v_uid is null then
    raise exception 'sceller_essai : authentification requise' using errcode = '42501';
  end if;
  if v_tel is null or length(v_tel) < 8 then
    return jsonb_build_object('ok', false, 'code', 'TELEPHONE_INVALIDE');
  end if;
  v_suffixe := right(v_tel, 8);

  select * into v_abo from public.abonnements where proprietaire_id = v_uid;
  if not found
     or v_abo.plan <> 'essai'
     or v_abo.essai_fin is null
     or v_abo.essai_fin <= now()
     or v_abo.statut <> 'actif' then
    return jsonb_build_object('ok', false, 'code', 'SANS_ESSAI');
  end if;

  if exists (
    select 1 from public.essais_abonnement e
     where e.compte_id <> v_uid
       and e.paye_le is null
       and right(regexp_replace(coalesce(e.telephone, ''), '\D', '', 'g'), 8) = v_suffixe
  ) then
    -- Refus : révoque l'essai (bascule en gratuit). Bibliothèque conservée.
    update public.abonnements
       set plan = 'gratuit',
           statut = 'resilie',
           essai_fin = least(coalesce(essai_fin, now()), now()),
           updated_at = now()
     where proprietaire_id = v_uid;

    insert into public.abonnements_historique
      (proprietaire_id, plan, statut, motif)
    values (v_uid, 'gratuit', 'resilie',
            'essai refusé : numéro Mobile Money déjà utilisé');

    return jsonb_build_object('ok', false, 'code', 'ESSAI_TELEPHONE_UTILISE');
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  insert into public.essais_abonnement (compte_id, email, telephone)
  values (v_uid, v_email, v_tel)
  on conflict (compte_id) do update set
    telephone = excluded.telephone,
    email = coalesce(public.essais_abonnement.email, excluded.email);

  return jsonb_build_object('ok', true, 'code', 'OK', 'telephone', v_tel);
end $$;

-- ---------- 5d. basculer_essai_echu : retour automatique au gratuit ----------
create or replace function public.basculer_essai_echu(p_compte uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_abo public.abonnements%rowtype;
begin
  if p_compte is null then
    return false;
  end if;
  if auth.uid() is not null and p_compte <> auth.uid() then
    raise exception 'basculer_essai_echu : propriétaire non autorisé'
      using errcode = '42501';
  end if;

  select * into v_abo from public.abonnements where proprietaire_id = p_compte;
  if not found or v_abo.plan <> 'essai' or v_abo.essai_fin is null
     or v_abo.essai_fin > now() then
    return false;
  end if;

  update public.abonnements
     set plan = 'gratuit', statut = 'expire', updated_at = now()
   where proprietaire_id = p_compte;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, motif)
  values (p_compte, 'gratuit', 'expire', v_abo.periode_debut, v_abo.essai_fin,
          'fin de l''essai gratuit — bibliothèque conservée');

  return true;
end $$;

-- ---------- 5e. trigger livres : plafond de livres par plan ----------
create or replace function public.verifier_livres_autorises()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_abo public.abonnements%rowtype;
  v_plan public.plans_abonnement%rowtype;
  v_utilises integer;
begin
  if new.proprietaire_id is null then
    return new;
  end if;

  select * into v_abo from public.abonnements where proprietaire_id = new.proprietaire_id;
  if not found or v_abo.statut <> 'actif' then
    return new; -- sans abonnement actif : le quota de caractères s'applique
  end if;

  -- ESSAI : plafond de 3 livres AU TOTAL.
  if v_abo.plan = 'essai' and v_abo.essai_fin is not null and v_abo.essai_fin > now() then
    if coalesce(v_abo.essai_livres_utilises, 0) >= 3 then
      raise exception 'ESSAI_LIVRES_EPUISES'
        using errcode = 'P0001',
              hint = 'Les 3 livres de l''essai gratuit sont épuisés.';
    end if;
    update public.abonnements
       set essai_livres_utilises = coalesce(essai_livres_utilises, 0) + 1,
           updated_at = now()
     where proprietaire_id = new.proprietaire_id;
    return new;
  end if;

  -- Abonnement payant échu : aucun plafond de livres (retombe gratuit).
  if v_abo.periode_fin is not null and v_abo.periode_fin <= now() then
    return new;
  end if;

  select * into v_plan from public.plans_abonnement where code = v_abo.plan;
  if not found or v_plan.livres_mois is null then
    return new; -- plan sans plafond de livres (illimité, gratuit…)
  end if;

  select count(*) into v_utilises
    from public.livres l
   where l.proprietaire_id = new.proprietaire_id
     and l.created_at >= coalesce(v_abo.periode_debut, date_trunc('month', now()));

  if v_utilises >= v_plan.livres_mois then
    raise exception 'LIVRES_MOIS_EPUISES'
      using errcode = 'P0001',
            hint = format('Plafond de %s livres atteint pour cette période.',
                          v_plan.livres_mois);
  end if;

  return new;
end $$;

drop trigger if exists livres_plafond_plan on public.livres;
create trigger livres_plafond_plan
  before insert on public.livres
  for each row execute function public.verifier_livres_autorises();

-- ---------- 6. activer_abonnement : marque l'essai comme payé ----------
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
#variable_conflict use_column
declare
  v_maintenant timestamptz := now();
begin
  if p_proprietaire is null then
    raise exception 'activer_abonnement : propriétaire requis';
  end if;
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
    essai_fin = null,
    updated_at = v_maintenant;

  insert into public.abonnements_historique
    (proprietaire_id, plan, statut, periode_debut, periode_fin, paiement_reference, motif)
  values
    (p_proprietaire, p_plan, 'actif', p_debut, p_fin, p_reference, coalesce(p_motif, 'activation'));

  -- Premier paiement RÉEL : le numéro Mobile Money est libéré.
  update public.essais_abonnement e
     set paye_le = coalesce(e.paye_le, v_maintenant),
         telephone = coalesce(
           e.telephone,
           (select pay.telephone from public.paiements pay where pay.reference = p_reference)
         )
   where e.compte_id = p_proprietaire;

  return query
    select a.proprietaire_id, a.plan, a.statut, a.periode_debut, a.periode_fin,
           a.paiement_reference, a.created_at, a.updated_at
      from public.abonnements a
     where a.proprietaire_id = p_proprietaire;
end $$;

-- ============================================================
-- 7. CORRECTIF — ambiguïté « OUT paramètre / colonne »
--
-- Les fonctions ci-dessus déclarent `returns table (proprietaire_id
-- uuid, …)` : leurs paramètres de sortie portent EXACTEMENT le nom de
-- colonnes de public.abonnements. Dans le corps, toute référence NON
-- qualifiée (`where proprietaire_id = …`, `on conflict
-- (proprietaire_id)`) devient alors ambiguë et PostgreSQL échoue à
-- l'exécution :
--     column reference "proprietaire_id" is ambiguous
-- (constaté en base : activer_abonnement, resilier_abonnement,
--  attribuer_abonnement, revoquer_abonnement). Le tunnel de paiement
-- ne pouvait donc JAMAIS activer un abonnement.
--
-- Correctif minimal et sans changement de contrat : `#variable_conflict
-- use_column` en tête de corps — en cas de collision, la COLONNE
-- l'emporte (tous les paramètres portent un préfixe p_/v_, aucune
-- confusion possible). Signatures et valeurs de retour INCHANGÉES.
-- ============================================================

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
#variable_conflict use_column
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
#variable_conflict use_column
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

create or replace function public.revoquer_abonnement(
  p_user_id uuid,
  p_motif text default 'révocation administrateur'
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
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

-- ============================================================
-- PRIVILÈGES
-- ============================================================
revoke all on function public.accorder_essai(uuid, text, text) from public, anon, authenticated;
grant execute on function public.accorder_essai(uuid, text, text) to service_role;

revoke all on function public.sceller_essai(text) from public, anon;
grant execute on function public.sceller_essai(text) to authenticated, service_role;

revoke all on function public.basculer_essai_echu(uuid) from public, anon;
grant execute on function public.basculer_essai_echu(uuid) to authenticated, service_role;

revoke all on function public.activer_abonnement(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.activer_abonnement(uuid, text, text, timestamptz, timestamptz, text)
  to authenticated, service_role;

-- ============================================================
-- Fin. (Registre : 1 essai/e-mail, 1 essai/numéro non payé.)
-- ============================================================
