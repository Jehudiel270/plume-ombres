// ============================================================
// scripts/preuve-persistance.mts — PREUVE exécutable, HORS LIGNE.
//
// Rejoue le scénario complet de la persistance d'une traduction avec un
// client Supabase EN MÉMOIRE (aucune requête réseau, aucune base réelle,
// aucune traduction réelle) :
//
//   1. le navigateur crée le travail et signe vivant ;
//   2. tant qu'il bat, le serveur ne prend PAS le travail ;
//   3. à l'arrêt des battements, le serveur PREND le relais ;
//   4. la progression survit à la mort du serveur en plein lot ;
//   5. un travail terminé ou annulé n'est plus jamais proposé.
//
// Usage : npx tsx scripts/preuve-persistance.mts
// Sortie : une CONCLUSION par étape + code de sortie 0 (prouvé) / 1.
// ============================================================

import { FauxSupabaseTravaux, clientFaux } from '../lib/faux-supabase-travaux';
import {
  SEUIL_BATTEMENT_MS,
  annulerTravail,
  avancerTravail,
  creerTravail,
  prochainTravail,
  type TravailTraduction,
} from '../lib/travaux-traduction';

const faux = new FauxSupabaseTravaux();
const client = clientFaux(faux);

let etapeCourante = 0;
let controles = 0;
let echecs = 0;

const nbEtapes = 9;

function titre(texte: string): void {
  etapeCourante += 1;
  console.log(`\n[${etapeCourante}/${nbEtapes}] ${texte}`);
}

function fait(texte: string): void {
  console.log(`        · ${texte}`);
}

function controle(condition: boolean, message: string): void {
  controles += 1;
  if (!condition) throw new Error(message);
}

function conclusion(texte: string): void {
  console.log(`        ✓ CONCLUSION : ${texte}`);
}

/** Exécute une étape : une erreur n'arrête pas la preuve, elle la marque. */
async function etape(description: string, corps: () => Promise<void>): Promise<void> {
  titre(description);
  try {
    await corps();
  } catch (erreur) {
    echecs += 1;
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.log(`        ✗ ÉCHEC : ${message}`);
  }
}

function exigerTravail(travail: TravailTraduction | null, quoi: string): TravailTraduction {
  controle(travail !== null, `${quoi} : aucun travail renvoyé`);
  if (!travail) throw new Error('inatteignable');
  return travail;
}

