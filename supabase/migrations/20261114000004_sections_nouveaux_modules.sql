-- ============================================================
-- Plume d'Ombres — SECTIONS DÉLÉGABLES : NOUVEAUX MODULES.
-- 2026-11-14
--
-- Le tableau de bord compte deux onglets de plus depuis la vague
-- « clés d'API » : « Clés API » (réservoir multi-fournisseurs) et
-- « Fonctionnalités » (interrupteurs des modules du chantier).
-- Ces deux zones échappaient au mécanisme de délégation par
-- sections : elles n'apparaissaient pas dans les cases du panneau
-- « Sections ouvertes aux administrateurs » et n'étaient filtrées
-- que par la permission admin.fonctionnalites.gerer.
--
-- Cette migration ajoute les sections `cles_api` et `fonctionnalites`
-- à la source de vérité côté base. Les fonctions mes_sections() et
-- definir_sections_admin() s'appuient sur sections_admin_connues()
-- : elles couvrent les nouvelles valeurs sans autre modification.
--
-- Rappel du comportement (inchangé) :
--   * super-administrateur → toujours toutes les sections ;
--   * administrateur sans ligne dans admin_sections → toutes les
--     sections (aucune régression pour les admins déjà nommés) ;
--   * administrateur AVEC une ligne → seule la liste enregistrée :
--     les nouveaux onglets restent fermés tant que le super-admin
--     ne coche pas les nouvelles cases (comportement voulu).
--
-- Migration STRICTEMENT ADDITIVE et IDEMPOTENTE.
-- ============================================================

-- ---------- 1. Source de vérité : liste des sections ----------
create or replace function public.sections_admin_connues()
returns text[]
language sql
immutable
as $$
  select array[
    'comptes', 'abonnements', 'paiements', 'audience',
    'systeme', 'notifications',
    'cles_api', 'fonctionnalites'
  ]::text[];
$$;

-- ---------- 2. Contrainte CHECK alignée sur la fonction ----------
-- La contrainte appelle la fonction (IMMUTABLE) : les prochaines
-- sections n'exigeront plus de retoucher la table.
alter table public.admin_sections
  drop constraint if exists admin_sections_connues;

alter table public.admin_sections
  add constraint admin_sections_connues check (
    sections <@ public.sections_admin_connues()
  );

comment on constraint admin_sections_connues on public.admin_sections is
  'Seules les sections connues (public.sections_admin_connues()) sont délégables.';
