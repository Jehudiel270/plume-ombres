-- ============================================================
-- 20261111000001 — Pseudo borné + moyen de paiement
-- 1) Les pseudos sont limités à 32 caractères (le formulaire
--    d'inscription applique la même règle) et les valeurs hors
--    bornes déjà en base sont réparées.
-- 2) La table paiements distingue Mobile Money et carte bancaire.
-- ============================================================

-- 1) Réparation des pseudos existants (un pseudo de 1777 caractères
--    avait été relevé en production).
update public.profiles
   set pseudo = left(btrim(pseudo), 32)
 where char_length(btrim(pseudo)) > 32;

update public.profiles
   set pseudo = 'lecteur'
 where pseudo is null or char_length(btrim(pseudo)) < 2;

alter table public.profiles
  drop constraint if exists profiles_pseudo_longueur;

alter table public.profiles
  add constraint profiles_pseudo_longueur
  check (char_length(pseudo) between 2 and 32);

-- 2) Le trigger d'inscription tronque désormais le pseudo : un
--    métadonnée trop longue ne peut plus faire échouer l'inscription.
create or replace function public.creer_profil_inscription()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  begin
    insert into public.profiles (id, pseudo)
    values (
      new.id,
      coalesce(
        nullif(left(btrim(new.raw_user_meta_data ->> 'pseudo'), 32), ''),
        'lecteur'
      )
    )
    on conflict (id) do nothing;
  exception when others then
    -- Un souci de profil ne doit jamais faire échouer une inscription.
    raise warning 'profil non créé pour % : %', new.id, sqlerrm;
  end;
  return new;
end $function$;

-- 3) Moyen de paiement (Mobile Money par défaut pour l'historique).
alter table public.paiements
  add column if not exists moyen text not null default 'mobile_money';

alter table public.paiements
  drop constraint if exists paiements_moyen_valide;

alter table public.paiements
  add constraint paiements_moyen_valide
  check (moyen in ('mobile_money', 'carte'));