async function principal(): Promise<void> {
  console.log('PREUVE DE PERSISTANCE — travaux_traduction (hors ligne)');
  console.log(
    `Double Supabase en mémoire · seuil de battement = ${SEUIL_BATTEMENT_MS / 1000} s · aucun accès réseau`
  );

  const livre = 'livre-pilote';
  let travail: TravailTraduction | null = null;

  // §1 — Le navigateur crée le travail en traduisant.
  await etape('Le navigateur lance « Tout traduire » et crée le travail', async () => {
    const cree = await creerTravail(client, { livreId: livre, statutInitial: 'en_cours' });
    travail = cree;
    controle(cree.statut === 'en_cours', `statut attendu en_cours, reçu ${cree.statut}`);
    controle(cree.battement_le !== null, 'le battement doit être posé à la création');
    controle(faux.actifsDuLivre(livre).length === 1, 'un seul travail actif attendu');
    fait(`id=${cree.id} statut=${cree.statut} battement=${cree.battement_le ?? 'aucun'}`);
    conclusion('un travail ACTIF existe en base, signé vivant par l’onglet.');
  });

  // §2 — Battement frais : le serveur ne prend pas.
  await etape('Le serveur demande du travail pendant que l’onglet travaille', async () => {
    const candidat = await prochainTravail(client);
    controle(candidat === null, `le serveur a pris le travail ${candidat?.id ?? ''} à tort`);
    fait('prochainTravail() → null');
    conclusion('battement FRAIS : le serveur NE PREND PAS (pas de double traduction).');
  });

  // §3 — L'onglet continue de battre (3 intervalles de 20 s simulés).
  await etape('L’onglet bat toutes les 20 s (3 intervalles simulés)', async () => {
    const actif = exigerTravail(travail, 'onglet');
    for (let battement = 1; battement <= 3; battement += 1) {
      faux.vieillirBattement(actif.id, 20_000); // 20 s passent
      await avancerTravail(client, actif.id, { battement: true }); // l'onglet signe
      const candidat = await prochainTravail(client);
      controle(candidat === null, `le serveur a pris la main au battement ${battement}`);
    }
    fait('3 battements de 20 s → prochainTravail() → null à chaque fois');
    conclusion('tant que l’onglet donne signe de vie, le serveur reste à l’écart.');
  });

  // §4 — L'onglet se ferme : plus de battement.
  await etape('L’onglet est FERMÉ : plus aucun battement pendant 2 min 5 s', async () => {
    const actif = exigerTravail(travail, 'onglet fermé');
    faux.vieillirBattement(actif.id, SEUIL_BATTEMENT_MS + 5_000);
    const repris = exigerTravail(await prochainTravail(client), 'reprise');
    controle(repris.id === actif.id, 'ce n’est pas le même travail qui est repris');
    fait(`prochainTravail() → ${repris.id} (battement périmé de ${SEUIL_BATTEMENT_MS / 1000 + 5} s)`);
    conclusion('battement PÉRIMÉ : le serveur PREND le relais — la traduction survit à la fermeture.');
  });

  // §5 — Le serveur revendique et avance un lot, puis se protège lui-même.
  await etape('Le serveur revendique le travail et traduit un lot (40/120)', async () => {
    const actif = exigerTravail(travail, 'revendication');
    const revendique = await avancerTravail(client, actif.id, {
      statut: 'en_cours',
      battement: true,
    });
    controle(revendique.statut === 'en_cours', 'le travail doit rester en_cours');
    const avance = await avancerTravail(client, actif.id, {
      traites: 40,
      total: 120,
      statut: 'en_cours',
      battement: true,
    });
    controle(avance.traites === 40 && avance.total === 120, 'compteurs non enregistrés');
    controle(
      (await prochainTravail(client)) === null,
      'le serveur a repris son propre travail encore vivant'
    );
    fait('traites=40 total=120 battement=neuf → prochainTravail() → null');
    conclusion('un exécutant vivant n’est pas doublé par lui-même au passage suivant.');
  });

  // §6 — Le serveur meurt en plein lot : la progression est en base.
  await etape('Le serveur est tué en plein lot (déploiement, timeout)', async () => {
    const actif = exigerTravail(travail, 'serveur tué');
    faux.vieillirBattement(actif.id, SEUIL_BATTEMENT_MS + 30_000);
    const repris = exigerTravail(await prochainTravail(client), 'reprise après mort');
    controle(repris.id === actif.id, 'mauvais travail repris');
    controle(repris.traites === 40, `40 segments attendus en base, reçu ${repris.traites}`);
    controle(repris.total === 120, `total 120 attendu, reçu ${repris.total}`);
    fait(`reprise de ${repris.id} avec traites=${repris.traites}/${repris.total}`);
    conclusion('la progression vit en BASE, pas dans la mémoire d’un onglet ou d’un processus.');
  });

  // §7 — Fin du travail : plus jamais proposé.
  await etape('Le travail se termine (120/120)', async () => {
    const actif = exigerTravail(travail, 'clôture');
    await avancerTravail(client, actif.id, {
      statut: 'termine',
      traites: 120,
      total: 120,
      erreurs: 0,
    });
    controle((await prochainTravail(client)) === null, 'un travail terminé est encore proposé');
    faux.parId(actif.id).cree_le = new Date(Date.now() - 24 * 3600_000).toISOString();
    controle(
      (await prochainTravail(client)) === null,
      'un travail terminé très ancien est encore proposé'
    );
    fait('statut=termine, puis créé « il y a 24 h » → prochainTravail() → null');
    conclusion('un travail TERMINÉ n’est plus jamais proposé, même très ancien.');
  });

  // §8 — Annulation par l'utilisateur.
  await etape('L’utilisateur annule un second livre', async () => {
    const autre = await creerTravail(client, {
      livreId: 'livre-annule',
      statutInitial: 'en_cours',
    });
    await annulerTravail(client, autre.id);
    const relu = faux.parId(autre.id);
    controle(relu.statut === 'annule', `statut attendu annule, reçu ${relu.statut}`);
    controle((await prochainTravail(client)) === null, 'un travail annulé est encore proposé');
    fait(`statut=${relu.statut} → prochainTravail() → null`);
    conclusion('un travail ANNULÉ n’est plus jamais proposé.');
  });

  // §9 — Une file de travaux frais ne bloque pas les suivants.
  await etape('25 livres occupés par des onglets vivants + 1 travail à confier', async () => {
    for (let index = 0; index < 25; index += 1) {
      faux.inserer({
        livre_id: `livre-occupe-${index}`,
        statut: 'en_cours',
        cree_le: new Date(Date.now() - (120 - index) * 60_000).toISOString(),
        battement_le: new Date(Date.now() - 10_000).toISOString(),
      });
    }
    const aConfier = faux.inserer({
      livre_id: 'livre-a-confier',
      statut: 'en_attente',
      cree_le: new Date(Date.now() - 60_000).toISOString(),
    });
    const pris = exigerTravail(await prochainTravail(client), 'anti-famine');
    controle(pris.id === aConfier.id, 'le travail en_attente a été masqué par la file');
    fait(`prochainTravail() → ${pris.id} (le en_attente le plus ancien)`);
    conclusion('la file ne se bloque pas derrière des travaux déjà tenus.');
  });

  console.log('\nÉtat final de la « table » (double en mémoire) :');
  for (const ligne of faux.lignes) {
    console.log(
      `  ${ligne.id.padEnd(11)} ${ligne.livre_id.padEnd(16)} ${ligne.statut.padEnd(11)} ` +
        `${String(ligne.traites).padStart(3)}/${String(ligne.total).padEnd(3)} ` +
        `battement=${ligne.battement_le ?? 'aucun'}`
    );
  }

  if (echecs > 0) {
    console.log(`\n✗ PERSISTANCE NON PROUVÉE — ${echecs} étape(s) en échec, ${controles} contrôles.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `\n✔ PERSISTANCE PROUVÉE — ${nbEtapes} étapes, ${controles} contrôles, 0 échec, 0 accès réseau.`
  );
}

await principal();
