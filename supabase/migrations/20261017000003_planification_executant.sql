-- ============================================================
-- Planification de l'exécutant de traduction (18/10/2026)
--
-- Vercel Hobby ne peut pas planifier plus d'une fois par jour : on
-- utilise donc pg_cron (déjà installé) + pg_net pour réveiller la route
-- /api/translate/travail toutes les minutes.
--
-- Le secret est stocké dans une table dédiée, lisible seulement par le
-- rôle postgres / service_role : il n'est PAS écrit en dur dans le
-- planning, donc on peut le changer sans reprogrammer.
--
-- Aucun appel réseau n'est émis s'il n'y a AUCUN travail actif : le
-- quota réseau n'est consommé que pendant une traduction.
-- ============================================================

create extension if not exists pg_net;

create table if not exists public.config_executant (
  cle text primary key,
  valeur text not null,
  maj_le timestamptz not null default now()
);

revoke all on public.config_executant from anon, authenticated;
alter table public.config_executant enable row level security;

drop policy if exists config_executant_service on public.config_executant;
create policy config_executant_service on public.config_executant
  for all to service_role using (true) with check (true);

-- Le secret est inséré par le script d'installation (voir README), pas ici.
comment on table public.config_executant is
  'Réglages techniques de l''exécutant de traduction (secret partagé). Non exposé aux clients.';

-- Planning : toutes les minutes, mais l'appel HTTP n'est émis que si un
-- travail est en attente et que son bail est libre ou expiré.
select cron.unschedule('plume-travail-traduction')
where exists (select 1 from cron.job where jobname = 'plume-travail-traduction');

select cron.schedule(
  'plume-travail-traduction',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://plume-ombres.vercel.app/api/translate/travail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-plume-travail', (select valeur from public.config_executant where cle = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.travaux_traduction t
    where t.statut in ('en_attente', 'en_cours')
      and (t.bail_expire_le is null or t.bail_expire_le < now())
  );
  $cron$
);

comment on table public.config_executant is
  'Réglages techniques (secret de l''exécutant). Planification : pg_cron job plume-travail-traduction.';
