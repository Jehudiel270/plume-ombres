-- ============================================================
-- ESSAI GRATUIT — versionnement du mécanisme d'attribution à l'inscription.
--
-- POURQUOI CETTE MIGRATION EXISTE
-- Le mécanisme complet (table public.essais_abonnement, fonctions
-- public.accorder_essai / public.accorder_essai_inscription et trigger
-- essai_auto_inscription sur auth.users) n'existait QUE dans la base de
-- production : il était ABSENT de toutes les migrations du dépôt. Une
-- base recréée ou clonée (préproduction, test, reprise) perdait donc
-- silencieusement l'essai gratuit de 7 jours / 4 000 000 de caractères
-- sans que rien ne le signale.
--
-- Cette migration ne fait que REPRODUIRE À L'IDENTIQUE ce qui tourne en
-- production (definitions extraites de la base). Elle est idempotente :
-- CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER
-- IF EXISTS avant recréation.
-- ============================================================

create table if not exists public.essais_abonnement (
  compte_id uuid not null,
  email text,
  telephone text,
  paye_le timestamp with time zone,
  cree_le timestamp with time zone not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'essais_abonnement_compte_id_fkey'
                   and conrelid = 'public.essais_abonnement'::regclass) then
    alter table public.essais_abonnement add constraint essais_abonnement_compte_id_fkey FOREIGN KEY (compte_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'essais_abonnement_pkey'
                   and conrelid = 'public.essais_abonnement'::regclass) then
    alter table public.essais_abonnement add constraint essais_abonnement_pkey PRIMARY KEY (compte_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname = 'essais_abonnement_email_idx') then
    CREATE UNIQUE INDEX essais_abonnement_email_idx ON public.essais_abonnement USING btree (lower(email));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname = 'essais_abonnement_tel_idx') then
    CREATE INDEX essais_abonnement_tel_idx ON public.essais_abonnement USING btree ("right"(regexp_replace(COALESCE(telephone, ''::text), '\D'::text, ''::text, 'g'::text), 8));
  end if;
end $$;

-- Journal d'essai : lisible par son propriétaire uniquement (RLS).
-- C'est la RLS — et non les GRANT — qui filtre réellement les accès :
-- les GRANT larges ci-dessous sont ceux posés par défaut par Supabase
-- sur le schéma public, reproduits ici à l'identique.
alter table public.essais_abonnement enable row level security;

drop policy if exists essais_abonnement_select_own on public.essais_abonnement;
create policy essais_abonnement_select_own on public.essais_abonnement
  for select to public
  using ((auth.uid() = compte_id));

-- ---------- accorder_essai ----------
CREATE OR REPLACE FUNCTION public.accorder_essai(p_compte uuid, p_email text, p_telephone text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- ---------- accorder_essai_inscription ----------
CREATE OR REPLACE FUNCTION public.accorder_essai_inscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    perform public.accorder_essai(new.id, new.email, null);
  exception when others then
    -- Ne JAMAIS bloquer une inscription pour un souci d'essai.
    raise warning 'essai non attribué pour % : %', new.id, sqlerrm;
  end;
  return new;
end $function$;

-- ---------- Trigger d'attribution automatique à l'inscription ----------
drop trigger if exists essai_auto_inscription on auth.users;
create trigger essai_auto_inscription
  after insert on auth.users
  for each row execute function public.accorder_essai_inscription();

-- ---------- Droits ----------
grant DELETE on public.essais_abonnement to anon;
grant INSERT on public.essais_abonnement to anon;
grant REFERENCES on public.essais_abonnement to anon;
grant SELECT on public.essais_abonnement to anon;
grant TRIGGER on public.essais_abonnement to anon;
grant TRUNCATE on public.essais_abonnement to anon;
grant UPDATE on public.essais_abonnement to anon;
grant DELETE on public.essais_abonnement to authenticated;
grant INSERT on public.essais_abonnement to authenticated;
grant REFERENCES on public.essais_abonnement to authenticated;
grant SELECT on public.essais_abonnement to authenticated;
grant TRIGGER on public.essais_abonnement to authenticated;
grant TRUNCATE on public.essais_abonnement to authenticated;
grant UPDATE on public.essais_abonnement to authenticated;
grant DELETE on public.essais_abonnement to postgres;
grant INSERT on public.essais_abonnement to postgres;
grant REFERENCES on public.essais_abonnement to postgres;
grant SELECT on public.essais_abonnement to postgres;
grant TRIGGER on public.essais_abonnement to postgres;
grant TRUNCATE on public.essais_abonnement to postgres;
grant UPDATE on public.essais_abonnement to postgres;
grant DELETE on public.essais_abonnement to service_role;
grant INSERT on public.essais_abonnement to service_role;
grant REFERENCES on public.essais_abonnement to service_role;
grant SELECT on public.essais_abonnement to service_role;
grant TRIGGER on public.essais_abonnement to service_role;
grant TRUNCATE on public.essais_abonnement to service_role;
grant UPDATE on public.essais_abonnement to service_role;
grant EXECUTE on function public.accorder_essai to postgres;
grant EXECUTE on function public.accorder_essai to service_role;
grant EXECUTE on function public.accorder_essai_inscription to PUBLIC;
grant EXECUTE on function public.accorder_essai_inscription to anon;
grant EXECUTE on function public.accorder_essai_inscription to authenticated;
grant EXECUTE on function public.accorder_essai_inscription to postgres;
grant EXECUTE on function public.accorder_essai_inscription to service_role;
