# Fiche module 8 — Aide à la reprise (F10) et questions (F6)

Date : 12/11/2026 · Branche : `fonctionnalite/assistance-lecture` ·
Code : **F6/F10** · Effort : M · Risque juridique : aucun ·
Abonnement : **Premium (Passionné et au-delà)** — maquette FEATURES.md :
« F6, F10 | Questions anti-spoilers, résumé à la reprise | panneaux du
lecteur | Premium ».

## Ce que le lecteur reçoit

Un bouton « Reprise » dans la barre d'outils du lecteur (monté seulement si
l'interrupteur est ouvert et le plan suffisant — décision CÔTÉ SERVEUR) qui
ouvre deux outils :

1. **Où en étiez-vous (F10)** — un résumé discret de l'intrigue lue (150 mots
   max), pour reprendre sans replonger dans les chapitres passés. Mis en
   CACHE par livre (`resume_lectures`) : régénéré seulement quand la lecture
   avance (économie d'appels), bouton « Rafraîchir ».
2. **Question sur l'intrigue (F6)** — « Qui est… ? Pourquoi… ? » : la réponse
   s'appuie UNIQUEMENT sur les chapitres déjà lus ; si la lecture ne l'a pas
   encore révélé, l'aide le dit mot pour mot. Les questions ne sont pas
   conservées.

## ANTI-SPOILERS PAR CONSTRUCTION (la garantie principale)

Le contexte envoyé au modèle est construit CÔTÉ SERVEUR
(`chargerContexteLu`) avec les SEULS chapitres de position ≤ chapitre lu —
le modèle ne reçoit JAMAIS la suite, donc ne peut pas la révéler. La garde
est structurelle, pas une consigne : même si le modèle « voulait » spoiler,
il n'a pas le texte. Plafonds : 60 000 caractères pour le résumé, 40 000
pour une question (la FIN des chapitres lus prime), question ≤ 500 caractères.

## Modèle

Même clé, mêmes modèles et même délai que la traduction
(`lib/providers/gemini.ts`) : bascule automatique sur le modèle suivant en
cas d'indisponibilité (404/429/503) ou de silence. Aucune nouvelle clé,
aucun nouveau fournisseur. `maxDuration = 60` sur la route (appels modèle).

## Données (migration ADDITIVE, idempotente)

`20261112000005_resume_lectures.sql` — table de cache `resume_lectures` :
livre (PK, CASCADE), jusqu_position (CHECK ≥ 0), titre_chapitre, contenu
(CHECK 1–8 000), moteur, horodatages. RLS « own » complète. Les questions ne
sont stockées nulle part.

## Garde-fous (le serveur est l'autorité)

- API `/api/livres/[id]/assistance` (POST) : session 401, interrupteur
  `reprise` éteint → 404, plan insuffisant → 403, UUID validé, position lue
  bornée (entier ≥ 0) ; erreurs modèle → 502 avec message lisible.
- Registre : entrée `reprise` (F6/F10), api `['/api/livres/*/assistance']`,
  planMinimal `passionne`, `prod: false`. `check:flags` : 17 interrupteurs,
  29 pages, 27 routes, toutes couvertes.

## Tests et vérifications

- `lib/assistance.test.ts` : 3/3 — garde amont « rien lu → pas d'appel
  réseau », question trop courte refusée avant le modèle, plafonds bornés.
- Suite complète 222/222, `check:flags` OK, build OK (33/33 pages).
- Limites assumées : le résumé suit la traduction (un livre non traduit
  retombe sur le texte source) ; l'appel modèle coûte des crédits d'API
  Gemini — d'où le cache et le plan Premium ; pas de résumé « au fil de
  l'eau » à chaque changement de chapitre (à la demande uniquement).
