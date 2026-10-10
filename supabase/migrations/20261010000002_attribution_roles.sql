-- ============================================================
-- Plume d'Ombres — Attribution initiale des rôles (données).
--
-- Idempotente : réappliquable sans effet de bord. Elle retrouve les
-- comptes PAR COURRIEL (jamais par identifiant en dur) afin de rester
-- juste même si le projet est recréé.
--
--   * dossoucarrel@gmail.com (pseudo « Miaou »)  → super_admin
--     (le propriétaire : il nomme et révoque les administrateurs) ;
--   * harcker137@gmail.com (pseudo « Lecteur_omniscient ») → admin
--     (accès au tableau de bord d'exploitation, sans gestion des rôles).
--
-- Les autres administrateurs techniques (@plume-ombres.local) restent
-- `admin` : ils n'ont pas besoin de nommer des comptes.
--
-- Note : le déclencheur proteger_role_profiles autorise l'écriture
-- quand auth.uid() est nul (migration / postgres), ce qui est le cas
-- ici. Le déclencheur miroir_role_admin recopie l'effet dans la liste
-- blanche public.administrateurs si elle existe.
-- ============================================================

do $$
declare
  v_super uuid;
  v_admin uuid;
begin
  select u.id into v_super from auth.users u where u.email = 'dossoucarrel@gmail.com';
  select u.id into v_admin from auth.users u where u.email = 'harcker137@gmail.com';

  if v_super is null then
    raise warning 'Attribution des rôles : aucun compte pour dossoucarrel@gmail.com — ignoré.';
  else
    update public.profiles p
       set role = 'super_admin'
     where p.id = v_super
       and p.role is distinct from 'super_admin';
  end if;

  if v_admin is null then
    raise warning 'Attribution des rôles : aucun compte pour harcker137@gmail.com — ignoré.';
  else
    update public.profiles p
       set role = 'admin'
     where p.id = v_admin
       and p.role not in ('admin', 'super_admin');
  end if;
end $$;
