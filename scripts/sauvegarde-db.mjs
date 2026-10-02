#!/usr/bin/env node
// ============================================================
// sauvegarde-db.mjs — Sauvegarde et restauration de la base
// Supabase hébergée (P1.7). Supabase Free ne fournit AUCUNE
// sauvegarde automatique : ce script produit une sauvegarde
// réelle des tables clés et PROUVE la restauration.
//
// En l'absence du client `pg_dump`/`pg_restore` sur cette machine
// (vérifié), la sauvegarde est un fichier SQL reproductible :
//   * un `insert into "T" (colonnes) values (...);` par ligne ;
//   * les cibles sont NON qualifiées : la restauration choisit le
//     schéma par `search_path` (throwaway en test, `public` en
//     production). Aucune réécriture de texte n'est faite, donc
//     aucun risque de corrompre une donnée qui contiendrait par
//     hasard « public. ».
//
// ⚠ CONFIDENTIALITÉ : la sauvegarde contient le TEXTE des livres
// (segments). Elle est écrite dans `sauvegardes/`, IGNORÉ par git,
// et ne doit jamais être committée ni partagée sans chiffrement.
// Le rapport `preuves/sauvegarde-rapport.json`, lui, ne contient
// que des comptages et des empreintes (aucun texte).
//
// Usage :
//   node scripts/sauvegarde-db.mjs sauvegarde
//   node scripts/sauvegarde-db.mjs restauration-test <fichier.sql>
// ============================================================

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

// Tables clés sauvegardées (contenu, comptes, abonnements, supervision).
const TABLES = [
  'profiles',
  'livres',
  'chapitres',
  'segments',
  'glossaires',
  'glossaire_entrees',
  'favorites',
  'lecture_progression',
  'lecture_journal',
  'usage_mensuel',
  'plans_abonnement',
  'abonnements',
  'abonnements_historique',
  'paiements',
  'admin_actions',
  'journal_traduction',
];

const DOSSIER_SAUVEGARDES = 'sauvegardes';
const RAPPORT = join('preuves', 'sauvegarde-rapport.json');

function env(cle) {
  const ligne = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(cle + '='));
  return ligne ? ligne.split('=').slice(1).join('=').trim() : null;
}

function ouvrir() {
  return new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: env('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

const ident = (nom) => `"${String(nom).replace(/"/g, '""')}"`;

function colonnes(client, table) {
  return client
    .query(
      `select column_name, udt_name from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position`,
      [table]
    )
    .then((r) => r.rows);
}

/** Écrit une valeur SQL sûre en fonction de son type PostgreSQL. */
function valeurSql(client, brut, type) {
  if (brut === null || brut === undefined) return 'NULL';
  if (typeof brut === 'boolean') return brut ? 'true' : 'false';
  if (typeof brut === 'number') return Number.isFinite(brut) ? String(brut) : 'NULL';
  if (brut instanceof Date) {
    if (type === 'date') return client.escapeLiteral(brut.toISOString().slice(0, 10));
    return client.escapeLiteral(brut.toISOString());
  }
  if (typeof brut === 'object') {
    // jsonb : sérialise l'objet (le littéral texte est casté implicitement).
    return client.escapeLiteral(JSON.stringify(brut));
  }
  // bigint ramené en chaîne, uuid, text, float en chaîne…
  return client.escapeLiteral(String(brut));
}

const TEMPORELS = new Set(['timestamptz', 'timestamp', 'date', 'time', 'timetz']);

/** Projection qui force les types temporels en TEXTE : JS ne sait
 *  représenter que la milliseconde, PostgreSQL conserve la
 *  microseconde — on dumpe donc la valeur source exacte, jamais une
 *  conversion lossy. */
function projection(cols) {
  return cols
    .map((c) =>
      TEMPORELS.has(c.udt_name)
        ? `${ident(c.column_name)}::text as ${ident(c.column_name)}`
        : ident(c.column_name)
    )
    .join(', ');
}

// ------------------------------------------------------------
// SAUVEGARDE
// ------------------------------------------------------------
async function sauvegarde() {
  const client = ouvrir();
  await client.connect();
  mkdirSync(DOSSIER_SAUVEGARDES, { recursive: true });
  mkdirSync('preuves', { recursive: true });

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fichier = join(DOSSIER_SAUVEGARDES, `plume-${horodatage}.sql`);

  const lignes = [];
  lignes.push('-- ============================================================');
  lignes.push("-- Sauvegarde Plume d'Ombres — tables clés (P1.7)");
  lignes.push(`-- Générée le ${new Date().toISOString()}`);
  lignes.push('--');
  lignes.push('-- RESTAURATION (schéma public) :');
  lignes.push('--   psql "$URL" -c "set search_path to public" -f <ce fichier>');
  lignes.push('-- ou, via ce script : node scripts/sauvegarde-db.mjs restauration-test <fichier>');
  lignes.push('--');
  lignes.push('-- ⚠ Contient le texte des livres : NE JAMAIS COMMITTER.');
  lignes.push('-- ============================================================');
  lignes.push('');

  const resume = {};
  let totalLignes = 0;

  for (const table of TABLES) {
    const cols = await colonnes(client, table);
    if (cols.length === 0) {
      console.log(`· ${table} : absente, ignorée`);
      continue;
    }
    const noms = cols.map((c) => c.column_name);
    const { rows } = await client.query(
      `select ${projection(cols)} from public.${ident(table)}`
    );
    lignes.push(`-- table ${table} : ${rows.length} lignes`);
    if (rows.length > 0) {
      lignes.push(
        `insert into ${ident(table)} (${noms.map(ident).join(', ')}) values`
      );
      rows.forEach((row, i) => {
        const valeurs = cols
          .map((c) => valeurSql(client, row[c.column_name], c.udt_name))
          .join(', ');
        lignes.push(`  (${valeurs})${i === rows.length - 1 ? ';' : ','}`);
      });
    }
    lignes.push('');
    resume[table] = rows.length;
    totalLignes += rows.length;
    console.log(`✓ ${table} : ${rows.length} lignes`);
  }

  writeFileSync(fichier, lignes.join('\n'), 'utf8');
  const taille = statSync(fichier).size;

  const rapport = {
    genere_le: new Date().toISOString(),
    fichier,
    taille_octets: taille,
    tables: resume,
    total_lignes: totalLignes,
    note: 'Rapport sans contenu : seuls des noms de tables et des comptages.',
  };
  writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2));
  console.log(
    `\n✓ Sauvegarde : ${fichier} (${(taille / 1024 / 1024).toFixed(2)} Mo, ${totalLignes} lignes)`
  );
  await client.end();
}

