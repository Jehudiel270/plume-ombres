-- ============================================================
-- Plume d'Ombres — Supervision du studio (P1.6) et santé machine
-- (P1.7 : prérequis de sauvegarde/restauration).
--
-- Idempotente : réappliquable sans erreur (create table if not
-- exists, create or replace function, drop policy if exists).
--
-- CONTENU :
--   * public.journal_traduction     — journal d'EXPLOITATION de la
--     traduction. Table SANS AUCUNE COLONNE DE CONTENU : ni texte
--     source, ni traduction, ni titre, ni message d'erreur brut.
--     On n'y écrit que des ÉNUMÉRATIONS TECHNIQUES bornées
--     (fournisseur, statut, catégorie), des durées et des volumes.
--   * public.journaliser_traduction — écriture contrôlée
--     (SECURITY DEFINER, auth.uid() obligatoire, valeurs bornées).
--   * public.sante_studio(...)      — tableau de bord ADMIN :
--     AGRÉGATS uniquement (comptages, moyennes, taux), jamais de
--     contenu. Contrôle du rôle DANS la fonction.
--   * public.sante_machine()        — état MACHINE minimal pour un
--     cron externe : des nombres et des booléens, aucun secret.
--
-- RÈGLE DE CONFIDENTIALITÉ (projet) : aucune phrase issue d'un
-- livre ne doit apparaître dans un journal, une métrique ou une
-- page de suivi. Elle est garantie STRUCTURELLEMENT ici : aucune
-- colonne texte libre n'existe, et les seules valeurs textuelles
-- admises sont des identifiants de moteur, de statut et de
-- catégorie d'échec, bornés à 40 caractères.
-- ============================================================

-- ---------- JOURNAL D'EXPLOITATION (AUCUN CONTENU) ----------
create table if not exists public.journal_traduction (
  id bigint generated always as identity primary key,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  -- Identifiant technique du moteur ('libretranslate', 'gemini',
  -- 'google', 'mymemory') — jamais une URL ni une clé.
  fournisseur text not null,
  -- 'succes' = traduction renvoyée ; 'vide' = réponse vide/blanche ;
  -- 'echec' = erreur levée par le moteur.
  statut text not null check (statut in ('succes', 'vide', 'echec')),
  -- Catégorie TECHNIQUE d'échec produite par classerEchec()
  -- (reseau, timeout, quota, http, reponse_invalide, config, erreur).
  categorie text,
  duree_ms integer not null default 0 check (duree_ms >= 0),
  caracteres integer not null default 0 check (caracteres >= 0),
  essais integer not null default 1 check (essais >= 1),
  cree_le timestamptz not null default now()
);

-- Bornes de longueur : une valeur textuelle longue serait le signe
-- d'une fuite de contenu ; on la REFUSE à l'écriture.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'journal_traduction_enums_courts'
       and conrelid = 'public.journal_traduction'::regclass
  ) then
    alter table public.journal_traduction
      add constraint journal_traduction_enums_courts
      check (
        length(fournisseur) between 1 and 40
        and (categorie is null or length(categorie) between 1 and 40)
      );
  end if;
end $$;

create index if not exists journal_traduction_le_idx
  on public.journal_traduction (cree_le desc);
create index if not exists journal_traduction_fournisseur_idx
  on public.journal_traduction (fournisseur, cree_le desc);
create index if not exists journal_traduction_statut_idx
  on public.journal_traduction (statut, cree_le desc);

alter table public.journal_traduction enable row level security;
-- RLS active SANS politique : aucun accès direct anon/authenticated.
-- L'écriture passe par la fonction SECURITY DEFINER ci-dessous ;
-- la lecture agrégée par sante_studio() (SECURITY DEFINER, admin).

