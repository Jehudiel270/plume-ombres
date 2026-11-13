-- ============================================================
-- Plume d'Ombres — PARAMÈTRES SYSTÈME (clés d'API côté serveur).
--
-- Chantier post-lancement : la clé du modèle d'aide à la lecture
-- (module 8 — résumé F10, questions F6) peut être collée directement
-- dans le panneau d'administration (/admin/fonctionnalites) au lieu
-- d'une variable d'environnement, pour tester sans redéploiement.
--
-- Principes de sécurité :
--   * la table n'est JAMAIS lisible par « anon » ni par le navigateur
--     d'un lecteur : la clé publique anon est exposée côté client,
--     toute ligne serait donc publique ;
--   * lecture réservée aux administrateurs (public.est_admin()) :
--     une route serveur appelée PAR un administrateur peut lire la
--     clé et appeler le modèle ; un lecteur simple ne peut pas —
--     pour ouvrir le module à tous les abonnés, la variable
--     d'environnement GEMINI_API_KEY reste la voie officielle ;
--   * la valeur n'est jamais journalisée : le journal_admin note le
--     nom du paramètre et la LONGUEUR de la valeur, rien d'autre ;
--   * le serveur préfère toujours la variable d'environnement si elle
--     existe (lib/parametres.ts).
--
-- Fichier ADDITIF et IDEMPOTENT (aucun DROP, aucun renommage).
-- ============================================================

create table if not exists public.parametres_systeme (
  cle text primary key,
  valeur text not null
    constraint parametres_valeur_bornee check (char_length(valeur) between 5 and 2000),
  maj_le timestamptz not null default now(),
  maj_par uuid null references auth.users (id) on delete set null
);

comment on table public.parametres_systeme is
  'Paramètres serveur sensibles (clés d''API). Lecture réservée aux administrateurs ; jamais exposée au navigateur.';

alter table public.parametres_systeme enable row level security;

-- Lecture : administrateurs uniquement. Un lecteur connecté simple
-- ne peut pas lire ces lignes — ni par l''application, ni en appelant
-- directement l''API REST Supabase depuis son navigateur.
drop policy if exists parametres_systeme_lecture on public.parametres_systeme;
create policy parametres_systeme_lecture on public.parametres_systeme
  for select to authenticated using (public.est_admin());

-- Écriture : administrateurs uniquement.
drop policy if exists parametres_systeme_ecriture on public.parametres_systeme;
create policy parametres_systeme_ecriture on public.parametres_systeme
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

revoke all on public.parametres_systeme from public, anon;
grant select, insert, update, delete on public.parametres_systeme to authenticated;

-- ------------------------------------------------------------
-- Journal : tracer QUI a changé QUOI, sans jamais écrire la valeur.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.journal_admin') is not null then
    execute $sql$
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
    $sql$;
    drop trigger if exists tracer_parametres_systeme on public.parametres_systeme;
    create trigger tracer_parametres_systeme
      after insert or update on public.parametres_systeme
      for each row execute function public.tracer_parametres_systeme();
  end if;
end;
$$;
