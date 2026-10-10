// ============================================================
// test-polices.ts — Preuve typographique (disque + code).
//
//   npx tsx scripts/test-polices.ts
//
// Vérifie, en LISANT réellement le dépôt (aucune valeur inventée) :
//   (a) chaque famille déclarée possède ses .woff2 présents, non
//       vides et bien au format woff2 (en-tête « wOF2 ») ;
//   (b) toute famille proposée à l'utilisateur existe dans la table
//       de projection CSS — et réciproquement (lecteur ET apparence) ;
//   (c) le défaut est valide ;
//   (d) une préférence inconnue retombe sur le défaut (jamais
//       d'exception) — rétrocompatibilité des préférences ;
//   (e) les 3 familles d'origine sont toujours là (code + disque) ;
//   (f) app/fonts/LICENCES.md couvre chaque famille et chaque fichier.
//
// Sortie : rapport lisible ; code de sortie 1 au premier écart.
// ============================================================

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  POLICES_CSS,
  POLICES_LECTURE,
  POLICES_VALIDES,
  PREFERENCES_PAR_DEFAUT,
  assainirPreferences,
  preferencesEnCss,
  type PoliceLecture,
} from '../lib/lecture';
import {
  ORDRE_TYPOS,
  TYPOS,
  TYPO_DEFAUT,
  assainirTypo,
  type TypoId,
} from '../lib/theme';
import {
  FAMILLES_AJOUTEES,
  FAMILLES_ORIGINE,
  FAMILLES_POLICES,
} from '../lib/polices-familles';

const RACINE = process.cwd();
const DOSSIER_POLICES = resolve(RACINE, 'app/fonts');
const SOURCE_POLICES = resolve(RACINE, 'lib/polices.ts');
const LICENCES_MD = resolve(RACINE, 'app/fonts/LICENCES.md');

if (!existsSync(SOURCE_POLICES) || !existsSync(LICENCES_MD)) {
  console.error(
    `Racine invalide : ${RACINE} (exécuter « npx tsx scripts/test-polices.ts » depuis la racine du dépôt).`
  );
  process.exit(1);
}

let echecs = 0;
let controles = 0;
const journal: string[] = [];

