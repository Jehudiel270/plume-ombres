-- ============================================================
-- 20261103000004_profil_automatique.sql
-- Un compte doit TOUJOURS avoir sa ligne de profil, quel que soit le
-- chemin d'inscription (formulaire du site, API Supabase, futur
-- parcours OAuth). L'absence de ligne rendait `mes_sections()`
-- ambigu (comparaison NULL) et laissait l'utilisateur sans pseudo.
-- ============================================================

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
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'pseudo'), ''), 'lecteur')
    )
    on conflict (id) do nothing;
  exception when others then
    -- Un souci de profil ne doit jamais faire échouer une inscription.
    raise warning 'profil non créé pour % : %', new.id, sqlerrm;
  end;
  return new;
end $function$;

drop trigger if exists profil_auto_inscription on auth.users;
create trigger profil_auto_inscription
  after insert on auth.users
  for each row execute function public.creer_profil_inscription();

-- Rattrapage : comptes créés avant ce déclencheur.
insert into public.profiles (id, pseudo)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'pseudo'), ''), 'lecteur')
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

comment on function public.creer_profil_inscription() is
  'Crée la ligne public.profiles de tout nouveau compte auth.users.';
