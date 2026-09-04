// Tests des favoris — logique pure + vérifications SQL réelles (DB hébergée).
// Usage : npx tsx scripts/test-favoris.ts
//
// Parties :
//  A. Logique pure (lib/favoris.ts) : assainirFavorites, estFavorite, toggle.
//  B. SQL réel : la table public.favorites existe (pg_tables), RLS activé,
//     les 4 policies existent (pg_policies), contraintes FK/unique.
//  C. RLS fonctionnel : si un utilisateur avec un livre existe dans
//     auth.users, on se place dans la position exacte du rôle `authenticated`
//     (claim JWT sub = id du compte) : insert → visible du propriétaire,
//     invisible/refusée pour un tiers → delete. Sinon on documente : la
//     structure (table + RLS + policies) est vérifiée au niveau pg.
//
// Hygiène de données : le test NE SUPPRIME QUE LES LIGNES QU'IL A
// INSÉRÉES (insert ... on conflict do nothing, suivi d'un delete ciblé).
// Une ligne préexistante du couple (propriétaire, livre) est conservée.

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import {
  assainirFavorites,
  estFavorite,
  toggle,
  remplacerLigne,
} from '../lib/favoris';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ============================================================
// A. Logique pure
// ============================================================
console.log('\n— A. Logique pure (lib/favoris.ts) —');

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const LIGNE_A = {
  id: UUID_A,
  proprietaire_id: '99999999-9999-9999-9999-999999999999',
  livre_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  created_at: '2026-09-04T12:00:00Z',
};
const LIGNE_B = {
  id: UUID_B,
  proprietaire_id: '99999999-9999-9999-9999-999999999999',
  livre_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  created_at: '2026-09-04T13:00:00Z',
};

// assainirFavorites
const propres = assainirFavorites([LIGNE_A, LIGNE_B]);
verifier('assainir : 2 lignes valides', propres.length === 2);
verifier(
  'assainir : champ livreId/creeLe mappés',
  propres[0].livreId === LIGNE_A.livre_id && propres[0].creeLe === LIGNE_A.created_at
);
verifier(
  'assainir : non-tableau → []',
  assainirFavorites(null).length === 0 &&
    assainirFavorites('x').length === 0 &&
    assainirFavorites(undefined).length === 0
);
verifier(
  'assainir : lignes mal formées écartées',
  assainirFavorites([
    LIGNE_A,
    null,
    { id: 'pas-un-uuid', livre_id: 'nope', created_at: '' },
    { id: UUID_A }, // livre_id absent
    { id: UUID_A, livre_id: UUID_B }, // created_at absent
  ]).length === 1
);
verifier(
  'assainir : doublon livre_id déduplicé',
  assainirFavorites([LIGNE_A, { ...LIGNE_A, created_at: '2026-09-05T00:00:00Z' }]).length === 1
);

// estFavorite (liste de Favori validés — après assainissement)
verifier(
  'estFavorite : vrai quand présent',
  estFavorite(assainirFavorites([LIGNE_A]), LIGNE_A.livre_id)
);
verifier(
  'estFavorite : faux quand absent / liste vide',
  !estFavorite(assainirFavorites([LIGNE_A]), 'cccccccc-cccc-cccc-cccc-cccccccccccc') &&
    !estFavorite([], LIGNE_A.livre_id)
);

// toggle (pur, non-mutant)
const liste = assainirFavorites([LIGNE_A]);
const refOriginale = liste;
const ajoute = toggle(liste, LIGNE_B.livre_id);
verifier(
  'toggle : ajout produit une liste étendue sans muter l’originale',
  ajoute.length === 2 && refOriginale.length === 1 && liste.length === 1
);
verifier(
  'toggle : pureté — l’originale garde sa seule ligne',
  liste.every((f) => f.id === UUID_A) && liste !== ajoute
);
const retire = toggle(ajoute, LIGNE_A.livre_id);
verifier(
  'toggle : retrait supprime la ligne correspondante',
  retire.length === 1 && retire[0].livreId === LIGNE_B.livre_id
);
const reAjout = toggle(ajoute, LIGNE_B.livre_id);
verifier('toggle : double toggle retourne au départ', reAjout.length === 1 && reAjout[0].id === UUID_A);

