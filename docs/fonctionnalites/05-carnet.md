# Fiche module 5 — Carnet de lecture

Date : 12/11/2026 · Branche : `fonctionnalite/carnet` · Code : **F2** (maquette
FEATURES.md : « F2, idée 6 — Carnet, surlignage, citations, hypothèses,
gratuit ») · Effort : M · Risque juridique : aucun · Abonnement : lecture et
écriture GRATUITES, **export réservé aux abonnés (F24, Passionné et au-delà)**.

## Problème du lecteur

Pendant la lecture d'un chapitre traduit, le lecteur veut retenir un passage
(citation, surlignage) et y accrocher sa pensée (note, hypothèse). Rien de tout
cela n'existait : les annotations partaient dans des apps tierces, hors de
l'atelier.

## Livré

1. **Depuis le lecteur** — bouton « Carnet » dans la barre d'outils du chapitre
   (monté seulement si l'interrupteur est ouvert, évalué côté serveur). La
   SÉLECTION courante est reprise comme extrait (type Citation par défaut),
   une note libre accompagne toujours ; sans sélection, la note seule suffit.
2. **Page `/carnet`** — filtres (livre, type), liste des entrées (extrait cité
   en exergue, annotation, chapitre, date), annotation modifiable, suppression.
3. **Export portable (F24)** — Markdown ou JSON, téléchargé depuis le
   navigateur. RÈGLE ABSOLUE conservée de la maquette : l'export ne contient
   JAMAIS le texte intégral — uniquement les extraits plafonnés à 800
   caractères et les notes du lecteur, avec attribution du livre. **L'export
   est réservé aux abonnés** : la décision (`exportAutorise`) est calculée
   CÔTÉ SERVEUR (hiérarchie des plans, Passionné et au-delà) — jamais côté
   client. Les comptes gratuits voient l'invite vers /tarifs.

## Données (migration ADDITIVE, idempotente)

`20261112000002_carnet_notes.sql` — table `carnet_notes` : livre (CASCADE),
chapitre (SET NULL, titre conservé en texte), type (`note | citation |
surlignage`), extrait (CHECK ≤ 800 caractères), annotation (≤ 4 000), created/
updated_at, CHECK « au moins un contenu ». RLS « own » complète (select /
insert / update / delete via livres.proprietaire_id), index (livre_id,
created_at desc).

## Garde-fous (le serveur est l'autorité)

- Page `/carnet` : `verifierAccesModule('carnet')` — fermé → 404.
- API `/api/carnet` (POST/PATCH/DELETE) : session 401, module fermé 404, plan
  insuffisant 403 ; UUID validés ; extraits plafonnés par lib/carnet ; RLS
  « own » protège chaque lecture et écriture.
- Registre : entrée `carnet` (F2) ajoutée ; `ORDRE_PLAN` exporté pour les
  gardes fines d'abonnement hors interrupteur.

## Tests et vérifications

- `lib/carnet.test.ts` : 6/6 (plafonds avec ellipse, libellés, export MD
  groupé par type, carnet vide, garde « rien à écrire »).
- Suite ciblée, `npm run build` : OK (32/32 pages, /carnet et /api/carnet
  présentes). `check:flags` passe à l'état du module suivant (l'API
  d'assistance, livrée juste après, est présente sur disque avant sa fiche —
  vérifié vert au merge du module 8).
- Limites assumées : le surlignage est enregistré comme EXTRAIT (pas encore
  re-affiché en surbrillance dans le lecteur — v2 si demandé) ; l'export PDF
  de la maquette n'est pas repris (MD et JSON suffisent, PDF déjà dédié aux
  exports du lecteur).
