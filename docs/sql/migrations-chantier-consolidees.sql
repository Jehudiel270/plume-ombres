-- ============================================================
-- Plume d'Ombres — MIGRATIONS DU CHANTIER POST-LANCEMENT (consolidées).
--
-- À exécuter UNE FOIS dans le SQL Editor de Supabase pour que
-- l'aperçu develop fonctionne (tous les fichiers sont ADDITIFS et
-- IDEMPOTENTS : relancer ce script est sans danger).
--
-- Contenu :
--   * 20261111000002_suppression_comptes_admin.sql  (ajout du 14/11 :
--     constaté manquant en base — la fonction admin_supprimer_compte
--     et l'action « supprimer_compte » du journal n'existaient pas,
--     alors que le lot précédent du 11/11 est déjà appliqué) ;
--   * 20261112000001_fonctionnalites_etats.sql
--   * 20261112000002_carnet_notes.sql
--   * 20261112000003_theories.sql
--   * 20261112000004_graphe_narratif.sql
--   * 20261112000005_resume_lectures.sql
--   * 20261112000006_progression_xp.sql
--   * 20261112000007_ambiance_livres.sql
--   * 20261112000008_univers.sql
--   * 20261113000001_parametres_systeme.sql
--   * 20261113000002_cles_api.sql
--   * 20261114000001_admin_stats_revenus.sql  (vague 2 : MRR, mouvements)
--   * 20261114000002_evenements_webhook.sql   (vague 2 : journal webhook)
--
-- Sources : supabase/migrations/ (mêmes fichiers, séparés).
-- ============================================================


-- ############################################
-- 20261111000002_suppression_comptes_admin.sql
-- ############################################

-- ============================================================
-- Plume d'Ombres — Suppression d'un compte par un administrateur
--
-- Manquait : un admin pouvait seulement RESTREINDRE les sections d'un
-- autre admin, et aucun compte (utile ou administrateur) ne pouvait
-- être supprimé depuis le tableau de bord. Cette migration ajoute la
-- seule brique serveur nécessaire, la RPC public.admin_supprimer_compte.
--
-- RÈGLES (appliquées DANS la fonction, pas seulement dans l'interface) :
--   * appelant non administrateur          → 42501 ;
--   * cible inexistante                    → P0002 ;
--   * suppression de SON PROPRE compte     → 42501 (garde anti-verrouillage) ;
--   * cible `admin` ou `super_admin`       → réservé au super-admin (42501) ;
--   * dernier super-admin restant          → refus (42501).
--
-- La suppression touche auth.users : TOUTES les tables métier
-- référencent auth.users(id) ON DELETE CASCADE (profils, livres,
-- chapitres, segments, favoris, abonnements, crédits, paiements,
-- sections, alertes…), donc un seul DELETE suffit.
--
-- Le journal est écrit AVANT le DELETE ; public.admin_actions ne porte
-- aucune clé étrangère vers auth.users, la trace survit donc au compte.
-- ============================================================

-- 1. Nouvelle action journalisable.
do $$
declare
  v_nom text;
begin
  for v_nom in
    select conname from pg_constraint
     where conrelid = 'public.admin_actions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.admin_actions drop constraint %I', v_nom);
  end loop;
end $$;

alter table public.admin_actions
  add constraint admin_actions_action_valide
  check (action in (
    'attribuer', 'revoquer', 'nommer_role', 'retrograder_role', 'supprimer_compte'
  ));