// remplacerLigne (lignes temporaires → lignes réelles du serveur)
// NB : la fonction reçoit la ligne BRUTE du serveur (clé livre_id),
// comme dans le hook après `.select()`.
const provisoire = toggle(assainirFavorites([LIGNE_A]), LIGNE_B.livre_id, 'temp-x');
const definitif = remplacerLigne(provisoire, 'temp-x', LIGNE_B);
verifier(
  'remplacerLigne : la ligne temporaire est remplacée par la ligne réelle',
  definitif.length === 2 &&
    definitif.find((f) => f.livreId === LIGNE_B.livre_id)?.id === UUID_B
);

// ============================================================
// B + C. Requête SQL réelle
// ============================================================
function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable dans .env.local`);
  return ligne.split('=').slice(1).join('=').trim();
}

async function partieSql() {
  console.log('\n— B. SQL réel : structure de public.favorites —');
  const client = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connecté ✓');

  // B.1 Table présente.
  const t = await client.query(
    "select 1 from pg_tables where schemaname = 'public' and tablename = 'favorites'"
  );
  verifier('table public.favorites existe (pg_tables)', t.rowCount === 1);

  // B.2 RLS activé sur la table.
  const rls = await client.query(
    "select relrowsecurity from pg_class where oid = 'public.favorites'::regclass"
  );
  verifier('RLS activé sur favorites', rls.rows[0]?.relrowsecurity === true);

  // B.3 Les 4 policies attendues (même modèle que public.livres).
  const pol = await client.query(
    "select policyname from pg_policies " +
      "where schemaname = 'public' and tablename = 'favorites' order by policyname"
  );
  const attendues = [
    'favoris_delete_own',
    'favoris_insert_own',
    'favoris_select_own',
    'favoris_update_own',
  ];
  const obtenues = pol.rows.map((r) => r.policyname as string);
  verifier(
    '4 policies favorites_*_own présentes (pg_policies)',
    attendues.every((n) => obtenues.includes(n)),
    `obtenues : ${obtenues.join(', ') || 'aucune'}`
  );
  verifier(
    'aucune policy parasite sur favorites',
    pol.rows.length === attendues.length,
    `${pol.rows.length} trouvée(s)`
  );

  // B.4 Contrainte d'unicité : index unique sur (proprietaire_id, livre_id)
  //     (la syntaxe `unique (a, b)` crée un index unique, pas une
  //     pg_constraint dédiée — on vérifie donc côté pg_indexes).
  const unique = await client.query(
    "select 1 from pg_indexes where schemaname = 'public' and tablename = 'favorites' " +
      "and indexdef ilike '%proprietaire_id%livre_id%'"
  );
  verifier('index unique (proprietaire_id, livre_id)', unique.rowCount === 1);

  // B.5 Clé étrangère livre_id → livres(id) on delete cascade.
  const fk = await client.query(
    "select confdeltype from pg_constraint " +
      "where conname = 'favorites_livre_id_fkey'"
  );
  verifier(
    'FK favorites.livre_id → public.livres (cascade)',
    fk.rowCount === 1 && fk.rows[0]?.confdeltype === 'c'
  );

  // B.6 Définitions des policies : verrouillées sur auth.uid() = proprietaire_id
  //     (on utilise la vue pg_policies : colonnes texte qual/with_check prêtes).
  const defs = await client.query(
    "select policyname, qual, with_check from pg_policies " +
      "where schemaname = 'public' and tablename = 'favorites'"
  );
  verifier(
    'policies verrouillées sur auth.uid() = proprietaire_id',
    defs.rows.length === 4 &&
      defs.rows.every(
        (r) =>
          ((r.qual as string) || (r.with_check as string) || '').includes('auth.uid()') &&
          ((r.qual as string) || (r.with_check as string) || '').includes('proprietaire_id')
      )
  );

  // Diagnostic du rôle connecté (le pooler donne un rôle clone : on
  // vérifie s'il peut SET ROLE authenticated pour le test fonctionnel).
  const roleInfo = await client.query(
    "select current_user as u, (select rolsuper from pg_roles where rolname = current_user) as su, " +
      "(select rolbypassrls from pg_roles where rolname = current_user) as bypass"
  );
  const { u, su, bypass } = roleInfo.rows[0] as { u: string; su: boolean; bypass: boolean };
  console.log(`· Rôle connecté : ${u} (superuser=${su}, bypassrls=${bypass})`);

  // C. RLS fonctionnel (si un utilisateur avec un livre existe).
  console.log('\n— C. RLS fonctionnel —');
  const users = await client.query(
    `select u.id, count(l.id) as nb
       from auth.users u
       left join public.livres l on l.proprietaire_id = u.id
      group by u.id
      order by u.created_at`
  );
  const candidat = (users.rows.find((r) => Number(r.nb) > 0) || null) as
    | { id: string; nb: string }
    | null;

  if (!candidat) {
    console.log(
      '· Aucun utilisateur avec un livre dans auth.users : impossible de ' +
        'simuler une session utilisateur. Vérification effectuée au niveau ' +
        'pg : table + RLS + 4 policies + contraintes. Le comportement ' +
        'fonctionnel sera exercé au premier compte réel.'
    );
    await client.end();
    return;
  }
  console.log(`· Compte test trouvé (${candidat.id.slice(0, 8)}…) avec ${candidat.nb} livre(s).`);

  const tiers = '00000000-0000-0000-0000-000000000000';
  const livre = await client.query(
    'select id from public.livres where proprietaire_id = $1 limit 1',
    [candidat.id]
  );
  const livreId = livre.rows[0].id as string;

  // Placer la session exactement comme l'API le fait pour un visiteur
  // authentifié : claim JWT sub = id utilisateur (les deux GUC vues par
  // auth.uid()). is_local=true : scope transaction.
  async function claim(sub: string) {
    // auth.uid() lit, dans l'ordre : le claim plat request.jwt.claim.sub,
    // sinon le JSON request.jwt.claims->>sub. On pose les deux.
    // Les deux paramètres sont des arguments texte de set_config :
    // le typage est déduit proprement (contrairement à $1 dans
    // json_build_object, où Postgres renvoie « could not determine data
    // type of parameter $1 »).
    const claims = JSON.stringify({ sub });
    await client.query(
      `select set_config('request.jwt.claims', $1, true), ` +
        `set_config('request.jwt.claim.sub', $2, true)`,
      [claims, sub]
    );
  }

  // Diagnostics : définition réelle de auth.uid() sur l'instance + rôle.
  const defsAuth = await client.query(
    "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid'"
  );
  if (defsAuth.rowCount) console.log(`· auth.uid() = ${defsAuth.rows[0].pg_get_functiondef}`);

  let setRoleOk = true;
  try {
    await client.query('begin');
    await claim(candidat.id);
    try {
      await client.query('set role authenticated');
    } catch (e) {
      setRoleOk = false;
      console.warn(`· SET ROLE impossible (${(e as Error).message}) — le test ` +
        'fonctionnel est documenté, la structure est vérifiée au niveau pg.');
      await client.query('rollback');
    }

    if (setRoleOk) {
      try {
        // C.1 Insert via la policy (auth.uid() = proprietaire_id).
        // on conflict do nothing : si un favori réel existe déjà pour ce
        // couple, on le réutilise SANS l'écraser ( rowCount = 0 ).
        const ins = await client.query(
          `insert into public.favorites (livre_id) values ($1) ` +
            `on conflict (proprietaire_id, livre_id) do nothing returning id`,
          [livreId]
        );
        const insereParNous = (ins.rowCount as number) === 1;
        const idLigne: string = ins.rowCount
          ? (ins.rows[0].id as string)
          : (
              await client.query(
                'select id from public.favorites where proprietaire_id = $1 and livre_id = $2',
                [candidat.id, livreId]
              )
            ).rows[0].id;
        verifier(
          insereParNous
            ? 'insert favori réussi (policy insert_own)'
            : 'ligne préexistante réutilisée (pas d’écrasement)',
          !!idLigne
        );

        // C.2 Select comme PROPRIÉTAIRE : la ligne est visible.
        const selProp = await client.query(
          'select id from public.favorites where proprietaire_id = $1 and livre_id = $2',
          [candidat.id, livreId]
        );
        verifier(
          'RLS : le propriétaire voit sa ligne',
          selProp.rowCount === 1 && selProp.rows[0].id === idLigne
        );

        // C.3 Même requête, claim d'UN TIERS : RLS doit cacher la ligne.
        await claim(tiers);
        const selTiers = await client.query(
          'select id from public.favorites where proprietaire_id = $1 and livre_id = $2',
          [candidat.id, livreId]
        );
        verifier('RLS : un tiers ne voit PAS le favori du propriétaire', selTiers.rowCount === 0);

        // C.4 Le tiers ne peut pas non plus SUPPRIMER la ligne.
        const delTiers = await client.query(
          `delete from public.favorites where proprietaire_id = $1 and livre_id = $2 returning id`,
          [candidat.id, livreId]
        );
        verifier('RLS : delete par un tiers refusé (0 ligne supprimée)', delTiers.rowCount === 0);

        // C.5 Retour propriétaire : delete de la ligne (uniquement si créée ici).
        await claim(candidat.id);
        await client.query('commit');
        await client.query('reset role');
        if (insereParNous) {
          const del = await client.query(
            'delete from public.favorites where id = $1 returning id',
            [idLigne]
          );
          verifier('nettoyage : delete du favori de test par le propriétaire', del.rowCount === 1);
        } else {
          console.log('· Ligne préexistante laissée en place (pas de modification).');
        }
      } catch (e) {
        echecs += 1;
        console.error('· Échec RLS fonctionnel :', (e as Error).message);
        await client.query('rollback').catch(() => undefined);
        await client.query('reset role').catch(() => undefined);
      }
    }

    // C.6 Contrainte unique : insérer 2 fois (test propre dans sa tx).
    await client.query('begin');
    try {
      await claim(candidat.id);
      await client.query('set role authenticated');
      const a = await client.query(
        `insert into public.favorites (livre_id) values ($1) ` +
          `on conflict (proprietaire_id, livre_id) do nothing returning id`,
        [livreId]
      );
      const aNotre = (a.rowCount as number) === 1;
      const errAttendue = await client
        .query('insert into public.favorites (livre_id) values ($1)', [livreId])
        .then(() => null)
        .catch((e: Error & { code?: string }) => e.code || e.message);
      verifier(
        'doublon (propriétaire, livre) refusé (unique)',
        errAttendue === '23505' || /duplicate key|unique/i.test(errAttendue || ''),
        `code : ${errAttendue}`
      );
      await client.query('rollback'); // le 2e insert a avorté la tx
      // Nettoyage si la ligne a été créée ici.
      if (aNotre) {
        await client.query('begin');
        await claim(candidat.id);
        await client.query('set role authenticated');
        await client.query('delete from public.favorites where livre_id = $1', [livreId]);
        await client.query('commit');
      }
    } catch (e) {
      echecs += 1;
      console.error('· Échec test doublon :', (e as Error).message);
      await client.query('rollback').catch(() => undefined);
    }
    await client.query('reset role').catch(() => undefined);
  } catch (e) {
    echecs += 1;
    console.error('· Échec section C :', (e as Error).message);
    await client.query('rollback').catch(() => undefined);
    await client.query('reset role').catch(() => undefined);
  }

  await client.end();
}

async function principal() {
  await partieSql().catch((e) => {
    console.error('Échec SQL réel :', e.message);
    echecs += 1;
  });

  console.log(echecs === 0 ? '\nTous les tests passent.' : `\n${echecs} échec(s).`);
  process.exit(echecs === 0 ? 0 : 1);
}

principal();