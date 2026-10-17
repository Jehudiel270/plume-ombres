# Chantier traduction — 17 octobre 2026 (diagnostic vérifié)

Branche de base : `main` = `5d120fa`. Dépôt : `C:\Users\dosso\dev\dark-romance-w6d`.

## Ce qui est mesuré dans le code, pas supposé

1. **Lenteur — cause structurelle.** Un segment = **une requête HTTP**
   (`POST /api/translate`), et chaque requête paie **trois allers-retours Supabase
   avant toute traduction** :
   - `supabase.auth.getUser()` (réseau),
   - RPC de limitation de débit (`limiterRequete`),
   - RPC de réservation de quota (`reserverQuota`), puis une RPC de libération
     en cas d'échec.
   Le tout avec `CONCURRENCE = 4` et `attendre(80)` après chaque segment
   (`lib/useMoteurTraduction.ts`). Sur un livre de plusieurs milliers de
   segments, ce sont des milliers de requêtes HTTP et ~10 000 RPC.
2. **Erreurs non reprises.** La file est construite **une fois** avec
   `in('statut', ['en_attente','erreur'])`. Un segment qui échoue pendant ce
   passage n'est jamais retenté à la fin : il reste « en erreur » (les 9
   signalés). `MAX_ESSAIS = 3` seulement, avec 1,5 s puis 3 s de backoff.
3. **Persistance impossible en l'état.** Le moteur tourne **dans le
   navigateur** (`'use client'`, `fetch('/api/translate')`). Fermer l'onglet
   annule la file : il n'existe **aucun** exécutant côté serveur
   (aucune route worker, aucune fonction planifiée — `netlify.toml` le dit
   explicitement : « pas de cron / scheduled function »).
4. **Notifications mortes.** `lib/notifications.ts` ne fait que **lire**
   (`.from('notifications')` → `select`). **Aucun `insert` nulle part** : rien
   n'alimente jamais la cloche. Le type `'traduction'` existe déjà.
5. **Compteur de caractères.** Le quota est affiché par `components/JaugeQuota.tsx`
   (page `/abonnement`) et rafraîchi sur `plume:quota-consomme`. Aucun
   compteur n'est affiché **avant** de lancer une traduction, et la jauge ne se
   met à jour qu'après. À corriger : valeur réelle avant lancement + mise à jour
   en direct.
6. **Moteur par défaut.** `TRANSLATOR_DEFAULT=auto`, ordre
   `libretranslate → gemini → google → mymemory`, `LIBRETRANSLATE_URL` pointe
   sur `http://127.0.0.1:5000` (aucune instance) : chaque segment paie d'abord
   une tentative locale inutile, avec un délai maximal de 20 s par moteur.

## Contrat d'API imposé à toute la vague (ne pas le changer seul)

`POST /api/translate/lot` — **nouvelle route**, `/api/translate` reste intacte.

Requête :

```json
{
  "source": "en",
  "cible": "fr",
  "glossaire": [{ "source": "alpha", "traduction": "oméga" }],
  "segments": [
    { "id": "uuid-segment", "texte": "…", "contexte": "…" }
  ]
}
```

Réponse 200 (même en échec partiel) :

```json
{
  "statut": "ok",
  "resultats": [{ "id": "uuid", "traduit": "…", "fournisseur": "gemini", "essais": 1 }],
  "echecs": [{ "id": "uuid", "raison": "limite", "message": "…" }],
  "quota": { "utilise": 0, "limite": 0, "periode": { "debut": "…", "fin": "…" } }
}
```

- `statut` : `ok` | `partiel` | `indisponible`.
- Seuils : **40 segments max** et **20 000 caractères max** par lot, chaque
  segment ≤ 6 000 caractères (au-delà → `raison: "long"`).
- Quota : **une seule** réservation pour la somme des caractères du lot ;
  les caractères des segments échoués sont **libérés**.
- Débit : **un seul** comptage par lot.
- Concurrence interne du serveur : **8 appels moteur en parallèle**.
- Aucun nom de fournisseur n'est exposé dans les messages d'erreur utilisateur.

Le code de traitement doit vivre dans `lib/traduction/lot.ts` :

```ts
export interface SegmentLot { id: string; texte: string; contexte?: string }
export interface ResultatLotSegments { resultats: …; echecs: … }
export async function traiterLotSegments(
  segments: SegmentLot[],
  options: { source: string; cible: string; glossaire?: PaireGlossaire[]; concurrence?: number }
): Promise<ResultatLotSegments>;
```

