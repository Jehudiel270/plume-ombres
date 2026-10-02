-- ============================================================
-- Plume d'Ombres — Suppression de compte par le titulaire
--
-- Expose public.supprimer_mon_compte() : supprime le compte
-- auth.users de l'utilisateur authentifié qui l'appelle.
--
-- SECURITY DEFINER est indispensable : le rôle « authenticated »
-- n'a aucun droit d'écriture sur le schéma auth. Le propriétaire
-- de la fonction (postgres) s'en charge à sa place, en se limitant
-- STRICTEMENT à la ligne de l'appelant (auth.uid()).
--
-- La suppression est en cascade : profil, livres, chapitres,
-- segments et favoris référencent auth.users(id) on delete cascade.
-- ============================================================

create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Aucune session active : suppression refusée.';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- N'est exécutable que par un utilisateur connecté, jamais par « anon ».
-- (Supabase accorde EXECUTE à anon/authenticated par défaut : on révoque
-- explicitement le premier et on confirme le second.)
revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