// ------------------------------------------------------------
// RESTAURATION DANS UN SCHÉMA JETABLE + VÉRIFICATION
// ------------------------------------------------------------
async function hashTable(client, schema, table) {
  const r = await client.query(
    `select count(*)::bigint as n,
            md5(coalesce(string_agg(t::text, E'\n' order by t::text), '')) as h
       from ${ident(schema)}.${ident(table)} t`
  );
  return { n: Number(r.rows[0].n), h: r.rows[0].h };
}

async function restaurationTest(fichier) {
  const dump = readFileSync(fichier, 'utf8');
  const client = ouvrir();
  await client.connect();

  const schema = 'sauvegarde_test';
  const tables = TABLES.filter((t) => new RegExp(`-- table ${t} :`).test(dump));

  await client.query(`drop schema if exists ${ident(schema)} cascade`);
  await client.query(`create schema ${ident(schema)}`);
  for (const table of tables) {
    await client.query(
      `create table ${ident(schema)}.${ident(table)} (like public.${ident(table)})`
    );
  }

  const debut = Date.now();
  await client.query('begin');
  let echec = null;
  try {
    // Cible NON qualifiée dans le dump : le search_path choisit le
    // schéma jetable. Aucune écriture ne peut atteindre `public`.
    await client.query(`set local search_path to ${ident(schema)}`);
    await client.query(dump);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    echec = e.message;
  }

  const resultat = { tables: {}, identique: true, echec };
  if (!echec) {
    for (const table of tables) {
      const source = await hashTable(client, 'public', table);
      const cible = await hashTable(client, schema, table);
      const ok = source.n === cible.n && source.h === cible.h;
      resultat.tables[table] = {
        lignes_source: source.n,
        lignes_restaurees: cible.n,
        empreinte_identique: ok,
      };
      if (!ok) resultat.identique = false;
      console.log(`  ${ok ? '✓' : '✗'} ${table} : ${cible.n} lignes, empreinte ${ok ? 'identique' : 'DIFFÉRENTE'}`);
    }
  }

  await client.query(`drop schema if exists ${ident(schema)} cascade`);
  await client.end();

  resultat.duree_ms = Date.now() - debut;
  resultat.fichier = fichier;
  resultat.horodatage = new Date().toISOString();

  if (echec) {
    console.error(`✗ Restauration échouée : ${echec}`);
    process.exit(1);
  }
  if (!resultat.identique) {
    console.error('✗ Restauration INCOMPLÈTE : au moins une table diffère.');
    process.exit(1);
  }
  console.log(
    `\n✓ Restauration vérifiée dans le schéma jetable « ${schema} » : ${tables.length} tables identiques (${resultat.duree_ms} ms). Schéma supprimé.`
  );

  // Journalise la preuve dans le rapport (aucun texte de livre).
  try {
    const ancien = JSON.parse(readFileSync(RAPPORT, 'utf8'));
    ancien.derniere_restauration = resultat;
    writeFileSync(RAPPORT, JSON.stringify(ancien, null, 2));
  } catch {
    /* rapport absent : non bloquant */
  }
}

// ------------------------------------------------------------
async function principal() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'sauvegarde') {
    await sauvegarde();
  } else if (mode === 'restauration-test') {
    const fichier = args[0];
    if (!fichier) throw new Error('Usage : restauration-test <fichier.sql>');
    await restaurationTest(fichier);
  } else if (mode === 'liste') {
    mkdirSync(DOSSIER_SAUVEGARDES, { recursive: true });
    for (const f of readdirSync(DOSSIER_SAUVEGARDES)) {
      console.log(`${f} — ${(statSync(join(DOSSIER_SAUVEGARDES, f)).size / 1024 / 1024).toFixed(2)} Mo`);
    }
  } else {
    throw new Error(
      'Usage : node scripts/sauvegarde-db.mjs sauvegarde | restauration-test <fichier.sql> | liste'
    );
  }
}

principal().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
