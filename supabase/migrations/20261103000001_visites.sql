-- ============================================================
-- Plume d'Ombres — MESURE D'AUDIENCE (panneau /admin, onglet Audience).
--
-- Fichier ADDITIF et IDEMPOTENT : aucune table ni fonction existante
-- n'est modifiée.
--
-- Vie privée d'abord. On enregistre UNIQUEMENT :
--   * le chemin de la page (jamais la requête complète ni les filtres) ;
--   * le domaine d'origine du lien (jamais l'URL de provenance entière) ;
--   * une famille d'appareil (mobile / tablette / bureau) ;
--   * un identifiant de session ALÉATOIRE, tiré par le navigateur, non
--     relié à un compte, oublié à la fermeture de l'onglet.
-- On n'enregistre NI adresse IP, NI empreinte de navigateur, NI courriel.
-- Aucun cookie publicitaire, aucun sous-traitant d'analyse.
--
-- Écriture : exclusivement par l'API serveur (clé service_role), route
-- POST /api/track, plafonnée en débit.
-- Lecture : jamais en direct — uniquement par la fonction agrégée
-- public.admin_stats_visites() qui ne renvoie que des comptages.
-- Conservation : 180 jours (purge quotidienne).
-- ============================================================

create table if not exists public.visites (
  id bigserial primary key,
  chemin text not null,
  source text,
  appareil text,
  visiteur text,
  cree_le timestamptz not null default now()
);

create index if not exists visites_cree_le_idx on public.visites (cree_le desc);
create index if not exists visites_visiteur_idx on public.visites (visiteur, cree_le desc);

alter table public.visites enable row level security;

-- Aucune politique : la table est MUETTE pour les clients. Seule la clé
-- service_role (API serveur) écrit, et seules les fonctions ci-dessous
-- lisent, sous contrôle de rôle.
revoke all on public.visites from public, anon, authenticated;

-- ---------- AGRÉGATS POUR LE TABLEAU DE BORD ----------
-- p_jours : profondeur de la fenêtre (1 à 365).
-- Renvoie un jsonb unique pour éviter N allers-retours.
create or replace function public.admin_stats_visites(p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_jours integer := greatest(1, least(coalesce(p_jours, 30), 365));
  v_debut timestamptz := now() - make_interval(days => v_jours - 1);
  resultat jsonb;
begin
  -- Le rôle service_role (clé serveur, jamais exposée au navigateur) est
  -- admis pour les vérifications scriptées et les tâches d'exploitation.
  if auth.role() <> 'service_role' and not public.est_admin(auth.uid()) then
    raise exception 'admin_stats_visites : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  with fenetre as (
    select * from public.visites where cree_le >= v_debut
  ),
  par_jour as (
    select jour::date as jour,
           coalesce(compte.visites, 0) as visites,
           coalesce(compte.uniques, 0) as uniques
      from generate_series(v_debut::date, now()::date, interval '1 day') as jour
      left join (
        select cree_le::date as j,
               count(*) as visites,
               count(distinct visiteur) as uniques
          from fenetre
         group by 1
      ) as compte on compte.j = jour::date
  )
  select jsonb_build_object(
    'jours', v_jours,
    'totaux', jsonb_build_object(
      'visites', (select count(*) from fenetre),
      'uniques', (select count(distinct visiteur) from fenetre),
      'aujourdhui', (select count(*) from fenetre where cree_le::date = now()::date),
      'hier', (select count(*) from fenetre where cree_le::date = now()::date - 1)
    ),
    'parJour', coalesce((
      select jsonb_agg(jsonb_build_object('jour', jour, 'visites', visites, 'uniques', uniques)
                       order by jour)
        from par_jour
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('chemin', chemin, 'visites', visites) order by visites desc)
        from (
          select chemin, count(*) as visites
            from fenetre
           group by chemin
           order by count(*) desc
           limit 10
        ) as p
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'visites', visites) order by visites desc)
        from (
          select coalesce(source, 'direct') as source, count(*) as visites
            from fenetre
           group by 1
           order by count(*) desc
           limit 10
        ) as s
    ), '[]'::jsonb),
    'appareils', coalesce((
      select jsonb_agg(jsonb_build_object('appareil', appareil, 'visites', visites) order by visites desc)
        from (
          select coalesce(appareil, 'inconnu') as appareil, count(*) as visites
            from fenetre
           group by 1
           order by count(*) desc
        ) as a
    ), '[]'::jsonb)
  ) into resultat;

  return resultat;
end $$;

revoke all on function public.admin_stats_visites(integer) from public, anon;
grant execute on function public.admin_stats_visites(integer) to authenticated, service_role;

-- ---------- PURGE (conservation 180 jours) ----------
-- Appelée par la tâche quotidienne. Renvoie le nombre de lignes retirées.
create or replace function public.purger_visites(p_jours integer default 180)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seuil interval := make_interval(days => greatest(1, least(coalesce(p_jours, 180), 3650)));
  v_supprimees integer;
begin
  delete from public.visites where cree_le < now() - v_seuil;
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end $$;

revoke all on function public.purger_visites(integer) from public, anon, authenticated;
grant execute on function public.purger_visites(integer) to service_role;
