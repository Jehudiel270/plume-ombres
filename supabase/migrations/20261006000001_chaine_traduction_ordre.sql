-- ============================================================
-- Plume d'Ombres — Ordre de la chaîne de traduction (persisté).
--
-- But : permettre à l'admin de RÉORDONNER la chaîne de secours
-- des moteurs de traduction (LibreTranslate → Gemini → Google →
-- MyMemory) depuis l'interface, SANS redéploiement. Aujourd'hui
-- l'ordre n'est réglable que par la variable d'environnement
-- TRANSLATOR_FALLBACK_ORDER (donc un redéploiement).
--
-- Idempotente : réappliquable sans erreur (create ... if not
-- exists, create or replace, drop ... if exists).
--
-- Contenu :
--   * public.chaine_traduction_ordre      — 4 lignes au plus
--     (une par moteur), position 1..4 ; configuration GLOBALE
--     (aucun propriétaire) ;
--   * public.lire_ordre_chaine()          — LECTURE (SECURITY
--     DEFINER) : l'ordre courant, ou un tableau vide si aucun
--     ordre n'a encore été enregistré (l'appelant retombe alors
--     sur TRANSLATOR_FALLBACK_ORDER puis sur l'ordre par défaut) ;
--     accordée à anon/authenticated/service_role pour que le
--     worker de traduction (sans session) puisse la lire ;
--   * public.definir_ordre_chaine(p_ordre text[]) — ÉCRITURE
--     (SECURITY DEFINER) : RÉSERVÉE AUX ADMINS (public.est_admin),
--     jamais accordée à anon. Un appel SQL direct (auth.uid() null,
--     ex. migration/postgres) reste autorisé — même motif que le
--     déclencheur proteger_role_profiles de la migration rôles.
--
-- SÉCURITÉ DE L'ORDRE : l'ordre est une configuration
-- d'exploitation (quels moteurs, dans quel ordre) — ce sont des
-- NOMS DE MOTEURS, jamais le texte d'un livre. La règle produit
-- « ne jamais nommer un moteur dans l'interface UTILISATEUR » est
-- tenue par les composants (espace admin uniquement) ; cette table
-- ne contient aucun contenu de livre.
--
-- MODE PRIVÉ STRICT : cette table ne peut PAS l'affaiblir. Le
-- verrou TRANSLATOR_PRIVE_STRICT est appliqué AU CŒUR de la chaîne
-- (ordreSecours / traduireAvecSecours) et reste PRIORITAIRE sur
-- tout ordre persisté : voir lib/providers/fallback.ts.
-- ============================================================

-- ---------- TABLE ----------
create table if not exists public.chaine_traduction_ordre (
  id bigint generated always as identity primary key,
  id_fournisseur text not null unique,
  position integer not null,
  updated_at timestamptz not null default now(),
  constraint chaine_traduction_ordre_fournisseur_valide
    check (id_fournisseur in ('libretranslate', 'gemini', 'google', 'mymemory'))
);

create index if not exists chaine_traduction_ordre_position_idx
  on public.chaine_traduction_ordre (position);

-- ---------- RLS ----------
-- Lecture directe de la table réservée aux admins ; les moteurs de
-- traduction lisent via la fonction SECURITY DEFINER ci-dessous.
-- Aucune politique d'écriture : les écritures passent EXCLUSIVEMENT
-- par public.definir_ordre_chaine (ou service_role / postgres).
alter table public.chaine_traduction_ordre enable row level security;

drop policy if exists "chaine_traduction_ordre_select_admin"
  on public.chaine_traduction_ordre;
create policy "chaine_traduction_ordre_select_admin"
  on public.chaine_traduction_ordre
  for select using (public.est_admin());

-- ---------- LECTURE (worker / route / admin) ----------
create or replace function public.lire_ordre_chaine()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           array_agg(id_fournisseur order by position),
           array[]::text[]
         )
    from public.chaine_traduction_ordre;
$$;

revoke all on function public.lire_ordre_chaine() from public;
grant execute on function public.lire_ordre_chaine()
  to anon, authenticated, service_role;

-- ---------- ÉCRITURE (admins) ----------
-- Remplace intégralement l'ordre (transaction atomique). Valide
-- les identifiants et l'absence de doublon AVANT toute écriture.
create or replace function public.definir_ordre_chaine(p_ordre text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   text;
  v_pos  integer := 0;
  v_vus  text[] := '{}';
begin
  -- Garde : un appel avec session (auth.uid() non nul) exige un
  -- administrateur. Un appel SQL direct (auth.uid() null : migration,
  -- script serveur, service_role) reste autorisé et n'est PAS
  -- atteignable avec la seule clé anon (execute révoquée pour anon).
  if auth.uid() is not null and not public.est_admin(auth.uid()) then
    raise exception 'definir_ordre_chaine : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  if p_ordre is null or array_length(p_ordre, 1) is null then
    raise exception 'definir_ordre_chaine : ordre vide'
      using errcode = '22023';
  end if;

  foreach v_id in array p_ordre loop
    if v_id is null or v_id not in ('libretranslate', 'gemini', 'google', 'mymemory') then
      raise exception 'definir_ordre_chaine : moteur inconnu (%)', v_id
        using errcode = '22023';
    end if;
    if v_id = any(v_vus) then
      raise exception 'definir_ordre_chaine : doublon (%)', v_id
        using errcode = '22023';
    end if;
    v_vus := array_append(v_vus, v_id);
  end loop;

  -- Purge des moteurs retirés de l'ordre. WHERE explicite OBLIGATOIRE :
  -- un DELETE nu est refusé par le garde-fou « safe update » (PostgREST).
  delete from public.chaine_traduction_ordre
   where id_fournisseur <> all(p_ordre);

  -- Écriture/mise à jour des positions (upsert, jamais de DELETE nu).
  foreach v_id in array p_ordre loop
    v_pos := v_pos + 1;
    insert into public.chaine_traduction_ordre (id_fournisseur, position, updated_at)
    values (v_id, v_pos, now())
    on conflict (id_fournisseur) do update
      set position = excluded.position, updated_at = now();
  end loop;

  return p_ordre;
end $$;

revoke all on function public.definir_ordre_chaine(text[]) from public;
-- Supabase accorde EXECUTE à anon/authenticated PAR DÉFAUT sur toute
-- nouvelle fonction (privilèges par défaut du schéma public) : un
-- simple « revoke from public » ne suffit donc PAS. On révoque anon
-- NOMMÉMENT — l'écriture est ADMIN (session) ou SQL direct.
revoke execute on function public.definir_ordre_chaine(text[]) from anon;
grant execute on function public.definir_ordre_chaine(text[])
  to authenticated, service_role;

-- Défense en profondeur : aucune écriture DIRECTE de la table par
-- anon/authenticated (les écritures passent par la RPC ci-dessus).
revoke insert, update, delete, truncate
  on public.chaine_traduction_ordre from anon, authenticated;
