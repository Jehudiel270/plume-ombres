# Sauvegarde et restauration de la base — Plume d'Ombres (P1.7)

> Supabase **Free ne fournit AUCUNE sauvegarde automatique**. Ce document décrit
> la procédure reproductible **réellement exécutée et vérifiée** dans ce dépôt,
> avec les commandes exactes et la preuve chiffrée.

## 1. Méthode testée (recommandée ici)

Un script Node utilise la connexion PostgreSQL directe (pooler Supabase) :
aucun outil externe n'est nécessaire — `pg_dump`/`pg_restore` **ne sont pas
installés** sur ce poste (vérifié : `which pg_dump pg_restore` → introuvable).

### Sauvegarde

```bash
node scripts/sauvegarde-db.mjs sauvegarde
```

Produit `sauvegardes/plume-<horodatage>.sql` : un `insert into "table"
(colonnes) values (...);` par ligne, **16 tables clés** :

`profiles, livres, chapitres, segments, glossaires, glossaire_entrees, favorites,
lecture_progression, lecture_journal, usage_mensuel, plans_abonnement,
abonnements, abonnements_historique, paiements, admin_actions, journal_traduction`

Les horodatages sont dumpés **en texte depuis PostgreSQL** (`colonne::text`) pour
conserver la **microseconde** exacte : une conversion via JavaScript ne garde que
la milliseconde et produirait une restauration non fidèle.

### Restauration vérifiée (schéma jetable)

```bash
node scripts/sauvegarde-db.mjs restauration-test sauvegardes/plume-<horodatage>.sql
```

Crée le schéma **`sauvegarde_test`**, y recrée les tables (`like public.<table>`),
rejoue le fichier (`search_path` = schéma jetable — les inserts ne sont **pas**
qualifiés, aucune réécriture de texte n'est faite), puis compare pour chaque table
le nombre de lignes **et une empreinte MD5 du contenu** (`md5(string_agg(t::text,
E'\n' order by t::text))`) entre `public` et le schéma jetable. Si tout est
identique, le schéma est supprimé. En cas d'écart, le script sort en code 1.

### Restauration en production (schéma `public`)

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -c "set search_path to public" \
  -f sauvegardes/plume-<horodatage>.sql
```

> ⚠ Les inserts ciblent des tables **non qualifiées** : le `search_path` doit
> impérativement valoir `public`. Ne jamais exécuter ce fichier avec un autre
> `search_path` sans intention.

## 2. Preuve d'exécution (mesurée le 2026-10-02)

| Étape | Résultat réel |
|---|---|
| Sauvegarde | `sauvegardes/plume-2026-10-02T08-52-10.sql` — **16 317 823 octets (15,56 Mo)**, **12 768 lignes** |
| Restauration | schéma `sauvegarde_test` — **16/16 tables**, empreintes **identiques**, **23 486 ms** |
| Fichier de preuve | `preuves/sauvegarde-rapport.json` (aucun texte de livre : noms de tables + comptages + empreintes) |
| Capture | `preuves/sauvegarde-execution.png` (rapport rendu en HTML puis capturé par Edge headless) |

Détail des tables restaurées (source = restauré) : `profiles` 13 = 13,
`livres` 15 = 15, `chapitres` 213 = 213, `segments` **12 506 = 12 506**,
`favorites` 1 = 1, `plans_abonnement` 13 = 13, `abonnements` 3 = 3,
`abonnements_historique` 4 = 4, les autres 0 = 0 — **empreinte MD5 identique pour
les 16 tables**.

Reproduire la preuve :

```bash
node scripts/sauvegarde-db.mjs sauvegarde
node scripts/sauvegarde-db.mjs restauration-test "$(ls -t sauvegardes/*.sql | head -1)"
```

## 3. Ce que la sauvegarde ne couvre PAS

- La **structure** (DDL) : elle est déjà versionnée dans
  `supabase/migrations/*.sql` et rejouable avec
  `npx tsx scripts/appliquer-sql.ts <fichier.sql>`.
- `auth.users` et `storage.objects` (gérés par Supabase). Après restauration,
  recréer les comptes auth si nécessaire : les lignes `public.profiles` pointent
  vers `auth.users(id)`.
- Le bucket `originaux` (plus alimenté — voir la migration d'allègement).

## 4. Sécurité du fichier de sauvegarde

- `sauvegardes/` est **ignoré par git** (`.gitignore`) : la sauvegarde contient
  le **texte intégral des livres** (segments). Ne jamais la committer, ni la
  partager sans la **chiffrer** (ex. `age`, `gpg`, archive ZIP à mot de passe).
- `preuves/sauvegarde-rapport.json` et les captures ne contiennent **aucun texte
  de livre** (noms de tables, comptages, empreintes uniquement) : ils peuvent
  être versionnés.

## 5. Automatisation (cron externe)

Exemple d'appel quotidien (hôte disposant de Node et d'un accès sortant au pooler) :

```cron
0 3 * * *  cd /srv/plume && node scripts/sauvegarde-db.mjs sauvegarde \
             && node scripts/sauvegarde-db.mjs restauration-test \
                  "$(ls -t sauvegardes/*.sql | head -1)" && ls -t sauvegardes/*.sql | tail -n +8 | xargs rm -f
```

Conserver 7 sauvegardes (purge au-delà), et déposer une copie chiffrée hors du
poste. Surveiller l'échec avec le point d'état machine `GET /api/sante`.

## 6. Alternative outillée (si `pg_dump` est disponible)

Sur un poste où les clients PostgreSQL sont installés, `pg_dump` reste la méthode
la plus complète (DDL + données) :

```bash
pg_dump "postgresql://postgres.<ref>:<mdp>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
  --no-owner --no-privileges --format=custom -f sauvegardes/plume.dump
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "postgresql://...@.../postgres" sauvegardes/plume.dump
```

Non retenu ici : `pg_dump`/`pg_restore` sont **absents** de cette machine, donc la
procédure ci-dessus n'a **pas** pu être testée — la méthode testée est celle du §1.
