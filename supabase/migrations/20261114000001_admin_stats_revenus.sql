-- ============================================================
-- Plume d'Ombres — INDICATEURS DE REVENUS (vague 2 du tableau de bord).
--
-- Fichier ADDITIF et IDEMPOTENT : aucune table ni fonction existante
-- n'est modifiée. Il ajoute UNE fonction SECURITY DEFINER qui calcule,
-- à partir des tables d'abonnement déjà en place
-- (abonnements, abonnements_historique, paiements, plans_abonnement) :
--
--   * le revenu mensuel récurrent (MRR) en XOF : chaque abonnement
--     ACTIF est ramené au mois (prix du plan × 30 ÷ durée en jours) ;
--   * la répartition des actifs par plan, avec le prix du plan ;
--   * les mouvements des N derniers mois : nouveaux abonnements,
--     sorties (résiliés + expirés), encaissements (paiements réussis) ;
--   * le total encaissé depuis l'origine.
--
-- Sécurité : même contrat que admin_stats_abonnements() — le rôle est
-- contrôlé DANS la fonction, la réponse ne contient QUE des nombres et
-- des libellés de plan (jamais de contenu de livre, jamais de
-- coordonnée personnelle), exécution révoquée pour public/anon.
-- ============================================================

create or replace function public.admin_stats_revenus(p_mois integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mois integer := greatest(1, least(coalesce(p_mois, 6), 24));
  v_resultat jsonb;
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_stats_revenus : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  v_resultat := jsonb_build_object(

    -- ---------- revenu mensuel récurrent (MRR) ----------
    -- Un abonnement actif pèse prix × 30 ÷ durée (annuel ÷ 12 environ).
    -- Les plans sans prix (gratuit) ou hors catalogue pèsent zéro.
    'mrr_xof', coalesce((
      select round(sum(pl.prix_xof * 30.0 / greatest(pl.duree_jours, 1)))
        from public.abonnements a
        join public.plans_abonnement pl on pl.code = a.plan
       where a.statut = 'actif'
         and pl.prix_xof > 0
    ), 0),

    -- ---------- actifs par plan (avec prix) ----------
    'actifs_par_plan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'plan', t.plan,
               'nom', t.nom,
               'prix_xof', t.prix_xof,
               'duree_jours', t.duree_jours,
               'actifs', t.actifs)
             order by t.actifs desc, t.plan)
        from (
          select a.plan,
                 coalesce(pl.nom, a.plan) as nom,
                 coalesce(pl.prix_xof, 0) as prix_xof,
                 coalesce(pl.duree_jours, 0) as duree_jours,
                 count(*) as actifs
            from public.abonnements a
            left join public.plans_abonnement pl on pl.code = a.plan
           where a.statut = 'actif'
           group by a.plan, pl.nom, pl.prix_xof, pl.duree_jours
        ) t
    ), '[]'::jsonb),

    'actifs_total', (
      select count(*) from public.abonnements where statut = 'actif'
    ),

    -- ---------- mouvements des derniers mois ----------
    -- nouveaux : passages à « actif » ; sorties : passages à
    -- « resilie » ou « expire » (historique, un événement par ligne) ;
    -- encaisse : paiements réussis du mois.
    'par_mois', coalesce((
      select jsonb_agg(jsonb_build_object(
               'periode', m.periode,
               'nouveaux', m.nouveaux,
               'sorties', m.sorties,
               'encaisse', m.encaisse,
               'paiements', m.paiements)
             order by m.periode)
        from (
          with serie as (
            select to_char(date_trunc('month', now())
                           - (n || ' month')::interval, 'YYYY-MM') as periode
              from generate_series(v_mois - 1, 0, -1) as n
          ),
          nouveaux as (
            select to_char(date_trunc('month', h.cree_le), 'YYYY-MM') as periode,
                   count(*) as total
              from public.abonnements_historique h
             where h.statut = 'actif'
             group by 1
          ),
          sorties as (
            select to_char(date_trunc('month', h.cree_le), 'YYYY-MM') as periode,
                   count(*) as total
              from public.abonnements_historique h
             where h.statut in ('resilie', 'expire')
             group by 1
          ),
          encaissements as (
            select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as periode,
                   coalesce(sum(p.montant), 0) as montant,
                   count(*) as total
              from public.paiements p
             where p.statut = 'reussi'
             group by 1
          )
          select s.periode,
                 coalesce(n.total, 0) as nouveaux,
                 coalesce(o.total, 0) as sorties,
                 coalesce(e.montant, 0) as encaisse,
                 coalesce(e.total, 0) as paiements
            from serie s
            left join nouveaux n on n.periode = s.periode
            left join sorties o on o.periode = s.periode
            left join encaissements e on e.periode = s.periode
        ) m
    ), '[]'::jsonb),

    -- ---------- depuis l'origine ----------
    'encaisse_total_xof', (
      select coalesce(sum(montant), 0) from public.paiements where statut = 'reussi'
    )
  );

  return v_resultat;
end $$;

revoke all on function public.admin_stats_revenus(integer) from public, anon;
grant execute on function public.admin_stats_revenus(integer) to authenticated, service_role;