-- ---------- ÉCRITURE CONTRÔLÉE ----------
create or replace function public.journaliser_traduction(
  p_fournisseur text,
  p_statut text,
  p_categorie text default null,
  p_duree_ms integer default 0,
  p_caracteres integer default 0,
  p_essais integer default 1
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_proprietaire uuid := auth.uid();
  v_fournisseur text := left(coalesce(nullif(btrim(p_fournisseur), ''), 'inconnu'), 40);
  v_categorie text := nullif(left(coalesce(btrim(p_categorie), ''), 40), '');
  v_statut text := lower(btrim(coalesce(p_statut, '')));
begin
  -- Un appel sans compte authentifié (anon) est refusé.
  if v_proprietaire is null then
    raise exception 'journaliser_traduction : compte requis' using errcode = '42501';
  end if;
  if v_statut not in ('succes', 'vide', 'echec') then
    raise exception 'journaliser_traduction : statut invalide' using errcode = '22023';
  end if;
  if v_statut = 'succes' then
    v_categorie := null; -- un succès n'a pas de catégorie d'échec
  end if;

  insert into public.journal_traduction
    (proprietaire_id, fournisseur, statut, categorie, duree_ms, caracteres, essais)
  values
    (v_proprietaire, v_fournisseur, v_statut, v_categorie,
     greatest(coalesce(p_duree_ms, 0), 0),
     greatest(coalesce(p_caracteres, 0), 0),
     greatest(coalesce(p_essais, 1), 1));
end $$;

revoke all on function public.journaliser_traduction(text, text, text, integer, integer, integer)
  from public, anon;
grant execute on function public.journaliser_traduction(text, text, text, integer, integer, integer)
  to authenticated, service_role;

-- ---------- TABLEAU DE BORD ADMIN (AGRÉGATS, JAMAIS DE CONTENU) ----------
create or replace function public.sante_studio(p_jours integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_jours integer := greatest(least(coalesce(p_jours, 30), 365), 1);
  v_debut timestamptz := now() - make_interval(days => greatest(least(coalesce(p_jours, 30), 365), 1));
  v_chap jsonb;
  v_seg jsonb;
  v_fournisseurs jsonb := '[]'::jsonb;
  v_par_compte jsonb := '[]'::jsonb;
  v_par_plan jsonb := '[]'::jsonb;
  v_erreurs jsonb := '[]'::jsonb;
  v_periode date := date_trunc('month', now())::date;
begin
  -- Contrôle admin DANS la fonction (elle lit sous RLS contournée).
  if not public.est_admin(auth.uid()) then
    raise exception 'sante_studio : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  -- Traductions par état (chapitres). Aucun titre n'est renvoyé.
  select jsonb_build_object(
    'en_cours',  count(*) filter (where statut = 'en_traduction'),
    'termine',   count(*) filter (where statut = 'traduit'),
    'erreur',    count(*) filter (where statut = 'erreur'),
    'a_traduire',count(*) filter (where statut = 'a_traduire'),
    'total',     count(*)
  ) into v_chap
  from public.chapitres;

  -- Segments par état (un segment = une unité de traduction).
  select jsonb_build_object(
    'en_cours',  count(*) filter (where statut = 'en_cours'),
    'fait',      count(*) filter (where statut = 'fait'),
    'erreur',    count(*) filter (where statut = 'erreur'),
    'en_attente',count(*) filter (where statut = 'en_attente'),
    'total',     count(*)
  ) into v_seg
  from public.segments;

  -- Taux d'échec par fournisseur, sur la fenêtre demandée.
  select coalesce(jsonb_agg(jsonb_build_object(
           'fournisseur', t.fournisseur,
           'succes', t.succes,
           'echecs', t.echecs,
           'total', t.total,
           'taux_echec', case when t.total > 0
                              then round(t.echecs::numeric / t.total, 4)
                              else 0 end,
           'duree_moyenne_ms', t.duree_moyenne_ms,
           'caracteres', t.caracteres
         ) order by t.total desc, t.fournisseur), '[]'::jsonb)
    into v_fournisseurs
    from (
      select j.fournisseur,
             count(*) filter (where j.statut = 'succes')::bigint as succes,
             count(*) filter (where j.statut in ('echec', 'vide'))::bigint as echecs,
             count(*)::bigint as total,
             coalesce(round(avg(j.duree_ms) filter (where j.statut = 'succes')), 0)::bigint
               as duree_moyenne_ms,
             coalesce(sum(j.caracteres), 0)::bigint as caracteres
        from public.journal_traduction j
       where j.cree_le >= v_debut
       group by j.fournisseur
    ) t;

  -- Caractères consommés PAR COMPTE sur le mois courant (pseudo + plan).
  select coalesce(jsonb_agg(jsonb_build_object(
           'pseudo', t.pseudo,
           'plan', t.plan,
           'caracteres', t.caracteres
         ) order by t.caracteres desc), '[]'::jsonb)
    into v_par_compte
    from (
      select coalesce(p.pseudo, 'lecteur') as pseudo,
             coalesce(pl.nom, 'Gratuit') as plan,
             sum(u.caracteres)::bigint as caracteres
        from public.usage_mensuel u
        left join public.profiles p on p.id = u.proprietaire_id
        left join public.abonnements a on a.proprietaire_id = u.proprietaire_id
        left join public.plans_abonnement pl on pl.code = a.plan
       where u.periode = v_periode
       group by 1, 2
    ) t;

  -- Caractères consommés PAR PLAN sur le mois courant.
  select coalesce(jsonb_agg(jsonb_build_object(
           'plan', t.plan,
           'comptes', t.comptes,
           'caracteres', t.caracteres
         ) order by t.caracteres desc), '[]'::jsonb)
    into v_par_plan
    from (
      select coalesce(pl.nom, 'Gratuit') as plan,
             count(distinct u.proprietaire_id)::bigint as comptes,
             sum(u.caracteres)::bigint as caracteres
        from public.usage_mensuel u
        left join public.abonnements a on a.proprietaire_id = u.proprietaire_id
        left join public.plans_abonnement pl on pl.code = a.plan
       where u.periode = v_periode
       group by 1
    ) t;

  -- Derniers événements d'erreur : type technique, jamais de message.
  select coalesce(jsonb_agg(jsonb_build_object(
           'quand', e.cree_le,
           'fournisseur', e.fournisseur,
           'categorie', e.categorie,
           'statut', e.statut
         ) order by e.cree_le desc), '[]'::jsonb)
    into v_erreurs
    from (
      select cree_le, fournisseur, categorie, statut
        from public.journal_traduction
       where statut <> 'succes'
       order by cree_le desc
       limit 10
    ) e;

  return jsonb_build_object(
    'genere_le', now(),
    'fenetre_jours', v_jours,
    'traductions', v_chap,
    'segments', v_seg,
    'essais_en_cours', jsonb_build_object(
      'chapitres', v_chap -> 'en_cours',
      'segments', v_seg -> 'en_cours'
    ),
    -- Durées mesurées depuis les HORODATAGES des segments (réels).
    -- Moyenne par chapitre : max-min des updated_at de ses segments
    -- traduits. Moyenne par livre : max-min sur tous ses segments.
    'durees', jsonb_build_object(
      'moyenne_chapitre_s', (
        select round(avg(extract(epoch from (mx - mn)))::numeric, 1)
          from (
            select c.id, max(s.updated_at) as mx, min(s.updated_at) as mn
              from public.chapitres c
              join public.segments s on s.chapitre_id = c.id
             where c.statut = 'traduit' and s.statut = 'fait'
             group by c.id
          ) d
      ),
      'chapitres_mesures', (
        select count(*)::bigint
          from (
            select c.id
              from public.chapitres c
              join public.segments s on s.chapitre_id = c.id
             where c.statut = 'traduit' and s.statut = 'fait'
             group by c.id
          ) d
      ),
      'moyenne_livre_s', (
        select round(avg(extract(epoch from (mx - mn)))::numeric, 1)
          from (
            select l.id, max(s.updated_at) as mx, min(s.updated_at) as mn
              from public.livres l
              join public.chapitres c on c.livre_id = l.id
              join public.segments s on s.chapitre_id = c.id
             where s.statut = 'fait'
             group by l.id
          ) d
      ),
      'livres_mesures', (
        select count(*)::bigint
          from (
            select l.id
              from public.livres l
              join public.chapitres c on c.livre_id = l.id
              join public.segments s on s.chapitre_id = c.id
             where s.statut = 'fait'
             group by l.id
          ) d
      )
    ),
    -- Tailles : on ne renvoie que des LONGUEURS agrégées, jamais le texte.
    'taille', jsonb_build_object(
      'caracteres_moyen_chapitre', (
        select round(avg(tot))::bigint
          from (
            select c.id, sum(length(s.source) + length(s.suite)) as tot
              from public.chapitres c
              join public.segments s on s.chapitre_id = c.id
             group by c.id
          ) t
      ),
      'caracteres_moyen_livre', (
        select round(avg(tot))::bigint
          from (
            select l.id, sum(length(s.source) + length(s.suite)) as tot
              from public.livres l
              join public.chapitres c on c.livre_id = l.id
              join public.segments s on s.chapitre_id = c.id
             group by l.id
          ) t
      ),
      'segments_moyen_chapitre', (
        select round(avg(n)::numeric, 1)
          from (
            select c.id, count(s.id) as n
              from public.chapitres c
              join public.segments s on s.chapitre_id = c.id
             group by c.id
          ) t
      )
    ),
    'fournisseurs', v_fournisseurs,
    'usage_mois', jsonb_build_object(
      'periode', to_char(v_periode, 'YYYY-MM'),
      'total', (
        select coalesce(sum(u.caracteres), 0)::bigint
          from public.usage_mensuel u where u.periode = v_periode
      ),
      'par_plan', v_par_plan,
      'par_compte', v_par_compte
    ),
    'erreurs_recentes', v_erreurs
  );
end $$;

revoke all on function public.sante_studio(integer) from public, anon;
grant execute on function public.sante_studio(integer) to authenticated, service_role;

-- ---------- ÉTAT MACHINE (CRON EXTERNE, AUCUN SECRET/CONTENU) ----------
create or replace function public.sante_machine()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ch_en_cours bigint;
  v_ch_erreur bigint;
  v_seg_en_cours bigint;
  v_seg_erreur bigint;
  v_bloques bigint;
  v_ev_24h bigint;
  v_err_24h bigint;
  v_derniere timestamptz;
begin
  select count(*) filter (where statut = 'en_traduction'),
         count(*) filter (where statut = 'erreur')
    into v_ch_en_cours, v_ch_erreur
    from public.chapitres;

  select count(*) filter (where statut = 'en_cours'),
         count(*) filter (where statut = 'erreur')
    into v_seg_en_cours, v_seg_erreur
    from public.segments;

  -- « File en retard » : des unités en cours dont l'horodatage n'a
  -- pas bougé depuis plus de 15 minutes = travail bloqué/orphelin.
  select count(*)
    into v_bloques
    from public.segments
   where statut = 'en_cours'
     and updated_at < now() - interval '15 minutes';

  select count(*),
         count(*) filter (where statut <> 'succes'),
         max(cree_le)
    into v_ev_24h, v_err_24h, v_derniere
    from public.journal_traduction
   where cree_le >= now() - interval '24 hours';

  return jsonb_build_object(
    'version', 1,
    'chapitres_en_traduction', coalesce(v_ch_en_cours, 0),
    'segments_en_cours', coalesce(v_seg_en_cours, 0),
    'chapitres_erreur', coalesce(v_ch_erreur, 0),
    'segments_erreur', coalesce(v_seg_erreur, 0),
    'bloques_en_cours', coalesce(v_bloques, 0),
    'file_en_retard', coalesce(v_bloques, 0) > 0,
    'evenements_traduction_24h', coalesce(v_ev_24h, 0),
    'erreurs_traduction_24h', coalesce(v_err_24h, 0),
    'derniere_traduction', v_derniere
  );
end $$;

-- sante_machine est la SEULE fonction de supervision ouverte à anon :
-- elle ne renvoie que des nombres et des booléens (aucun secret,
-- aucun contenu, aucune identité).
revoke all on function public.sante_machine() from public;
grant execute on function public.sante_machine() to anon, authenticated, service_role;

-- ---------- COMMENTAIRES DE DOCUMENTATION ----------
comment on table public.journal_traduction is
  'P1.6 : journal d''exploitation de la traduction (moteur, statut, catégorie d''échec, durée, volume). AUCUNE colonne de contenu : la confidentialité est garantie par la structure, pas par une convention.';
comment on function public.sante_studio(integer) is
  'P1.6 : tableau de bord admin — AGRÉGATS seuls (traductions, durées, tailles, taux d''échec par moteur, usage mensuel, erreurs récentes). Réservé aux administrateurs.';
comment on function public.sante_machine() is
  'P1.7 : état machine minimal (base joignable via l''appel, file en retard, erreurs récentes) pour un cron externe. Aucun secret, aucun contenu.';
comment on function public.journaliser_traduction(text, text, text, integer, integer, integer) is
  'P1.6 : écriture contrôlée d''un événement de traduction pour le compte connecté. Valeurs textuelles bornées à 40 caractères.';
