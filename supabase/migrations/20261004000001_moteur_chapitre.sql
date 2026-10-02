-- ============================================================
-- 20261004000001_moteur_chapitre.sql — Moteur de traduction
-- ayant RÉELLEMENT servi pour chaque chapitre.
--
-- Idempotente. Ajoute une colonne nullable, sans toucher aux
-- politiques RLS existantes (mêmes règles « propriétaire »).
-- Valeurs possibles : 'libretranslate' | 'gemini' | 'google' |
-- 'mymemory' (identifiants techniques ; jamais affichés à
-- l'utilisateur final).
-- ============================================================

alter table public.chapitres
  add column if not exists moteur_traduction text;

comment on column public.chapitres.moteur_traduction is
  'Identifiant du moteur de traduction dominant ayant servi ce chapitre (traçabilité interne ; non exposé à l''utilisateur).';