-- 2. RPC de suppression.
create or replace function public.admin_supprimer_compte(
  p_user_id uuid,
  p_motif text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appelant uuid := auth.uid();
  v_role text;
  v_pseudo text;

  v_restants integer;
begin
  if v_appelant is null or not public.est_admin(v_appelant) then
    raise exception 'admin_supprimer_compte : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'admin_supprimer_compte : compte cible manquant.'
      using errcode = '22023';
  end if;

  if p_user_id = v_appelant then
    raise exception 'admin_supprimer_compte : un administrateur ne peut pas supprimer son propre compte.'
      using errcode = '42501';
  end if;

  select p.role, p.pseudo into v_role, v_pseudo
    from public.profiles p
   where p.id = p_user_id;

  if v_role is null then
    raise exception 'admin_supprimer_compte : compte % introuvable.', p_user_id
      using errcode = 'P0002';
  end if;

  -- Supprimer un administrateur (ou un super-administrateur) est
  -- réservé au super-administrateur : un simple admin ne peut pas
  -- décapiter la hiérarchie dont il dépend.
  if v_role in ('admin', 'super_admin') and not public.est_super_admin(v_appelant) then
    raise exception 'admin_supprimer_compte : seul un super-administrateur peut supprimer un compte administrateur.'
      using errcode = '42501';
  end if;

  -- Garde anti-verrouillage : il doit rester au moins un super-admin.
  if v_role = 'super_admin' then
    select count(*) into v_restants
      from public.profiles
     where role = 'super_admin' and id <> p_user_id;
    if v_restants = 0 then
      raise exception 'admin_supprimer_compte : impossible de supprimer le dernier super-administrateur.'
        using errcode = '42501';
    end if;
  end if;

  -- Journal AVANT la suppression (aucune FK vers auth.users).
  insert into public.admin_actions (admin_id, cible_id, action, role_cible, motif)
  values (
    v_appelant,
    p_user_id,
    'supprimer_compte',
    v_role,
    coalesce(nullif(btrim(p_motif), ''), 'suppression de ' || coalesce(v_pseudo, p_user_id::text))
  );

  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'utilisateur_id', p_user_id,
    'pseudo', v_pseudo,
    'role', v_role,
    'supprime', true,
    'journalise', true
  );
end $$;

revoke all on function public.admin_supprimer_compte(uuid, text) from public, anon;
grant execute on function public.admin_supprimer_compte(uuid, text)
  to authenticated, service_role;

-- ############################################
-- 20261112000001_fonctionnalites_etats.sql
-- ############################################

-- ============================================================
-- Plume d'Ombres — ÉTATS DES INTERRUPTEURS DE FONCTIONNALITÉS.
--
-- Chantier post-lancement (module 1) : chaque nouveau module
-- (théories, graphe, clubs…) est livré ÉTEINT et ne s'ouvre que si
-- l'administrateur l'a ouvert dans /admin/fonctionnalites.
--
-- Principes (brief BRIEF-HERMES, conservés) :
--   * le registre TypeScript (lib/fonctionnalites/registre.ts) est
--     la source de vérité des DÉFINITIONS ; cette table ne stocke
--     que les ÉTATS choisis (actif, plan minimal, déploiement,
--     confirmation juriste) ;
--   * absence de ligne = défaut du registre (tout est éteint en
--     production) ;
--   * lecture possible par tout compte authentifié (les états ne
--     contiennent rien de sensible) ; écriture réservée aux
--     administrateurs (public.est_admin()) ;
--   * journalisation dans journal_admin si la table existe.
--
-- Fichier ADDITIF et IDEMPOTENT (aucun DROP, aucun renommage).
-- ============================================================

create table if not exists public.fonctionnalites_etats (
  cle text primary key,
  actif boolean not null default false,
  plan_minimal text null,
  deploiement integer not null default 100
    constraint fonctionnalites_deploiement_borne check (deploiement between 0 and 100),
  juriste_ok boolean not null default false,
  maj_le timestamptz not null default now(),
  maj_par uuid null references auth.users (id) on delete set null,
  constraint fonctionnalites_plans_connus check (
    plan_minimal is null
    or plan_minimal in ('gratuit', 'lecteur', 'passionne', 'illimite')
  )
);

comment on table public.fonctionnalites_etats is
  'États des interrupteurs de fonctionnalités. Absence de ligne = défaut du registre (éteint en production).';

alter table public.fonctionnalites_etats enable row level security;