Le worker de persistance réutilise **cette fonction**, jamais une copie.

## Répartition des trois sous-agents (vague 1)

### Agent A — `trad/serveur-lot` (rapidité serveur)

Fichiers possibles : `app/api/translate/lot/route.ts`, `lib/traduction/lot.ts`,
`lib/traduction/*.test.ts`. **Ne pas** toucher `lib/useMoteurTraduction.ts`,
`components/**`, `netlify.toml`, `supabase/migrations/**`.

1. Extraire l'authentification + débit + quota dans `lib/traduction/lot.ts`
   (une réservation, une libération au prorata).
2. Traduire 8 segments en parallèle dans la route.
3. Ne jamais renvoyer 500 : un segment échoué sort dans `echecs`.
4. Tests `tsx --test` : seuils (41 segments → 400), lot vide, quota libéré sur
   échec, lot partiel, aucun nom de fournisseur dans les messages.

### Agent B — `trad/client-lot` (rapidité perçue + reprise des erreurs)

Fichiers possibles : `lib/useMoteurTraduction.ts`, `components/**`.
**Ne pas** toucher `app/api/**`, `lib/providers/**`, `netlify.toml`,
`supabase/migrations/**`.

1. Consommer `/api/translate/lot` par paquets de 20 segments, 3 lots en
   parallèle, **supprimer** `attendre(80)` et la boucle par segment.
2. Progression juste : `faits`/`erreurs`/`total` comptés par segment, pas par lot.
3. **Reprise automatique** : à la fin du passage, si des segments sont encore en
   erreur, relancer automatiquement **deux passes** (délai 3 s puis 10 s) sans
   aucune action de l'utilisateur. Ce qui échoue encore reste `erreur`.
4. Reprise au montage : si un livre a des segments `en_attente`/`erreur`/
   `en_cours` périmés, la file repart seule.
5. Compteur **avant** traduction : afficher « X segments · Y caractères à
   traduire » dans `CommandesTraduction` avant lancement, et faire vivre la
   jauge de quota pendant la traduction (événement `plume:quota-consomme`).

### Agent C — `trad/persistance-notifs` (survit à la fermeture + cloche)

Fichiers possibles : `app/api/translate/travail/route.ts`,
`netlify/functions/worker-traduction.mts`, `netlify.toml`,
`supabase/migrations/<nouveau>.sql`, `lib/notifications.ts`,
`lib/travaux-traduction.ts`, `components/ClocheNotifications.tsx`.
**Ne pas** toucher `lib/useMoteurTraduction.ts`, `lib/traduction/lot.ts`,
`app/api/translate/lot/**`.

1. Migration `travaux_traduction` : `id`, `livre_id`, `proprietaire_id`,
   `statut` (`en_attente|en_cours|termine|erreur|annule`), `traites`, `total`,
   `erreurs`, `cree_le`, `maj_le`, `battement_le`, RLS « own » + service role.
2. `POST /api/translate/travail` protégé par `CRON_SECRET` : prend le travail le
   plus ancien, traite **un lot** avec `traiterLotSegments`, met à jour les
   compteurs, **retente les segments en erreur** en fin de travail, écrit le
   statut final.
3. Fonction planifiée Netlify `*/1 * * * *` (et `scripts/traiter-travaux.mts`
   pour un déclenchement manuel prouvable).
4. **Notifications** : à la fin d'un travail, `insert` dans `notifications`
   (`type: 'traduction'` en succès, `'erreur'` si échec), avec `titre`, `corps`,
   `lien` vers le livre. Aucun nom de fournisseur.
5. Le client doit pouvoir créer un travail (« Continuer même si je ferme ») :
   exposer `creerTravail()` dans `lib/travaux-traduction.ts` — l'agent B
   l'appellera s'il est présent, sans le modifier.

## Règles de la vague

- Un worktree par agent, créé sur `main` **à jour** (`git log --oneline -1`).
- Validation : `npx tsc --noEmit` et `npx eslint .` **verts** (0 erreur).
  **Ne lancez ni `next build` ni `next dev`** : le build est fait une seule fois
  par l'agent principal après fusion.
- Ne rien pousser. Commits en français, une unité fonctionnelle par commit.
- Aucun nom de fournisseur de traduction visible côté utilisateur.
- Tests réels quand c'est possible (`npx tsx --test`), sinon le dire franchement.
