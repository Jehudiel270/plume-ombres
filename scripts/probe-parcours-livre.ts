// ============================================================
// Preuve réelle — Point (1) : taille du livre affichée AVANT la
// traduction, et propreté du refus quand le quota restant est
// insuffisant.
// Usage : npx tsx scripts/probe-parcours-livre.ts
//
// PUREMENT LOCAL (lecture de source + logique pure) : aucune base,
// aucun réseau, aucune écriture.
//
//   A. Le nombre de caractères d'un livre est-il AFFICHÉ au lecteur
//      avant qu'il lance la traduction ? On vérifie par SCAN DE
//      SOURCE où `totalCaracteres` est réellement consommé.
//   B. Le refus d'insuffisance de quota remonte-t-il PROPREMENT
//      jusqu'à l'utilisateur ? On exécute la logique de refus et on
//      scanne la gestion du code QUOTA_DEPASSE côté client.
// ============================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MagasinQuotaMemoire,
  reserverQuota,
  CODE_QUOTA_DEPASSE,
} from '../lib/quota';

const RACINE = join(__dirname, '..');
let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}
function lire(rel: string): string {
  return readFileSync(join(RACINE, rel), 'utf8');
}
function lignes(rel: string, motif: RegExp): { n: number; t: string }[] {
  return lire(rel)
    .split(/\r?\n/)
    .map((t, i) => ({ n: i + 1, t }))
    .filter((l) => motif.test(l.t));
}

async function main() {
  // ----------------------------------------------------------
  // A. Où `totalCaracteres` est-il consommé ?
  // ----------------------------------------------------------
  console.log('— A. Affichage du nombre de caractères d’un livre —');
  const fichierLivre = 'app/livres/[id]/page.tsx';
  const fichierEspace = 'components/EspaceLivre.tsx';
  const fichierLecture = 'lib/useLecture.ts';

  const usageLivre = lignes(fichierLivre, /totalCaracteres/);
  const usageEspace = lignes(fichierEspace, /totalCaracteres/);
  const usageLecture = lignes(fichierLecture, /totalCaracteres|estimerSecondesLectureLivre/);

  console.log(`  · ${fichierLivre} → lignes ${usageLivre.map((l) => l.n).join(', ')}`);
  console.log(`  · ${fichierEspace} → lignes ${usageEspace.map((l) => l.n).join(', ')}`);
  console.log(`  · ${fichierLecture} → lignes ${usageLecture.map((l) => l.n).join(', ')}`);

  // La SEULE consommation finale de `totalCaracteres` est l'estimation de
  // temps de lecture — jamais un rendu en « caractères ».
  verifier(
    'A.1 : `totalCaracteres` ne sert QU’à estimer le temps de lecture',
    /estimerSecondesLectureLivre\(totalCaracteres\)/.test(lire(fichierLecture))
  );
  verifier(
    'A.2 : AUCUN composant du lecteur n’affiche « … caractères » pour le livre',
    !/totalCaracteres/.test(lire('components/lecteur/BarreActions.tsx')) &&
      !/totalCaracteres/.test(lire('components/lecteur/CommandesTraduction.tsx'))
  );
  // Le libellé « caractères » n'apparaît dans le parcours livre que dans
  // un COMMENTAIRE (et pour le temps de lecture ~⏱). Un rendu de la taille
  // du livre serait un `libelleCaracteres(totalCaracteres)` — inexistant.
  const mentionsCaracteres = lignes(fichierEspace, /caractères/);
  const toutesEnCommentaire =
    mentionsCaracteres.length > 0 &&
    mentionsCaracteres.every((l) => /^\s*(\/\/|\*|\/\*)/.test(l.t));
  verifier(
    'A.3 : `libelleCaracteres(totalCaracteres)` n’existe nulle part',
    lignes(fichierLivre, /libelleCaracteres/).length === 0 &&
      lignes(fichierEspace, /libelleCaracteres/).length === 0
  );
  verifier(
    'A.3b : la seule mention « caractères » du livre est un COMMENTAIRE (aucun rendu)',
    toutesEnCommentaire,
    mentionsCaracteres.map((l) => `${l.n}: ${l.t.trim()}`).join(' | ')
  );
  // Contre-preuve : c'est bien le correctif qui l'affiche désormais.
  const bandeau = lire('components/ComplementCredits.tsx');
  verifier(
    'A.4 : le bandeau de complément affiche la taille du livre en caractères',
    /Taille du livre/.test(bandeau) && /libelleCaracteres\(complement\.tailleLivre\)/.test(bandeau)
  );

  // ----------------------------------------------------------
  // B. Propreté du refus d'insuffisance de quota
  // ----------------------------------------------------------
  console.log('\n— B. Refus quand le quota restant est insuffisant —');

  // B1. Le refus est PROPRE au niveau de la logique (code + message).
  const mag = new MagasinQuotaMemoire();
  const limite = 400000; // gratuit : 400 000 car./mois
  const quand = new Date('2026-10-15T00:00:00Z');
  await reserverQuota(mag, 'acc', 380000, quand, limite); // déjà consommé
  const refus = await reserverQuota(mag, 'acc', 25000, quand, limite); // 405 000 > 400 000
  console.log(`  · code renvoyé  : ${refus.code}`);
  console.log(`  · message       : ${refus.message}`);
  verifier(
    'B.1 : la logique refuse avec un code dédié + message explicite',
    refus.autorise === false &&
      refus.code === CODE_QUOTA_DEPASSE &&
      /Quota mensuel de traduction dépassé/.test(refus.message ?? '') &&
      /380000\/400000/.test(refus.message ?? '')
  );

  // B2. La route renvoie bien 402 + le message (aucun nom de fournisseur).
  const route = lire('app/api/translate/route.ts');
  verifier(
    'B.2 : la route renvoie 402 + { erreur, code } pour un quota dépassé',
    /code: CODE_QUOTA_DEPASSE/.test(route) && /status: 402/.test(route)
  );

  // B3. CÔTÉ CLIENT : le code de refus n'est PAS exploité → il retombe
  //     en erreur de segment générique. C'est le trou du parcours.
  const moteur = lire('lib/useMoteurTraduction.ts');
  const espace = lire(fichierEspace);
  verifier(
    'B.3 : aucun composant CLIENT ne exploite QUOTA_DEPASSE (402)',
    !/QUOTA_DEPASSE/.test(moteur) && !/QUOTA_DEPASSE/.test(espace)
  );
  verifier(
    'B.4 : le moteur n’exploite QUE le 413 ; tout le reste = erreur générique',
    /reponse\.status === 413/.test(moteur) &&
      !/reponse\.status === 402/.test(moteur)
  );
  const messageGenerique = lignes(
    'lib/useMoteurTraduction.ts',
    /Échec après plusieurs essais/
  );
  verifier(
    'B.5 : un 402 (quota) devient « Échec après plusieurs essais. » côté segment',
    messageGenerique.length === 1,
    `ligne ${messageGenerique.map((l) => l.n).join(', ')}`
  );

  console.log(
    `\n${echecs === 0 ? '✓ CONSTAT ÉTABLI' : `✗ ${echecs} ÉCHEC(S)`}\n` +
      '  (1) Taille du livre : NON affichée avant la traduction (corrigé par le bandeau).\n' +
      '      Refus quota : PROPRE côté serveur (402 + message), mais PAS remonté\n' +
      '      proprement au lecteur (devenir « Échec après plusieurs essais. »).'
  );
  process.exit(echecs === 0 ? 0 : 1);
}

main();
