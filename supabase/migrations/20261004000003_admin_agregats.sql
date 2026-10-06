-- ============================================================
-- Plume d'Ombres — AGRÉGATS ADMINISTRATEUR (panneau /admin, vague W8/W9).
--
-- Fichier ADDITIF et IDEMPOTENT : il ne modifie AUCUNE migration ni
-- aucune fonction existantes. Il ajoute UNIQUEMENT des fonctions
-- SECURITY DEFINER qui répondent à un besoin nouveau du panneau
-- admin et qui, sans elles, seraient impossibles :
--
--   RLS : l'administrateur ne peut pas lire les lignes d'AUTRUI dans
--   abonnements / paiements / credits_* / usage_mensuel (les
--   politiques sont « _select_own »). Or un panneau d'exploitation a
--   besoin d'agrégats (répartition des plans, crédits vendus /
--   consommés, derniers paiements) — JAMAIS de contenu de livre.
--
--   Ces fonctions reproduisent le contrat de public.stats_admin :
--   SECURITY DEFINER, contrôle du rôle DANS la fonction, et elles ne
--   renvoient QUE des comptages, des montants et des métadonnées de
--   paiement. Aucune ne renvoie un texte, un titre ou un identifiant
--   de contenu de livre.
--
-- Contenu :
--   * public.admin_courriels_comptes()      — id ↔ courriel (auth.users),
--     pour la recherche « par pseudo ou courriel » du tableau admin ;
--   * public.admin_stats_abonnements()      — répartition abonnements /
--     crédits / paiements (jsonb agrégé) ;
--   * public.admin_lister_paiements(n)      — derniers paiements (statut,
--     fournisseur, opérateur) avec le pseudo du compte.
--
-- Privilèges : révoqués pour public/anon, accordés à authenticated et
-- service_role — comme stats_admin et admin_lister_comptes.
-- ============================================================