function ok(label: string, condition: boolean, detail = ''): void {
  controles += 1;
  if (condition) {
    journal.push(`  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    echecs += 1;
    journal.push(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function titre(t: string): void {
  journal.push(`\n${t}`);
}

// ------------------------------------------------------------
// Lecture du CODE : lib/polices.ts (analyse TEXTE — le module
// importe `next/font/local`, non résolvable hors du runtime Next).
// ------------------------------------------------------------
const source = readFileSync(SOURCE_POLICES, 'utf8');

/** Bloc `export const <cle> = localFont({ ... });` du source. */
const blocs = [
  ...source.matchAll(
    /export const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g
  ),
].map((m) => ({ cle: m[1], corps: m[2] }));

/** Fichiers .woff2 déclarés dans le source (basename). */
const fichiersSource = new Set<string>();
for (const m of source.matchAll(/path:\s*'([^']+\.woff2)'/g)) {
  fichiersSource.add(basename(m[1]));
}

/** table cle → { variable, preload, fichiers } à partir du source. */
const decritsSource = new Map<
  string,
  { variable: string; preload: boolean; fichiers: string[] }
>();
for (const { cle, corps } of blocs) {
  const variable = /variable:\s*'([^']+)'/.exec(corps)?.[1] ?? '';
  const preload = /preload:\s*(true|false)/.exec(corps)?.[1] === 'true';
  const fichiers = [...corps.matchAll(/path:\s*'([^']+\.woff2)'/g)].map((m) =>
    basename(m[1])
  );
  decritsSource.set(cle, { variable, preload, fichiers });
}

// ------------------------------------------------------------
// (a) Fichiers présents, non vides, au format woff2
// ------------------------------------------------------------
titre('(a) Fichiers .woff2 — présence, taille, signature');
for (const famille of FAMILLES_POLICES) {
  for (const fichier of famille.fichiers) {
    const chemin = resolve(DOSSIER_POLICES, fichier);
    if (!existsSync(chemin)) {
      ok(`${famille.nom} · ${fichier}`, false, 'fichier absent');
      continue;
    }
    const taille = statSync(chemin).size;
    const entete = readFileSync(chemin).subarray(0, 4).toString('latin1');
    ok(
      `${famille.nom} · ${fichier}`,
      taille > 0 && entete === 'wOF2',
      `wOF2=${entete === 'wOF2'}, ${taille} o`
    );
  }
}

titre('(a-bis) Cohérence code ↔ catalogue');
ok(
  'les localFont déclarés correspondent au catalogue (mêmes clefs)',
  blocs.length === FAMILLES_POLICES.length &&
    FAMILLES_POLICES.every((f) => decritsSource.has(f.cle)),
  `${blocs.length} localFont pour ${FAMILLES_POLICES.length} familles`
);
ok(
  'les fichiers déclarés dans le code = fichiers du catalogue',
  fichiersSource.size ===
    new Set(FAMILLES_POLICES.flatMap((f) => f.fichiers)).size &&
    FAMILLES_POLICES.every((f) =>
      f.fichiers.every((x) => fichiersSource.has(x))
    ),
  `${fichiersSource.size} fichiers au total`
);

// ------------------------------------------------------------
// (b) Liste proposée ↔ table de projection CSS (lecteur)
// ------------------------------------------------------------
titre('(b) Lecteur — familles proposées ↔ projection CSS');
const proposeesLecteur = POLICES_LECTURE.map((p) => p.valeur);
const clesCssLecteur = Object.keys(POLICES_CSS) as PoliceLecture[];
const diffLecteur = [
  ...new Set([
    ...proposeesLecteur.filter((v) => !clesCssLecteur.includes(v)),
    ...clesCssLecteur.filter((v) => !proposeesLecteur.includes(v)),
  ]),
];
ok(
  'proposées ↔ POLICES_CSS (égalité dans les deux sens)',
  diffLecteur.length === 0,
  diffLecteur.length ? `écarts : ${diffLecteur.join(', ')}` : 'parfait'
);
ok(
  'proposées ⊆ POLICES_VALIDES',
  proposeesLecteur.every((v) => POLICES_VALIDES.includes(v)),
  `${proposeesLecteur.length} valeurs`
);

titre('(b) Apparence — typographies proposées ↔ projection titre/corps');
const proposeesApparence = ORDRE_TYPOS;
const clesTypo = Object.keys(TYPOS) as TypoId[];
const diffApparence = [
  ...new Set([
    ...proposeesApparence.filter((v) => !clesTypo.includes(v)),
    ...clesTypo.filter((v) => !proposeesApparence.includes(v)),
  ]),
];
ok(
  'ORDRE_TYPOS ↔ TYPOS (égalité dans les deux sens)',
  diffApparence.length === 0,
  diffApparence.length ? `écarts : ${diffApparence.join(', ')}` : 'parfait'
);
ok(
  'chaque typographie projette titre ET corps non vides',
  proposeesApparence.every(
    (id) => TYPOS[id].titre.length > 0 && TYPOS[id].corps.length > 0
  )
);

// ------------------------------------------------------------
// (c) Le défaut est valide
// ------------------------------------------------------------
titre('(c) Défaut valide');
ok(
  'défaut lecteur ∈ POLICES_VALIDES',
  POLICES_VALIDES.includes(PREFERENCES_PAR_DEFAUT.police),
  PREFERENCES_PAR_DEFAUT.police
);
ok(
  'défaut lecteur présent dans POLICES_CSS et proposé',
  clesCssLecteur.includes(PREFERENCES_PAR_DEFAUT.police) &&
    proposeesLecteur.includes(PREFERENCES_PAR_DEFAUT.police),
  PREFERENCES_PAR_DEFAUT.police
);
ok(
  'défaut apparence ∈ ORDRE_TYPOS et ∈ TYPOS',
  proposeesApparence.includes(TYPO_DEFAUT) && clesTypo.includes(TYPO_DEFAUT),
  TYPO_DEFAUT
);

// ------------------------------------------------------------
// (d) Préférence inconnue → défaut (jamais d'exception)
// ------------------------------------------------------------
titre('(d) Préférence inconnue retombe sur le défaut');
const inconnues: unknown[] = [
  'cette-police-nexiste-pas',
  '',
  null,
  undefined,
  42,
  {},
];
for (const v of inconnues) {
  const pref = assainirPreferences({ police: v as PoliceLecture });
  ok(
    `assainirPreferences({ police: ${JSON.stringify(v)} }) → défaut`,
    pref.police === PREFERENCES_PAR_DEFAUT.police,
    pref.police
  );
}
ok(
  'assainirTypo(inconnue) → TYPO_DEFAUT',
  assainirTypo('pas-une-typo') === TYPO_DEFAUT,
  TYPO_DEFAUT
);
// Les préférences mémorisées d'une version antérieure restent honorées.
const ancienne = assainirPreferences({ police: 'lora' });
ok(
  'rétrocompat : une valeur d’origine enregistrée est honorée',
  ancienne.police === 'lora',
  ancienne.police
);
// preferencesEnCss ne doit jamais lever sur une valeur inconnue.
try {
  const css = preferencesEnCss(
    assainirPreferences({ police: 'inconnue' as PoliceLecture })
  );
  ok(
    'preferencesEnCss(valeur inconnue) → --pref-police non vide',
    typeof css['--pref-police'] === 'string' &&
      css['--pref-police'].length > 0,
    css['--pref-police']
  );
} catch (e) {
  ok('preferencesEnCss(valeur inconnue) ne lève pas', false, String(e));
}

// ------------------------------------------------------------
// (e) Les 3 familles d'origine toujours présentes
// ------------------------------------------------------------
titre('(e) Les 3 familles d’origine sont toujours là');
for (const cle of FAMILLES_ORIGINE) {
  const famille = FAMILLES_POLICES.find((f) => f.cle === cle);
  ok(
    `catalogue conserve « ${cle} »`,
    !!famille && famille.fichiers.length > 0
  );
  ok(
    `code déclare « ${cle} »`,
    decritsSource.has(cle),
    famille ? famille.nom : '(absent)'
  );
}
for (const p of ['lora', 'systeme', 'monospace'] as PoliceLecture[]) {
  ok(`lecteur conserve « ${p} »`, POLICES_VALIDES.includes(p));
}
for (const t of ['plume', 'velin', 'native'] as TypoId[]) {
  ok(`apparence conserve « ${t} »`, clesTypo.includes(t));
}

// ------------------------------------------------------------
// (f) LICENCES.md couvre chaque famille et chaque fichier
// ------------------------------------------------------------
titre('(f) app/fonts/LICENCES.md couvre chaque famille');
const licences = readFileSync(LICENCES_MD, 'utf8');
for (const famille of FAMILLES_POLICES) {
  ok(`LICENCES.md cite « ${famille.nom} »`, licences.includes(famille.nom));
  ok(
    `LICENCES.md cite « ${famille.licence} »`,
    licences.includes(famille.licence)
  );
  for (const fichier of famille.fichiers) {
    ok(`LICENCES.md cite « ${fichier} »`, licences.includes(fichier));
  }
}

// ------------------------------------------------------------
// (bonus) Chaque famille AJOUTÉE est réellement câblée à l'UI
// ------------------------------------------------------------
titre('(bonus) Familles ajoutées réellement câblées (lecteur + apparence)');
for (const cle of FAMILLES_AJOUTEES) {
  const desc = decritsSource.get(cle);
  const variable = desc?.variable ?? '';
  const dansLecteur = Object.values(POLICES_CSS).some((v) =>
    v.includes(variable)
  );
  const dansApparence = Object.values(TYPOS).some(
    (t) => t.titre.includes(variable) || t.corps.includes(variable)
  );
  ok(
    `« ${cle} » (${variable}) est projetée`,
    variable.length > 0 && dansLecteur && dansApparence,
    `lecteur=${dansLecteur}, apparence=${dansApparence}`
  );
  ok(
    `« ${cle} » n’est PAS préchargée (chargement à la demande)`,
    desc?.preload === false
  );
}

// ------------------------------------------------------------
// Rapport
// ------------------------------------------------------------
console.log(journal.join('\n'));
console.log(
  `\n${echecs === 0 ? '✔ SUCCÈS' : '✘ ÉCHEC'} — ${controles - echecs}/${controles} contrôles réussis, ${echecs} échec(s).`
);

process.exit(echecs === 0 ? 0 : 1);
