-- ============================================================
-- Plume d'Ombres — RÉSERVOIR DE CLÉS D'API (multi-fournisseurs).
--
-- Remplace la clé unique de `parametres_systeme` par un vrai
-- réservoir géré dans le nouvel onglet « Clés API » du tableau
-- de bord :
--   * PLUSIEURS fournisseurs (gemini, deepseek, openai, openrouter,
--     mistral, autre) ;
--   * PLUSIEURS clés par fournisseur (ex. 3 clés Gemini) ;
--   * SUCCESSION : `position` fixe l'ordre d'essai — si une clé
--     échoue, la suivante prend le relais (cooldown automatique
--     côté application après plusieurs échecs de suite) ;
--   * AFFECTATION PAR ABONNEMENT : `plan_minimal` réserve une clé
--     à un niveau d'abonnement (null = tous les abonnements) ;
--   * la variable d'environnement (ex. GEMINI_API_KEY) garde la
--     priorité : elle est essayée avant le réservoir.
--
-- Principes de sécurité (identiques à parametres_systeme) :
--   * la table n'est JAMAIS lisible par « anon » ni par le
--     navigateur d'un lecteur (RLS : administrateurs uniquement) ;
--     les consommateurs serveur lisent via le rôle service
--     (SUPABASE_SERVICE_ROLE_KEY) qui contourne la RLS ;
--   * la valeur n'est jamais journalisée : le journal note le
--     fournisseur, le libellé et l'affectation, rien d'autre ;
--   * le journal ne trace les écritures QUE si elles viennent
--     d'une session administrateur : les mises à jour automatiques
--     du serveur (cooldown après échec) n'écrivent rien.
--
-- Portage automatique : la clé Gemini collée dans l'ANCIEN panneau
-- (parametres_systeme / cle_api_gemini), si elle existe, est copiée
-- en première position du réservoir — l'ancien panneau reste
-- utilisable comme filet (l'application la lit encore si le
-- réservoir est vide).
--
-- Fichier ADDITIF et IDEMPOTENT (aucun DROP, aucun renommage).
-- ============================================================

create table if not exists public.cles_api (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null
    constraint cles_api_fournisseur_connu
    check (fournisseur in ('gemini', 'deepseek', 'openai', 'openrouter', 'mistral', 'autre')),
  libelle text not null default 'Clé'
    constraint cles_api_libelle_borne check (char_length(libelle) between 1 and 80),
  valeur text not null
    constraint cles_api_valeur_bornee check (char_length(valeur) between 5 and 2000),
  -- Niveau d'abonnement minimal servi par la clé (mêmes niveaux que
  -- les interrupteurs de fonctionnalités). null = tous les abonnés.
  plan_minimal text null
    constraint cles_api_plan_connu check (plan_minimal in ('lecteur', 'passionne', 'illimite')),
  -- Ordre de succession DANS LE FOURNISSEUR : 0 d'abord, puis 1, 2…
  position integer not null default 0,
  actif boolean not null default true,
  -- Cooldown automatique (géré par l'application) : compteur
  -- d'échecs de suite et instant de mise à l'écart.
  echecs_consecutifs integer not null default 0
    constraint cles_api_echecs_bornes check (echecs_consecutifs >= 0),
  suspendue_le timestamptz null,
  derniere_erreur text null
    constraint cles_api_erreur_bornee check (char_length(derniere_erreur) <= 300),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  maj_par uuid null references auth.users (id) on delete set null,
  -- Deux fois la même clé chez un même fournisseur n'a aucun sens :
  -- on l'intercepte dès l'enregistrement.
  constraint cles_api_valeur_unique
    unique (fournisseur, valeur)
);

create index if not exists cles_api_fournisseur_ordre_idx
  on public.cles_api (fournisseur, position, cree_le);

comment on table public.cles_api is
  'Réservoir de clés d''API par fournisseur : succession ordonnée, affectation par abonnement. Lecture réservée aux administrateurs ; le serveur lit via le rôle service.';

alter table public.cles_api enable row level security;

-- Lecture : administrateurs uniquement.
drop policy if exists cles_api_lecture on public.cles_api;
create policy cles_api_lecture on public.cles_api
  for select to authenticated using (public.est_admin());

-- Écriture : administrateurs uniquement (le rôle service contourne
-- la RLS de son côté — c'est lui qui met à jour le cooldown).
drop policy if exists cles_api_ecriture on public.cles_api;
create policy cles_api_ecriture on public.cles_api
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

revoke all on public.cles_api from public, anon;
grant select, insert, update, delete on public.cles_api to authenticated;

-- ------------------------------------------------------------
-- Journal : tracer QUI a collé/retiré une clé, sans jamais écrire
-- la valeur. Les mises à jour automatiques du serveur (cooldown,
-- signaux de réussite — session service, auth.uid() null) ne sont
-- PAS journalisées.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.journal_admin') is not null then
    execute $sql$
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
    $sql$;
    drop trigger if exists tracer_cles_api on public.cles_api;
    create trigger tracer_cles_api
      after insert or update on public.cles_api
      for each row execute function public.tracer_cles_api();
  end if;
end;
$$;

-- ------------------------------------------------------------
-- PORTAGE AUTOMATIQUE de l'ancienne clé unique (parametres_systeme
-- / cle_api_gemini) vers le réservoir, en première position, si :
--   * la table des paramètres existe et porte une clé Gemini ;
--   * la même valeur n'est pas déjà dans le réservoir.
-- Idempotent : relancer ce script ne duplique rien.
-- ------------------------------------------------------------
do $$
declare
  ancienne_valeur text;
begin
  if to_regclass('public.parametres_systeme') is not null
     and (select count(*) from public.cles_api where fournisseur = 'gemini') = 0 then
    select valeur into ancienne_valeur
      from public.parametres_systeme
      where cle = 'cle_api_gemini'
      limit 1;
    if ancienne_valeur is not null then
      insert into public.cles_api (fournisseur, libelle, valeur, plan_minimal, position, actif)
      values ('gemini', 'Clé de l''ancien panneau', ancienne_valeur, null, 0, true)
      on conflict (fournisseur, valeur) do nothing;
    end if;
  end if;
end;
$$;
