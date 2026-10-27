-- ============================================================
-- Plume d'Ombres — Réparation de `chapitres.texte_source`
-- 2026-10-27
--
-- Cause : depuis le commit 469a428, `lib/import-livre.ts` n'alimentait
-- plus `ChapitrePret.texte_source` (champ déprécié) ; l'insert de
-- `components/ZoneImport.tsx` envoyait donc `undefined`, et PostgREST
-- OMET la clé → la colonne prenait son défaut SQL '' sans la moindre
-- erreur. Résultat : texte de chapitre vide à l'affichage, compteur de
-- caractères à 0, exports fidèles et glossaire muets.
--
-- Le code est corrigé (champ redevenu REQUIS, réécrit à l'import).
-- Cette migration répare les chapitres DÉJÀ importés : elle reconstitue
-- `texte_source` depuis les segments, qui n'ont jamais cessé d'être
-- écrits, avec la MÊME règle que `public.reconstituer_source()`
-- (concaténation 1:1 `source || suite`, ordonnée par `position`).
--
-- IDEMPOTENTE et NON DESTRUCTIVE :
--   * ne touche QUE les lignes dont `texte_source` est vide ;
--   * n'écrase jamais un texte existant ;
--   * un chapitre sans segment reste inchangé.
-- Rejouable sans effet la deuxième fois.
-- ============================================================

update public.chapitres c
set texte_source = r.texte
from (
  select
    s.chapitre_id,
    coalesce(
      string_agg(coalesce(s.source, '') || coalesce(s.suite, ''), '' order by s.position),
      ''
    ) as texte
  from public.segments s
  group by s.chapitre_id
) r
where r.chapitre_id = c.id
  and coalesce(c.texte_source, '') = ''
  and r.texte <> '';
