-- ============================================================
-- Plume d'Ombres — ESSAI GRATUIT : UN SEUL PAR PERSONNE, PAS PAR ALIAS
--
-- Problème mesuré : `accorder_essai` comparait `lower(email)`, donc
-- `jean@gmail.com`, `Jean.Dupont@gmail.com`, `jean+1@gmail.com` et
-- `jean@googlemail.com` donnaient QUATRE essais de 7 jours. C'est
-- exploitable dès qu'une campagne publicitaire attire des inconnus.
--
-- Correctif retenu (aucune friction pour le client) :
--   * on normalise l'e-mail avant comparaison :
--       - minuscules, espaces retirés ;
--       - suffixe `+quelquechose` supprimé (alias de boîte) ;
--       - points supprimés pour Gmail/Googlemail (Gmail les ignore) ;
--       - googlemail.com ramené à gmail.com ;
--   * l'e-mail normalisé est stocké et indexé, la comparaison reste
--     donc rapide quelle que soit la taille du journal.
--
-- Pourquoi pas un plafond par adresse IP : au Bénin les opérateurs
-- mobiles font du partage d'adresse (CGNAT) — plusieurs clients
-- légitimes partagent une IP publique. Un plafond par IP refuserait
-- des clients payants pour économiser quelques essais. Le vrai coût
-- d'abus devient ici : créer une boîte Gmail neuve (vérifiée par
-- téléphone chez Google) pour chaque essai.
--
-- Migration STRICTEMENT additive : aucune ligne supprimée, aucune
-- policy modifiée.
-- ============================================================

-- ---------- 1. normaliser_email ----------
create or replace function public.normaliser_email(p_email text)
returns text
language plpgsql
immutable
as $function$
declare
  v text;
  v_local text;
  v_domaine text;
begin
  v := lower(btrim(coalesce(p_email, '')));
  if v = '' or position('@' in v) = 0 then
    return null;
  end if;

  v_local := split_part(v, '@', 1);
  v_domaine := split_part(v, '@', 2);

  -- Alias de boîte : jean+pub@gmail.com -> jean
  v_local := split_part(v_local, '+', 1);

  -- Google Mail et Gmail sont la même boîte
  if v_domaine = 'googlemail.com' then
    v_domaine := 'gmail.com';
  end if;

  -- Gmail ignore les points dans la partie locale
  if v_domaine = 'gmail.com' then
    v_local := replace(v_local, '.', '');
  end if;

  if v_local = '' or v_domaine = '' or position('.' in v_domaine) = 0 then
    return null;
  end if;

  return v_local || '@' || v_domaine;
end
$function$;

comment on function public.normaliser_email(text) is
  'E-mail canonique utilisé pour empêcher de rejouer l''essai gratuit (alias +, points Gmail, googlemail).';

revoke all on function public.normaliser_email(text) from public;
grant execute on function public.normaliser_email(text) to anon, authenticated, service_role;

-- ---------- 2. Colonne + index ----------
alter table public.essais_abonnement
  add column if not exists email_normalise text;

comment on column public.essais_abonnement.email_normalise is
  'E-mail canonique (voir normaliser_email) : sert de clé anti-rejeu de l''essai.';

update public.essais_abonnement
   set email_normalise = public.normaliser_email(email)
 where email_normalise is null
   and email is not null;

create index if not exists essais_abonnement_email_normalise_idx
  on public.essais_abonnement (email_normalise);

-- ---------- 3. accorder_essai : garde normalisée ----------
create or replace function public.accorder_essai(
  p_compte uuid,
  p_email text,
  p_telephone text default null::text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tel text := nullif(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g'), '');
  v_email_norm text := public.normaliser_email(p_email);
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

  -- Un SEUL essai par PERSONNE : e-mail canonique.
  if v_email_norm is not null and exists (
    select 1
      from public.essais_abonnement e
     where coalesce(e.email_normalise, public.normaliser_email(e.email)) = v_email_norm
  ) then
    return 'refuse_email';
  end if;

  -- Un SEUL essai par numéro Mobile Money TANT QU'IL N'A PAS PAYÉ.
  if v_suffixe is not null and exists (
    select 1
      from public.essais_abonnement e
     where e.paye_le is null
       and right(regexp_replace(coalesce(e.telephone, ''), '\D', '', 'g'), 8) = v_suffixe
  ) then
    return 'refuse_telephone';
  end if;

  insert into public.essais_abonnement (compte_id, email, email_normalise, telephone)
  values (p_compte, p_email, v_email_norm, v_tel)
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
end
$function$;

-- ---------- 4. Journal lisible par le super-admin ----------
-- Combien d'essais par e-mail canonique : révèle un abus sans exposer
-- les adresses complètes à un administrateur non habilité.
create or replace function public.admin_essais_par_email(p_limite integer default 20)
returns table (email_normalise text, essais bigint, premier timestamptz, dernier timestamptz)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select e.email_normalise,
         count(*)::bigint as essais,
         min(e.cree_le) as premier,
         max(e.cree_le) as dernier
    from public.essais_abonnement e
   where e.email_normalise is not null
     and public.section_autorisee('comptes')
   group by e.email_normalise
  having count(*) > 1
   order by count(*) desc, max(e.cree_le) desc
   limit greatest(coalesce(p_limite, 20), 1);
$function$;

comment on function public.admin_essais_par_email(integer) is
  'Doublons d''essai par e-mail canonique — détection d''abus, réservé à la section comptes.';

revoke all on function public.admin_essais_par_email(integer) from public;
grant execute on function public.admin_essais_par_email(integer) to authenticated, service_role;