-- ---------- COURRIELS DES COMPTES ----------
-- Le pseudo vit dans public.profiles ; le courriel dans auth.users
-- (inaccessible sous RLS). Cette fonction les rapproche pour que
-- l'administrateur puisse CHERCHER un compte par courriel (support).
-- Elle ne renvoie QUE (id, courriel).
create or replace function public.admin_courriels_comptes()
returns table (id uuid, courriel text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_courriels_comptes : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  return query
    select p.id, coalesce(u.email, '')::text as courriel
      from public.profiles p
      left join auth.users u on u.id = p.id
     order by p.created_at desc;
end $$;

revoke all on function public.admin_courriels_comptes() from public, anon;
grant execute on function public.admin_courriels_comptes() to authenticated, service_role;

-- ---------- AGRÉGATS ABONNEMENTS / CRÉDITS / PAIEMENTS ----------
-- Un SEUL aller-retour pour tout l'écran « exploitation » : des
-- NOMBRES et des libellés de plan/pack, jamais de contenu.
create or replace function public.admin_stats_abonnements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultat jsonb;
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_stats_abonnements : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  v_resultat := jsonb_build_object(
    -- ----- abonnements -----
    'abonnements_total', (select count(*) from public.abonnements),
    'abonnements_actifs', (
      select count(*) from public.abonnements a
       where a.statut = 'actif' and a.periode_fin > now()
    ),
    'abonnements_expires_non_resilies', (
      select count(*) from public.abonnements a
       where a.statut = 'actif' and (a.periode_fin is null or a.periode_fin <= now())
    ),
    'par_plan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'plan', t.plan,
               'nom', t.nom,
               'actifs', t.actifs,
               'expires', t.expires,
               'autres', t.autres,
               'total', t.total)
             order by t.ordre, t.plan)
        from (
          select a.plan,
                 coalesce(pl.nom, a.plan) as nom,
                 coalesce(pl.ordre, 999) as ordre,
                 count(*) filter (where a.statut = 'actif' and a.periode_fin > now()) as actifs,
                 count(*) filter (where a.statut = 'actif'
                                    and (a.periode_fin is null or a.periode_fin <= now())) as expires,
                 count(*) filter (where a.statut <> 'actif') as autres,
                 count(*) as total
            from public.abonnements a
            left join public.plans_abonnement pl on pl.code = a.plan
           group by a.plan, pl.nom, pl.ordre
        ) t
    ), '[]'::jsonb),
    'par_statut', coalesce((
      select jsonb_agg(jsonb_build_object('statut', s.statut, 'total', s.total)
             order by s.total desc, s.statut)
        from (select statut, count(*) as total from public.abonnements group by statut) s
    ), '[]'::jsonb),
    'abonnements_par_mois', coalesce((
      select jsonb_agg(jsonb_build_object('periode', m.periode, 'total', m.total) order by m.periode)
        from (
          select to_char(date_trunc('month', h.cree_le), 'YYYY-MM') as periode,
                 count(*) as total
            from public.abonnements_historique h
           group by date_trunc('month', h.cree_le)
        ) m
    ), '[]'::jsonb),

    -- ----- crédits prépayés -----
    'credits', jsonb_build_object(
      'comptes_avec_solde', (select count(*) from public.credits_traduction where solde > 0),
      'solde_total', (select coalesce(sum(solde), 0) from public.credits_traduction),
      'vendus_total', (select coalesce(sum(caracteres), 0) from public.credits_mouvements),
      'consommes_total', (select coalesce(sum(credits), 0) from public.usage_mensuel),
      'montant_vendu', (select coalesce(sum(montant), 0) from public.credits_mouvements),
      'packs_vendus', (select count(*) from public.credits_mouvements),
      'par_pack', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'pack', m.pack_code,
                 'nom', coalesce(pk.nom, m.pack_code),
                 'quantite', m.quantite,
                 'caracteres', m.caracteres,
                 'montant', m.montant)
               order by m.quantite desc, m.pack_code)
          from (
            select pack_code,
                   count(*) as quantite,
                   coalesce(sum(caracteres), 0) as caracteres,
                   coalesce(sum(montant), 0) as montant
              from public.credits_mouvements
             group by pack_code
          ) m
          left join public.packs_credits pk on pk.code = m.pack_code
      ), '[]'::jsonb)
    ),

    -- ----- paiements -----
    'paiements', jsonb_build_object(
      'total', (select count(*) from public.paiements),
      'montant_reussi', (select coalesce(sum(montant), 0) from public.paiements where statut = 'reussi'),
      'dernier', (select max(created_at) from public.paiements),
      'par_statut', coalesce((
        select jsonb_agg(jsonb_build_object('statut', s.statut, 'total', s.total, 'montant', s.montant)
               order by s.total desc, s.statut)
          from (
            select statut, count(*) as total, coalesce(sum(montant), 0) as montant
              from public.paiements group by statut
          ) s
      ), '[]'::jsonb),
      'par_fournisseur', coalesce((
        select jsonb_agg(jsonb_build_object('fournisseur', f.fournisseur, 'total', f.total)
               order by f.total desc, f.fournisseur)
          from (
            select coalesce(fournisseur, '(inconnu)') as fournisseur, count(*) as total
              from public.paiements group by fournisseur
          ) f
      ), '[]'::jsonb)
    )
  );

  return v_resultat;
end $$;

revoke all on function public.admin_stats_abonnements() from public, anon;
grant execute on function public.admin_stats_abonnements() to authenticated, service_role;

-- ---------- DERNIERS PAIEMENTS ----------
-- Journal court des paiements : référence interne, pseudo du compte,
-- plan, montant, statut, fournisseur et opérateur. AUCUNE donnée de
-- contenu, aucune coordonnée bancaire (le téléphone n'est PAS renvoyé).
create or replace function public.admin_lister_paiements(p_limite integer default 25)
returns table (
  reference text,
  pseudo text,
  plan text,
  montant integer,
  devise text,
  statut text,
  fournisseur text,
  operateur text,
  reference_fournisseur text,
  cree_le timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_lister_paiements : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  return query
    select p.reference,
           coalesce(pr.pseudo, 'lecteur') as pseudo,
           p.plan,
           p.montant,
           p.devise,
           p.statut,
           p.fournisseur,
           p.operateur,
           p.reference_fournisseur,
           p.created_at
      from public.paiements p
      left join public.profiles pr on pr.id = p.proprietaire_id
     order by p.created_at desc
     limit greatest(least(coalesce(p_limite, 25), 200), 1);
end $$;

revoke all on function public.admin_lister_paiements(integer) from public, anon;
grant execute on function public.admin_lister_paiements(integer) to authenticated, service_role;
