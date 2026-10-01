-- ============================================================
-- Plume d'Ombres — Géométrie PDF en base (chantier B2/B3/B5)
--
-- On cesse de stocker le fichier ORIGINAL des livres : le texte
-- est déjà intégralement en base (chapitres.texte_source +
-- segments.source), et la seule information de mise en page
-- nécessaire au « PDF traduit (re-paginé) » tient en 3 nombres.
-- Ils sont mesurés à l'import d'un PDF (fichier alors en mémoire)
-- puis relus à l'export — plus aucun binaire n'est requis.
--
-- Migration IDEMPOTENTE : peut être rejouée sans erreur.
-- ============================================================

alter table public.livres
  add column if not exists pdf_largeur double precision,
  add column if not exists pdf_hauteur double precision,
  add column if not exists pdf_marge   double precision;

comment on column public.livres.pdf_largeur is
  'Largeur de page du PDF importé (points PDF, 1 pt = 1/72 po).';
comment on column public.livres.pdf_hauteur is
  'Hauteur de page du PDF importé (points PDF).';
comment on column public.livres.pdf_marge is
  'Marge d''en-bloc du texte, appliquée aux 4 bords (points PDF).';

-- ------------------------------------------------------------------
-- NETTOYAGE DU BUCKET « originaux » — À EXÉCUTER MANUELLEMENT.
-- Non exécuté par cette migration (fourni pour référence) : le
-- bucket n'est plus alimenté, il peut être vidé puis supprimé.
--
--   delete from storage.objects  where bucket_id = 'originaux';
--   delete from storage.buckets  where id        = 'originaux';
--   -- puis, une fois copie sauvegardée :
--   alter table public.livres drop column if exists fichier_original;
--
-- VOLONTAIREMENT NON TRAITÉ (trop destructif) : la colonne
-- `chapitres.texte_source` (et `segments.source`) reste en place —
-- elle est la source de vérité du texte et sert à l'alignement de
-- l'export fidèle. Une suppression éventuelle fera l'objet d'une
-- décision séparée.
-- ------------------------------------------------------------------