-- Lecture ouverte (anon + authentifié) : la barrière du proxy lit les
-- états avec la clé publique, AVANT toute session. Ces lignes ne
-- contiennent que la configuration des modules — rien de sensible.
-- Écriture réservée aux administrateurs (public.est_admin()).
drop policy if exists fonctionnalites_etats_lecture on public.fonctionnalites_etats;
create policy fonctionnalites_etats_lecture on public.fonctionnalites_etats
  for select to anon, authenticated using (true);

drop policy if exists fonctionnalites_etats_ecriture on public.fonctionnalites_etats;
create policy fonctionnalites_etats_ecriture on public.fonctionnalites_etats
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

revoke all on public.fonctionnalites_etats from public;
grant select on public.fonctionnalites_etats to anon, authenticated;
grant insert, update, delete on public.fonctionnalites_etats to authenticated;

-- ------------------------------------------------------------
-- Journal : tracer qui a changé quoi (même table que les autres
-- actions d'administration, si elle existe).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.journal_admin') is not null then
    execute $sql$
      create or replace function public.tracer_fonctionnalites_etats()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $corps$
      declare
        v_detail text;
      begin
        v_detail := format(
          '%s : actif=%s, plan=%s, deploiement=%s, juriste_ok=%s',
          new.cle, new.actif, coalesce(new.plan_minimal, '-'),
          new.deploiement, new.juriste_ok
        );
        insert into public.journal_admin (admin_id, cible_id, action, motif)
        values (auth.uid(), null, 'fonctionnalites_etats', v_detail);
        return new;
      end;
      $corps$;
    $sql$;
    drop trigger if exists tracer_fonctionnalites_etats on public.fonctionnalites_etats;
    create trigger tracer_fonctionnalites_etats
      after insert or update on public.fonctionnalites_etats
      for each row execute function public.tracer_fonctionnalites_etats();
  end if;
end;
$$;


-- ############################################
-- 20261112000002_carnet_notes.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 5 : Carnet de lecture (F2)
--
-- Une table :
--   • public.carnet_notes : notes, citations et surlignages pris
--     pendant la lecture, rattachés à un livre (et, quand c'est
--     connu, à un chapitre). Aucun texte intégral n'y est stocké :
--     les extraits cités sont plafonnés (800 caractères, contrainte
--     CHECK) — la règle des exports (F24) vaut pour la table.
--
-- IDEMPOTENTE : `create table if not exists`, `create index if not
-- exists`, `drop policy if exists` avant chaque `create policy`.
-- ADDITIVE : aucune suppression, aucun renommage.
--
-- RLS : chaque compte ne voit et ne modifie que les notes de SES
-- livres (même logique que glossaires / chapitres / segments).
-- ============================================================

-- ---------- CARNET (notes, citations, surlignages) ----------
create table if not exists public.carnet_notes (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid references public.chapitres (id) on delete set null,
  -- note : réflexion libre ; citation : passage copié ; surlignage :
  -- passage marqué pendant la lecture.
  type text not null default 'note'
    check (type in ('note', 'citation', 'surlignage')),
  -- Passage cité ou surligné, PLAFONNÉ (jamais le texte intégral).
  extrait text check (extrait is null or char_length(extrait) <= 800),
  -- Note libre du lecteur (rattachée à l'extrait s'il y en a un).
  annotation text check (annotation is null or char_length(annotation) <= 4000),
  -- Titre du chapitre au moment de la prise de note (affichage,
  -- sans jointure au cas où le chapitre serait supprimé).
  chapitre_titre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Au moins UN contenu : un extrait ou une annotation non vide.
  check (
    coalesce(btrim(extrait), '') <> ''
    or coalesce(btrim(annotation), '') <> ''
  )
);

create index if not exists carnet_notes_livre_idx
  on public.carnet_notes (livre_id, created_at desc);

alter table public.carnet_notes enable row level security;

