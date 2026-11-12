-- ============================================================
-- Plume d'Ombres — ÉTATS DES INTERRUPTEURS DE FONCTIONNALITÉS.
--
-- Chantier post-lancement (module 1) : chaque nouveau module
-- (théories, graphe, clubs…) est livré ÉTEINT et ne s'ouvre que si
-- l'administrateur l'a ouvert dans /admin/fonctionnalites.
--
-- Principes (brief BRIEF-HERMES, conservés) :
--   * le registre TypeScript (lib/fonctionnalites/registre.ts) est
--     la source de vérité des DÉFINITIONS ; cette table ne stocke
--     que les ÉTATS choisis (actif, plan minimal, déploiement,
--     confirmation juriste) ;
--   * absence de ligne = défaut du registre (tout est éteint en
--     production) ;
--   * lecture possible par tout compte authentifié (les états ne
--     contiennent rien de sensible) ; écriture réservée aux
--     administrateurs (public.est_admin()) ;
--   * journalisation dans journal_admin si la table existe.
--
-- Fichier ADDITIF et IDEMPOTENT (aucun DROP, aucun renommage).
-- ============================================================

create table if not exists public.fonctionnalites_etats (
  cle text primary key,
  actif boolean not null default false,
  plan_minimal text null,
  deploiement integer not null default 100
    constraint fonctionnalites_deploiement_borne check (deploiement between 0 and 100),
  juriste_ok boolean not null default false,
  maj_le timestamptz not null default now(),
  maj_par uuid null references auth.users (id) on delete set null,
  constraint fonctionnalites_plans_connus check (
    plan_minimal is null
    or plan_minimal in ('gratuit', 'lecteur', 'passionne', 'illimite')
  )
);

comment on table public.fonctionnalites_etats is
  'États des interrupteurs de fonctionnalités. Absence de ligne = défaut du registre (éteint en production).';

alter table public.fonctionnalites_etats enable row level security;

-- Lecture ouverte (anon + authentifié) : la barrière du proxy lit les
-- états avec la clé publique, AVANT toute session. Ces lignes ne
-- contiennent que la configuration des modules — rien de sensible.
-- Écriture réservée aux administrateurs (public.est_admin()).
drop policy if exists fonctionnalites_etats_lecture on public.fonctionnalites_etats;
create policy fonctionnalites_etats_lecture on public.fonctionnalites_etats
  for select to anon, authenticated using (true);

drop policy if exists fonctionnalites_etats_ecriture on public.fonctionnalites_etats;
create policy fonctionnalites_etats_ecriture on public.fonctionnalites_etats
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

revoke all on public.fonctionnalites_etats from public;
grant select on public.fonctionnalites_etats to anon, authenticated;
grant insert, update, delete on public.fonctionnalites_etats to authenticated;

-- ------------------------------------------------------------
-- Journal : tracer qui a changé quoi (même table que les autres
-- actions d'administration, si elle existe).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.journal_admin') is not null then
    execute $sql$
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
    $sql$;
    drop trigger if exists tracer_fonctionnalites_etats on public.fonctionnalites_etats;
    create trigger tracer_fonctionnalites_etats
      after insert or update on public.fonctionnalites_etats
      for each row execute function public.tracer_fonctionnalites_etats();
  end if;
end;
$$;
