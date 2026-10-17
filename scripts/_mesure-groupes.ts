// ============================================================
// scripts/_mesure-groupes.ts — Mesure du NOMBRE d'appels moteur
// avant/après regroupement, sur des segments RÉELS (lecture seule).
//
// Aucun appel réseau vers un moteur : le traducteur est un faux qui
// compte les appels et simule une latence fixe. Aucune écriture en
// base. On ne journalise jamais le texte des segments.
//
// Usage : npx tsx scripts/_mesure-groupes.ts [chemin .env.local] [segments]
//   (le .env.local doit contenir SUPABASE_DB_PASSWORD)
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import {
  enParalleleBorne,
  traiterLotSegments,
  type TraducteurLot,
} from '../lib/traduction/lot';
import { regrouperSegments } from '../lib/traduction/groupes';
import type { ResultatTraductionSecours } from '../lib/providers';

const LATENCE_MS = 350;
const CONCURRENCE = 8;

function valeurEnv(chemin: string, cle: string): string {
  const ligne = readFileSync(chemin, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(cle + '='));
  if (!ligne) throw new Error(`${cle} absent de ${chemin}`);
  return ligne.split('=').slice(1).join('=').trim();
}

function succes(traduit: string): ResultatTraductionSecours {
  return {
    traduit,
    fournisseur: 'gemini',
    nomFournisseur: 'Gemini',
    description: '',
    prive: false,
    priveStrict: false,
    essais: 1,
    tentatives: 1,
    dureeMs: LATENCE_MS,
  };
}

async function principal() {
  const cheminEnv = process.argv[2] ?? '.env.local';
  const nombre = Number(process.argv[3] ?? 24);

  const pg = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: valeurEnv(cheminEnv, 'SUPABASE_DB_PASSWORD'),
    database: 'postgres',
  });
  await pg.connect();

  const { rows: livres } = await pg.query(`
    SELECT l.id, l.titre,
           count(s.id) FILTER (WHERE s.statut IN ('en_attente','erreur')) AS restants
    FROM livres l
    JOIN chapitres c ON c.livre_id = l.id
    JOIN segments s ON s.chapitre_id = c.id
    GROUP BY l.id, l.titre
    HAVING count(s.id) FILTER (WHERE s.statut IN ('en_attente','erreur')) > 100
    ORDER BY restants DESC
    LIMIT 1
  `);
  const livre = livres[0];

  // Chapitre dont la longueur moyenne est proche de la moyenne mesurée
  // en base (215 caractères) : lot représentatif.
  const { rows: chapitres } = await pg.query(
    `SELECT c.id
     FROM chapitres c
     JOIN segments s ON s.chapitre_id = c.id
     WHERE c.livre_id = $1 AND s.statut IN ('en_attente','erreur') AND length(s.source) > 0
     GROUP BY c.id
     HAVING count(s.id) >= 40
     ORDER BY abs(avg(length(s.source)) - 215) ASC
     LIMIT 1`,
    [livre.id]
  );
  const chapitre = chapitres[0];

  const { rows } = await pg.query(
    `SELECT s.id, s.source
     FROM segments s
     WHERE s.chapitre_id = $1 AND s.statut IN ('en_attente','erreur') AND length(s.source) > 0
     ORDER BY s.position
     LIMIT $2`,
    [chapitre.id, nombre]
  );
  await pg.end();

  const lot = rows.map((r) => ({ id: String(r.id), texte: String(r.source) }));
  const caracteres = lot.reduce((n, s) => n + s.texte.length, 0);
  const longueurs = lot.map((s) => s.texte.length).sort((a, b) => a - b);
  console.log(`Livre : « ${livre.titre} » (${livre.restants} segments en attente)`);
  console.log(
    `Lot : ${lot.length} segments, ${caracteres} caractères — min ${longueurs[0]}, médiane ${
      longueurs[Math.floor(longueurs.length / 2)]
    }, max ${longueurs[longueurs.length - 1]}, moyenne ${Math.round(caracteres / lot.length)}`
  );
  console.log(
    `Sous 100 car : ${longueurs.filter((n) => n < 100).length} | sous 600 : ${
      longueurs.filter((n) => n < 600).length
    } | 600 et plus : ${longueurs.filter((n) => n >= 600).length}`
  );
  const groupes = regrouperSegments(lot);
  console.log(
    `Groupes : ${groupes.length} (tailles ${groupes.map((g) => g.length).join(', ')})`
  );

  // ---- AVANT : un appel moteur par segment (boucle historique) ----
  let appelsAvant = 0;
  const avant: TraducteurLot = async (texte) => {
    appelsAvant += 1;
    await new Promise((r) => setTimeout(r, LATENCE_MS));
    return succes(texte);
  };
  const t0 = Date.now();
  const resultatsAvant = await enParalleleBorne(lot, CONCURRENCE, (segment) =>
    avant(segment.texte.trim(), { source: 'en', cible: 'fr' })
  );
  const dureeAvant = Date.now() - t0;

  // ---- APRÈS : un appel par groupe ----
  let appelsApres = 0;
  const apres: TraducteurLot = async (texte) => {
    appelsApres += 1;
    await new Promise((r) => setTimeout(r, LATENCE_MS));
    return succes(texte);
  };
  const t1 = Date.now();
  const resultatApres = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    concurrence: CONCURRENCE,
    traduire: apres,
  });
  const dureeApres = Date.now() - t1;

  // ---- APRÈS, pire cas : le moteur perd les sentinelles (repli) ----
  let appelsRepli = 0;
  const repli: TraducteurLot = async (texte) => {
    appelsRepli += 1;
    await new Promise((r) => setTimeout(r, LATENCE_MS));
    return succes(texte.replace(/⟦PLUME:\d+⟧/g, ' '));
  };
  const resultatRepli = await traiterLotSegments(lot, {
    source: 'en',
    cible: 'fr',
    concurrence: CONCURRENCE,
    traduire: repli,
  });

  const parId = new Map(resultatApres.resultats.map((r) => [r.id, r.traduit]));
  const identiques = lot.filter((s) => parId.get(s.id) === s.texte).length;

  console.log('---');
  console.log(`Appels AVANT : ${appelsAvant} (${resultatsAvant.length} résultats)`);
  console.log(
    `Appels APRÈS : ${appelsApres} (${resultatApres.resultats.length} traduits, ${resultatApres.echecs.length} échecs)`
  );
  console.log(`Réduction    : ${(appelsAvant / appelsApres).toFixed(1)}×`);
  console.log(
    `Durée simulée (${LATENCE_MS} ms/appel, ${CONCURRENCE} en parallèle) : ${dureeAvant} ms → ${dureeApres} ms`
  );
  console.log(
    `Pire cas (sentinelles perdues) : ${appelsRepli} appels, ${resultatRepli.resultats.length} traduits, ${resultatRepli.echecs.length} échecs`
  );
  console.log(
    `Intégrité    : ${identiques}/${lot.length} traductions identiques au segment d'origine (faux moteur = recopie)`
  );
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