drop policy if exists "carnet_notes_select_own" on public.carnet_notes;
create policy "carnet_notes_select_own" on public.carnet_notes
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_insert_own" on public.carnet_notes;
create policy "carnet_notes_insert_own" on public.carnet_notes
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_update_own" on public.carnet_notes;
create policy "carnet_notes_update_own" on public.carnet_notes
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "carnet_notes_delete_own" on public.carnet_notes;
create policy "carnet_notes_delete_own" on public.carnet_notes
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = carnet_notes.livre_id and l.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261112000003_theories.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 6 : Théories de lecture (F8)
--
-- Une table :
--   • public.theories : hypothèses de lecture PERSONNELLES (atelier,
--     rien de public), rattachées à un livre et, quand c'est connu,
--     au chapitre où l'hypothèse a été posée. Statut traçant :
--     ouverte → confirmée / infirmée.
--
-- IDEMPOTENTE et ADDITIVE (aucune suppression, aucun renommage).
-- RLS « own » : chaque compte ne voit et ne modifie que SES théories.
-- ============================================================

create table if not exists public.theories (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid references public.chapitres (id) on delete set null,
  titre text not null check (char_length(btrim(titre)) between 2 and 200),
  raisonnement text not null check (char_length(btrim(raisonnement)) between 1 and 8000),
  -- Étiquettes libres (personnages, lieux…), max 5, posées par l'app.
  etiquettes text[] not null default '{}',
  -- Traçabilité : une théorie peut rester ouverte ou être tranchée.
  statut text not null default 'ouverte'
    check (statut in ('ouverte', 'confirmee', 'infirmee')),
  tranchee_au_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists theories_livre_idx
  on public.theories (livre_id, created_at desc);

alter table public.theories enable row level security;

drop policy if exists "theories_select_own" on public.theories;
create policy "theories_select_own" on public.theories
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_insert_own" on public.theories;
create policy "theories_insert_own" on public.theories
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_update_own" on public.theories;
create policy "theories_update_own" on public.theories
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "theories_delete_own" on public.theories;
create policy "theories_delete_own" on public.theories
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = theories.livre_id and l.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261112000004_graphe_narratif.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 7 : Graphe narratif (F25,
-- MANUEL d'abord). Deux tables :
--
--   • public.graphe_personnages : nœuds du graphe (nom, rôle,
--     description courte) ;
--   • public.graphe_relations   : arêtes orientées et libellées
--     (« sœur de », « trahit »…).
--
-- ANTI-SPOILERS PAR CONSTRUCTION : chaque nœud et chaque arête
-- porte sa PREMIÈRE APPARITION (chapitre, nullable = présent dès le
-- début). Le SERVEUR ne renvoie que ce qui est couvert par le
-- chapitre lu transmis par le lecteur (voir lib/graphe.ts) —
-- aucune donnée au-delà ne quitte la base, pas de flou CSS.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » complète.
-- ============================================================

-- ---------- PERSONNAGES (nœuds) ----------
create table if not exists public.graphe_personnages (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  nom text not null check (char_length(btrim(nom)) between 1 and 120),
  -- protagoniste / antagoniste / allie / secondaire / autre
  role text not null default 'secondaire'
    check (role in ('protagoniste', 'antagoniste', 'allie', 'secondaire', 'autre')),
  description text check (description is null or char_length(description) <= 2000),
  -- null = présent dès le début de l'œuvre.
  premiere_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists graphe_personnages_livre_idx
  on public.graphe_personnages (livre_id);

alter table public.graphe_personnages enable row level security;

drop policy if exists "graphe_personnages_select_own" on public.graphe_personnages;
create policy "graphe_personnages_select_own" on public.graphe_personnages
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_insert_own" on public.graphe_personnages;
create policy "graphe_personnages_insert_own" on public.graphe_personnages
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_update_own" on public.graphe_personnages;
create policy "graphe_personnages_update_own" on public.graphe_personnages
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_personnages_delete_own" on public.graphe_personnages;
create policy "graphe_personnages_delete_own" on public.graphe_personnages
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_personnages.livre_id and l.proprietaire_id = auth.uid()
    )
  );

-- ---------- RELATIONS (arêtes) ----------
create table if not exists public.graphe_relations (
  id uuid primary key default gen_random_uuid(),
  livre_id uuid not null references public.livres (id) on delete cascade,
  origine_id uuid not null references public.graphe_personnages (id) on delete cascade,
  destination_id uuid not null references public.graphe_personnages (id) on delete cascade,
  libelle text not null check (char_length(btrim(libelle)) between 1 and 160),
  premiere_chapitre_id uuid references public.chapitres (id) on delete set null,
  created_at timestamptz not null default now(),
  check (origine_id <> destination_id)
);

create index if not exists graphe_relations_livre_idx
  on public.graphe_relations (livre_id);

alter table public.graphe_relations enable row level security;

drop policy if exists "graphe_relations_select_own" on public.graphe_relations;
create policy "graphe_relations_select_own" on public.graphe_relations
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_insert_own" on public.graphe_relations;
create policy "graphe_relations_insert_own" on public.graphe_relations
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_update_own" on public.graphe_relations;
create policy "graphe_relations_update_own" on public.graphe_relations
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "graphe_relations_delete_own" on public.graphe_relations;
create policy "graphe_relations_delete_own" on public.graphe_relations
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = graphe_relations.livre_id and l.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261112000005_resume_lectures.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 8 : Résumé à la reprise (F10)
--
-- Une table de CACHE :
--   • public.resume_lectures : UN résumé par livre, portant la
--     position jusqu'à laquelle il couvre. Régénéré seulement quand
--     le lecteur a avancé (économie d'appels de modèle).
--
-- Le résumé est produit par le modèle depuis le SEUL texte des
-- chapitres lus (contexte construit côté serveur). Aucune table
-- pour les questions : elles ne sont pas conservées.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own ».
-- ============================================================

create table if not exists public.resume_lectures (
  livre_id uuid primary key references public.livres (id) on delete cascade,
  -- Position (1 → n) du chapitre que le résumé couvre.
  jusqu_position integer not null check (jusqu_position >= 0),
  titre_chapitre text,
  contenu text not null check (char_length(contenu) between 1 and 8000),
  moteur text not null default 'modele',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resume_lectures enable row level security;

drop policy if exists "resume_lectures_select_own" on public.resume_lectures;
create policy "resume_lectures_select_own" on public.resume_lectures
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_insert_own" on public.resume_lectures;
create policy "resume_lectures_insert_own" on public.resume_lectures
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_update_own" on public.resume_lectures;
create policy "resume_lectures_update_own" on public.resume_lectures
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "resume_lectures_delete_own" on public.resume_lectures;
create policy "resume_lectures_delete_own" on public.resume_lectures
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = resume_lectures.livre_id and l.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261112000006_progression_xp.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 9 : XP, rangs et badges (A17)
--
-- Deux tables :
--   • public.lectures_xp : UN enregistrement par (compte, chapitre)
--     — l'XP de DÉCOUVERTE n'est jamais comptée deux fois (UNIQUE).
--     Non punitif : rien ne baisse jamais, aucun classement public.
--   • public.badges_obtenus : badges attribués, un par (compte,
--     code) — UNIQUE. Certains badges « exclusifs » n'obéissent
--     qu'au plan d'abonnement (cosmétique).
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » complète.
-- ============================================================

create table if not exists public.lectures_xp (
  id bigint generated always as identity primary key,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  chapitre_id uuid not null references public.chapitres (id) on delete cascade,
  xp integer not null default 25 check (xp between 1 and 100),
  created_at timestamptz not null default now(),
  unique (utilisateur_id, chapitre_id)
);

create index if not exists lectures_xp_utilisateur_idx
  on public.lectures_xp (utilisateur_id, created_at desc);

alter table public.lectures_xp enable row level security;

drop policy if exists "lectures_xp_select_own" on public.lectures_xp;
create policy "lectures_xp_select_own" on public.lectures_xp
  for select using (utilisateur_id = auth.uid());

drop policy if exists "lectures_xp_insert_own" on public.lectures_xp;
create policy "lectures_xp_insert_own" on public.lectures_xp
  for insert with check (utilisateur_id = auth.uid());

-- ---------- BADGES OBTENUS ----------
create table if not exists public.badges_obtenus (
  id bigint generated always as identity primary key,
  utilisateur_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  obtenu_le timestamptz not null default now(),
  unique (utilisateur_id, code)
);

alter table public.badges_obtenus enable row level security;

drop policy if exists "badges_obtenus_select_own" on public.badges_obtenus;
create policy "badges_obtenus_select_own" on public.badges_obtenus
  for select using (utilisateur_id = auth.uid());

drop policy if exists "badges_obtenus_insert_own" on public.badges_obtenus;
create policy "badges_obtenus_insert_own" on public.badges_obtenus
  for insert with check (utilisateur_id = auth.uid());


-- ############################################
-- 20261112000007_ambiance_livres.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 11 : Fiches d'ambiance (F5)
--
-- Une table :
--   • public.ambiance_livres : UNE fiche par livre (genres, tropes,
--     intensité 1 → 5). Complète les avertissements de contenu qui
--     existent déjà (socle) : ici, l'AMBIANCE du récit, posée par le
--     propriétaire du livre, pour guider sa relecture ou son partage
--     privé de recommandations.
--
-- IDEMPOTENTE et ADDITIVE. RLS « own » (via livres.proprietaire_id).
-- ============================================================

create table if not exists public.ambiance_livres (
  livre_id uuid primary key references public.livres (id) on delete cascade,
  -- Listes libres posées par l'application (tableaux plafonnés).
  genres text[] not null default '{}',
  tropes text[] not null default '{}',
  -- 1 = discret … 5 = très sombre (libellés dans lib/ambiance.ts).
  intensite integer not null default 3 check (intensite between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ambiance_livres enable row level security;

drop policy if exists "ambiance_livres_select_own" on public.ambiance_livres;
create policy "ambiance_livres_select_own" on public.ambiance_livres
  for select using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_insert_own" on public.ambiance_livres;
create policy "ambiance_livres_insert_own" on public.ambiance_livres
  for insert with check (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_update_own" on public.ambiance_livres;
create policy "ambiance_livres_update_own" on public.ambiance_livres
  for update using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "ambiance_livres_delete_own" on public.ambiance_livres;
create policy "ambiance_livres_delete_own" on public.ambiance_livres
  for delete using (
    exists (
      select 1 from public.livres l
      where l.id = ambiance_livres.livre_id and l.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261112000008_univers.sql
-- ############################################

-- ============================================================
-- Chantier post-lancement — module 12 : Univers multi-tomes (F17)
--
-- Deux tables :
--   • public.univers        : un univers = une SAGA organisée par le
--     lecteur (titre, description), PRIVÉE ;
--   • public.univers_livres : les tomes, ORDONNÉS (position), un
--     livre ne peut être que dans UN univers (UNIQUE livre_id).
--
-- Plan Illimité (registre). IDEMPOTENTE et ADDITIVE. RLS « own ».
-- ============================================================

create table if not exists public.univers (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null check (char_length(btrim(titre)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.univers enable row level security;

drop policy if exists "univers_select_own" on public.univers;
create policy "univers_select_own" on public.univers
  for select using (proprietaire_id = auth.uid());

drop policy if exists "univers_insert_own" on public.univers;
create policy "univers_insert_own" on public.univers
  for insert with check (proprietaire_id = auth.uid());

drop policy if exists "univers_update_own" on public.univers;
create policy "univers_update_own" on public.univers
  for update using (proprietaire_id = auth.uid());

drop policy if exists "univers_delete_own" on public.univers;
create policy "univers_delete_own" on public.univers
  for delete using (proprietaire_id = auth.uid());

-- ---------- TOMES (livres ordonnés) ----------
create table if not exists public.univers_livres (
  id bigint generated always as identity primary key,
  univers_id uuid not null references public.univers (id) on delete cascade,
  livre_id uuid not null references public.livres (id) on delete cascade,
  position integer not null default 1 check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (univers_id, livre_id)
);

create index if not exists univers_livres_univers_idx
  on public.univers_livres (univers_id, position);

alter table public.univers_livres enable row level security;

drop policy if exists "univers_livres_select_own" on public.univers_livres;
create policy "univers_livres_select_own" on public.univers_livres
  for select using (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "univers_livres_insert_own" on public.univers_livres;
create policy "univers_livres_insert_own" on public.univers_livres
  for insert with check (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );

drop policy if exists "univers_livres_delete_own" on public.univers_livres;
create policy "univers_livres_delete_own" on public.univers_livres
  for delete using (
    exists (
      select 1 from public.univers u
      where u.id = univers_livres.univers_id and u.proprietaire_id = auth.uid()
    )
  );


-- ############################################
-- 20261113000001_parametres_systeme.sql
-- ############################################

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


-- ############################################
-- 20261113000002_cles_api.sql
-- ############################################

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


-- ############################################
-- 20261114000001_admin_stats_revenus.sql
-- ############################################

-- ============================================================
-- Plume d'Ombres — INDICATEURS DE REVENUS (vague 2 du tableau de bord).
--
-- Fichier ADDITIF et IDEMPOTENT : aucune table ni fonction existante
-- n'est modifiée. Il ajoute UNE fonction SECURITY DEFINER qui calcule,
-- à partir des tables d'abonnement déjà en place
-- (abonnements, abonnements_historique, paiements, plans_abonnement) :
--
--   * le revenu mensuel récurrent (MRR) en XOF : chaque abonnement
--     ACTIF est ramené au mois (prix du plan × 30 ÷ durée en jours) ;
--   * la répartition des actifs par plan, avec le prix du plan ;
--   * les mouvements des N derniers mois : nouveaux abonnements,
--     sorties (résiliés + expirés), encaissements (paiements réussis) ;
--   * le total encaissé depuis l'origine.
--
-- Sécurité : même contrat que admin_stats_abonnements() — le rôle est
-- contrôlé DANS la fonction, la réponse ne contient QUE des nombres et
-- des libellés de plan (jamais de contenu de livre, jamais de
-- coordonnée personnelle), exécution révoquée pour public/anon.
-- ============================================================

create or replace function public.admin_stats_revenus(p_mois integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mois integer := greatest(1, least(coalesce(p_mois, 6), 24));
  v_resultat jsonb;
begin
  if not public.est_admin(auth.uid()) then
    raise exception 'admin_stats_revenus : réservé aux administrateurs'
      using errcode = '42501';
  end if;

  v_resultat := jsonb_build_object(

    -- ---------- revenu mensuel récurrent (MRR) ----------
    -- Un abonnement actif pèse prix × 30 ÷ durée (annuel ÷ 12 environ).
    -- Les plans sans prix (gratuit) ou hors catalogue pèsent zéro.
    'mrr_xof', coalesce((
      select round(sum(pl.prix_xof * 30.0 / greatest(pl.duree_jours, 1)))
        from public.abonnements a
        join public.plans_abonnement pl on pl.code = a.plan
       where a.statut = 'actif'
         and pl.prix_xof > 0
    ), 0),

    -- ---------- actifs par plan (avec prix) ----------
    'actifs_par_plan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'plan', t.plan,
               'nom', t.nom,
               'prix_xof', t.prix_xof,
               'duree_jours', t.duree_jours,
               'actifs', t.actifs)
             order by t.actifs desc, t.plan)
        from (
          select a.plan,
                 coalesce(pl.nom, a.plan) as nom,
                 coalesce(pl.prix_xof, 0) as prix_xof,
                 coalesce(pl.duree_jours, 0) as duree_jours,
                 count(*) as actifs
            from public.abonnements a
            left join public.plans_abonnement pl on pl.code = a.plan
           where a.statut = 'actif'
           group by a.plan, pl.nom, pl.prix_xof, pl.duree_jours
        ) t
    ), '[]'::jsonb),

    'actifs_total', (
      select count(*) from public.abonnements where statut = 'actif'
    ),

    -- ---------- mouvements des derniers mois ----------
    -- nouveaux : passages à « actif » ; sorties : passages à
    -- « resilie » ou « expire » (historique, un événement par ligne) ;
    -- encaisse : paiements réussis du mois.
    'par_mois', coalesce((
      select jsonb_agg(jsonb_build_object(
               'periode', m.periode,
               'nouveaux', m.nouveaux,
               'sorties', m.sorties,
               'encaisse', m.encaisse,
               'paiements', m.paiements)
             order by m.periode)
        from (
          with serie as (
            select to_char(date_trunc('month', now())
                           - (n || ' month')::interval, 'YYYY-MM') as periode
              from generate_series(v_mois - 1, 0, -1) as n
          ),
          nouveaux as (
            select to_char(date_trunc('month', h.cree_le), 'YYYY-MM') as periode,
                   count(*) as total
              from public.abonnements_historique h
             where h.statut = 'actif'
             group by 1
          ),
          sorties as (
            select to_char(date_trunc('month', h.cree_le), 'YYYY-MM') as periode,
                   count(*) as total
              from public.abonnements_historique h
             where h.statut in ('resilie', 'expire')
             group by 1
          ),
          encaissements as (
            select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as periode,
                   coalesce(sum(p.montant), 0) as montant,
                   count(*) as total
              from public.paiements p
             where p.statut = 'reussi'
             group by 1
          )
          select s.periode,
                 coalesce(n.total, 0) as nouveaux,
                 coalesce(o.total, 0) as sorties,
                 coalesce(e.montant, 0) as encaisse,
                 coalesce(e.total, 0) as paiements
            from serie s
            left join nouveaux n on n.periode = s.periode
            left join sorties o on o.periode = s.periode
            left join encaissements e on e.periode = s.periode
        ) m
    ), '[]'::jsonb),

    -- ---------- depuis l'origine ----------
    'encaisse_total_xof', (
      select coalesce(sum(montant), 0) from public.paiements where statut = 'reussi'
    )
  );

  return v_resultat;
end $$;

revoke all on function public.admin_stats_revenus(integer) from public, anon;
grant execute on function public.admin_stats_revenus(integer) to authenticated, service_role;


-- ############################################
-- 20261114000002_evenements_webhook.sql
-- ############################################

-- ============================================================
-- Plume d'Ombres — JOURNAL DES LIVRAISONS DE WEBHOOK
-- (vague 2 du tableau de bord).
--
-- Fichier ADDITIF et IDEMPOTENT. Ajoute la table `evenements_webhook`
-- : chaque notification de paiement reçue sur /api/paiement/webhook y
-- est tracée (succès, déjà traité = retente FedaPay, ou échec avec le
-- statut HTTP renvoyé). Objectif : VOIR dans le tableau de bord ce
-- que FedaPay a livré, ce qui a été rejoué et ce qui a échoué — sans
-- fouiller les journaux de l'hébergeur.
--
-- Écriture : uniquement le rôle service (la route webhook). Aucune
-- politique d'insertion : un compte authentifié ne peut RIEN y écrire.
-- Lecture : le SEUL rôle administrateur (RLS public.est_admin()), sur
-- le modèle de public.admin_actions.
--
-- Aucune donnée personnelle : référence interne (PLU-…), nom
-- d'événement, statut HTTP et message d'erreur. Pas de montant, pas
-- de téléphone, pas de courriel.
-- ============================================================

create table if not exists public.evenements_webhook (
  id bigint generated always as identity primary key,
  fournisseur text not null default 'fedapay',
  evenement text,
  reference text,
  statut_http smallint not null default 200,
  traite boolean not null default true,
  deja_traite boolean not null default false,
  erreur text,
  cree_le timestamptz not null default now()
);

create index if not exists evenements_webhook_cree_idx
  on public.evenements_webhook (cree_le desc);
create index if not exists evenements_webhook_reference_idx
  on public.evenements_webhook (reference) where reference is not null;

alter table public.evenements_webhook enable row level security;

-- Lecture réservée aux administrateurs (même esprit que admin_actions).
drop policy if exists "evenements_webhook_select_admin" on public.evenements_webhook;
create policy "evenements_webhook_select_admin" on public.evenements_webhook
  for select using (public.est_admin());

-- Aucune politique d'écriture : seul le rôle service (bypass RLS)
-- insère, depuis la route du webhook.
