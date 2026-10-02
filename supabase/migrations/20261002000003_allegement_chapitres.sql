-- ============================================================
-- Plume d'Ombres — Allègement des données (chantiers B1 + B10)
-- 2026-10-02
--
-- Objectif : les SEGMENTS (`segments.source` + `segments.suite` +
-- `segments.traduit`) sont la source de vérité UNIQUE du texte.
-- Les colonnes `chapitres.texte_source` et `chapitres.texte_traduit`
-- sont REDONDANTES ; l'estimation de lecture se recalcule depuis les
-- segments. Le bucket `originaux` n'est plus alimenté (vague 1).
--
-- CETTE MIGRATION EST NON DESTRUCTIVE ET IDEMPOTENTE : elle ne fait
-- qu'ajouter des fonctions de reconstruction/métriques et marquer les
-- colonnes dépréciées. La suppression de colonnes / du bucket est
-- fournie EN COMMENTAIRE à la fin (deux temps, jamais ici).
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Métriques par chapitre, calculées depuis les segments.
--    Remplace le comptage sur chapitres.texte_source qui alimentait
--    l'estimation de lecture (app/livres/[id]/page.tsx).
--    SECURITY INVOKER (défaut) : la RLS de l'appelant s'applique.
-- ------------------------------------------------------------------
create or replace function public.metriques_chapitres(p_livre uuid)
returns table (
  chapitre_id uuid,
  pos integer,
  titre text,
  nb_segments bigint,
  caracteres_source bigint,
  caracteres_traduit bigint,
  segments_traduits bigint
)
language sql
stable
as $$
  select c.id,
         c.position as pos,
         c.titre,
         count(s.id),
         coalesce(sum(length(s.source) + length(s.suite)), 0),
         coalesce(sum(length(coalesce(s.traduit, '')) + length(s.suite)), 0),
         count(s.id) filter (where length(coalesce(s.traduit, '')) > 0)
  from public.chapitres c
  left join public.segments s on s.chapitre_id = c.id
  where c.livre_id = p_livre
  group by c.id, c.position, c.titre
  order by c.position;
$$;

comment on function public.metriques_chapitres(uuid) is
  'B1 : métriques d''un livre (nb segments, caractères source/traduit) recalculées depuis les segments — remplace la lecture de chapitres.texte_source / texte_traduit.';

-- ------------------------------------------------------------------
-- 2. Reconstruction du texte d'un chapitre depuis ses segments.
--    Concaténation 1:1 `source || suite` (resp. `traduit || suite`).
-- ------------------------------------------------------------------
create or replace function public.reconstituer_source(p_chapitre uuid)
returns text
language sql
stable
as $$
  select coalesce(
    string_agg(s.source || s.suite, '' order by s.position),
    ''
  )
  from public.segments s
  where s.chapitre_id = p_chapitre;
$$;

comment on function public.reconstituer_source(uuid) is
  'B1 : texte source normalisé d''un chapitre, reconstruit depuis les segments (equals normaliserSouple(texte_source)).';

create or replace function public.reconstituer_traduit(p_chapitre uuid)
returns text
language sql
stable
as $$
  select case
    when coalesce(
      sum(case when length(coalesce(s.traduit, '')) > 0 then 1 else 0 end), 0
    ) = 0 then null
    else string_agg(coalesce(s.traduit, '') || s.suite, '' order by s.position)
  end
  from public.segments s
  where s.chapitre_id = p_chapitre;
$$;

comment on function public.reconstituer_traduit(uuid) is
  'B1 : traduction assemblée d''un chapitre, reconstruite depuis les segments (null si aucun segment traduit).';

-- ------------------------------------------------------------------
-- 3. Marquage des colonnes redondantes (documentation en base).
-- ------------------------------------------------------------------
comment on column public.chapitres.texte_source is
  'DEPRECATED (B1, 2026-10-02) : redondant avec segments (concat(source||suite)). Plus écrit à l''import ; ne plus lire. Suppression en deux temps (cf. migration allegement).';
comment on column public.chapitres.texte_traduit is
  'DEPRECATED (B1, 2026-10-02) : redondant avec segments (concat(traduit||suite)). Ne plus lire ; suppression en deux temps.';
comment on column public.livres.fichier_original is
  'DEPRECATED (B2/B10) : plus alimenté depuis la vague 1 ; bucket « originaux » à purger.';

-- ==================================================================
-- PARTIE DESTRUCTIVE — NON EXÉCUTÉE. À LANCER PLUS TARD, EN DEUX
-- TEMPS, JAMAIS VIA CETTE MIGRATION. Chiffres réels de production au
-- 2026-10-02 (scripts/audit-allegement.mjs).
--
-- ÉTAPE 2a — `chapitres.texte_traduit` (2,89 Mo) : supprimable dès
--   maintenant. Preuve : 69/69 chapitres traduits reconstruits à
--   l'identique depuis les segments (md5), 0 écart.
--     -- alter table public.chapitres drop column if exists texte_traduit;
--
-- ÉTAPE 2b — `chapitres.texte_source` (4,17 Mo) : PRÉREQUIS AVANT DROP.
--   (1) BACKFILL DES SEGMENTS pour les 5 chapitres SANS AUCUN segment
--       (2 livres « Nuit d'Autremonde » : 90 363 o + 512 o) — sans
--       quoi supprimer la colonne détruirait leur seul texte.
--       Utiliser scripts/migrer-allegement.mjs (--plan puis --apply).
--   (2) EXPORT « PDF — mise en page d'origine » : l'alignement exact
--       (pdf-fidele.ts : flux.indexOf(texte_source)) exige le sous-texte
--       BRUT du flux d'import ; il doit être recâblé sur le flux EN
--       MÉMOIRE de la session d'import avant de supprimer la colonne.
--     -- alter table public.chapitres drop column if exists texte_source;
--
-- ÉTAPE 2c — bucket « originaux » (B10) : 8 objets, 12,39 Mo,
--   6 livres.fichier_original renseignés. Plus alimenté depuis la
--   vague 1. À purger APRÈS sauvegarde :
--     -- delete from storage.objects where bucket_id = 'originaux';
--     -- delete from storage.buckets where id        = 'originaux';
--     -- alter table public.livres drop column if exists fichier_original;
--
-- GAIN TOTAL MESURÉ (2a+2b+2c colonnes) = texte_source + texte_traduit
--   = 7 402 748 o ≈ 7,06 Mo, plus 12,39 Mo de stockage d'objets.
-- ==================================================================
