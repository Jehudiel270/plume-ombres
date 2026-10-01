-- ============================================================
-- C10 — Reprise des segments bloqués en « en_cours » (orphelins)
--
-- Symptôme (prod) : 8 segments restés en « en_cours » (onglet
-- fermé / crash en pleine traduction) ne sont JAMAIS retraités :
-- la file ne lit que « en_attente » / « erreur »
-- (lib/useMoteurTraduction.ts). Résultat : des chapitres marqués
-- « traduit » (ou bloqués en « en_traduction ») avec un trou.
--
-- Idempotente : une seconde exécution ne trouve plus rien à
-- requalifier.
--
-- NB : le statut de reprise d'un SEGMENT est « en_attente » (seul
-- statut « à faire » autorisé par la contrainte CHECK du schéma :
-- en_attente | en_cours | fait | erreur). « a_traduire » est le
-- statut d'un CHAPITRE — d'où l'étape 2 qui requalifie les
-- chapitres à trou en « a_traduire ».
-- ============================================================

-- Index d'appui (idempotent) pour le balayage des segments périmés.
create index if not exists segments_statut_updated_idx
  on public.segments (statut, updated_at);

-- ---------- 1) Segments « en_cours » périmés → file de reprise ----------
-- Au-delà de 10 minutes sans mise à jour, le segment n'est plus
-- réellement en vol (un segment actif est mis à jour en quelques
-- secondes) : on le remet en attente pour qu'il soit repris.
update public.segments
set statut = 'en_attente',
    erreur = null
where statut = 'en_cours'
  and updated_at < now() - interval '10 minutes';

-- ---------- 2) Chapitres « traduit » à trou → a_traduire ----------
-- Un chapitre ne peut être « traduit » que si TOUS ses segments ont
-- un texte cible non vide (source vide = rien à traduire, toléré).
update public.chapitres c
set statut = 'a_traduire'
where c.statut = 'traduit'
  and exists (
    select 1
    from public.segments s
    where s.chapitre_id = c.id
      and not (
        s.statut = 'fait'
        and (
          (s.traduit is not null and btrim(s.traduit) <> '')
          or btrim(s.source) = ''
        )
      )
  );

-- ---------- 3) Chapitres bloqués en « en_traduction » → a_traduire ----------
-- Chapitre en « en_traduction » depuis plus de 10 minutes, dont aucun
-- segment n'est « en_cours » : la traduction est abandonnée (onglet
-- fermé), le chapitre doit redevenir reprenable. Détection volontairement
-- indépendante de l'ordre des étapes (aucun segment en vol), donc
-- idempotente même après l'étape 1.
update public.chapitres c
set statut = 'a_traduire'
where c.statut = 'en_traduction'
  and c.updated_at < now() - interval '10 minutes'
  and not exists (
    select 1
    from public.segments s
    where s.chapitre_id = c.id
      and s.statut = 'en_cours'
  );
