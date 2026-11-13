# Fiche module 9 — XP, rangs et badges (A17)

Date : 12/11/2026 · Branche : `fonctionnalite/progression` · Code : **A17** ·
Effort : M · Risque juridique : aucun · Abonnement : **gratuit** (un badge
« exclusif » cosmétique pour les abonnés, sans pouvoir ni déblocage).

## Non punitif PAR CONCEPTION

- L'XP ne baisse JAMAIS (aucune ligne supprimée, aucun malus).
- Aucun classement entre comptes, aucune page publique, aucune relance.
- L'XP vient de la DÉCOUVERTE d'un chapitre : **une seule fois par
  chapitre** (UNIQUE en base, upsert `ignoreDuplicates`) — relire ne
  rapporte rien, et surtout ne retire rien. Anti-farming par design.
- Les badges sont des souvenirs d'usage, jamais des objectifs manipula-
 teurs (pas de « streak », pas de pénalité d'absence).

## Livré

1. **API `/api/progression`** — POST `{livreId, chapitreId}` (XP de
   découverte, idempotent, renvoie le résumé) ; GET (résumé). Gardes :
   session 401, interrupteur 404/403, RLS « own ».
2. **Page `/progression`** — rang courant + jauge discrète, grille des
   badges-souvenirs (obtenus en velours, verrouillés estompés avec leur
   condition), les douze rangs avec leurs seuils.
3. **Envoi depuis le lecteur** — au chargement d'un chapitre, EspaceLivre
   envoie l'XP (fire-and-forget silencieux) SEULEMENT si l'interrupteur
   est ouvert (aucun appel réseau sinon).
4. **Règle pure et testée** (`lib/xp.ts`) : 12 rangs (« Encre pâle » →
   « Maître du seuil », seuils 0 → 6 500 XP, 25 XP/chapitre), 10 badges
   (chapitres, carnet, théories, graphes, traduction complète, 1
   exclusif-abonnés cosmétique), jauge bornée 0 → 1.

## Données (migration ADDITIVE, idempotente)

`20261112000006_progression_xp.sql` — `lectures_xp` (UNIQUE utilisateur+
chapitre, xp 1–100, CASCADE livres/chapitres, RLS own select+insert) ;
`badges_obtenus` (UNIQUE utilisateur+code, RLS own select+insert — la
table prépare l'attribution persistante ; en v1 les badges sont recalculés
des compteurs, sans écriture).

## Garde-fous et registre

- Page : `verifierAccesModule('progression')` — fermé → 404.
- Registre : entrée `progression` (A17) mise à jour —
  api `['/api/progression']`. check:flags : 17 interrupteurs / 30 pages /
  28 routes.
- Le badge exclusif n'obéit qu'au plan d'abonnement (cosmétique) — testé.

## Tests et vérifications

- `lib/xp.test.ts` : 6/6 (seuils croissants, rangs bornés, jauge,
  badges par compteurs, exclusif = plan seulement, table fermée).
- Build OK (34/34 pages).
- Limites assumées : badges v1 recalculés (l'attribution persistante et
  les notifications « badge obtenu » viendront plus tard) ; l'XP suit
  l'ouverture du chapitre, pas le temps de lecture (volontairement —
  aucun encouragement à laisser une page ouverte).
