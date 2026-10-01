// ============================================================
// test-recherche-livre.ts — Test RÉEL de la recherche plein livre.
//
// Corpus factice (chapitres avec accents, majuscules, doublons),
// puis vérification :
//   - accents ignorés (« cafe » trouve « café »),
//   - insensibilité à la casse (« OMBRE » trouve « ombre »/« Ombre »),
//   - comptage EXACT des occurrences par chapitre et au total,
//   - extraits avec contexte + lien vers le chapitre (ancre),
//   - plafond d'extraits sans fausser le comptage,
//   - ordre de lecture (tri par position).
//
// Usage : npx tsx scripts/test-recherche-livre.ts
// ============================================================

import {
  chercherDansLivre,
  ancreChapitre,
  type ChapitreRecherche,
} from '../lib/recherche';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail?: string) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

const CORPUS: ChapitreRecherche[] = [
  {
    id: 'c3',
    position: 2,
    titre: 'Chapitre 3 — Épilogue',
    texte: 'Rien ici qui puisse être trouvé.',
  },
  {
    id: 'c1',
    position: 0,
    titre: 'Chapitre 1 — Le bal',
    texte:
      "L'ombre glissait sur les murs du salon.\n\n" +
      'Une ombre plus profonde encore, et des ombres dansaient.\n\n' +
      'Écarlate, la nuit l’avalait sans un bruit.',
  },
  {
    id: 'c2',
    position: 1,
    titre: 'Chapitre 2 — Le café',
    texte:
      'Le café fumait encore. Elle but son café noir, sans sucre.\n\n' +
      "Nul ne parlait de l'Ombre qui les suivait.",
  },
];

function contexte(chapitreId: string, extrait: number): string {
  const r = chercherDansLivre(CORPUS, 'ombre');
  const ch = r.chapitres.find((c) => c.chapitreId === chapitreId);
  return ch ? ch.extraits[extrait].contexte : '';
}

// ---------- 1. Comptage global ----------
const rOmbre = chercherDansLivre(CORPUS, 'ombre');
verifier('« ombre » : 4 occurrences sur le livre', rOmbre.totalOccurrences === 4, String(rOmbre.totalOccurrences));
verifier('« ombre » : 2 chapitres touchés', rOmbre.nbChapitresTouches === 2);
verifier(
  '« ombre » : tri par ordre de lecture (c1 puis c2)',
  rOmbre.chapitres.map((c) => c.chapitreId).join(',') === 'c1,c2'
);
verifier(
  '« ombre » : comptage exact par chapitre (3 puis 1)',
  rOmbre.chapitres[0].nbOccurrences === 3 && rOmbre.chapitres[1].nbOccurrences === 1
);
verifier(
  '« ombre » : somme des chapitres = total',
  rOmbre.chapitres.reduce((s, c) => s + c.nbOccurrences, 0) === rOmbre.totalOccurrences
);

// ---------- 2. Casse ignorée ----------
const rMaj = chercherDansLivre(CORPUS, 'OMBRE');
verifier('« OMBRE » (majuscules) : 4 occurrences', rMaj.totalOccurrences === 4, String(rMaj.totalOccurrences));
const rMixte = chercherDansLivre(CORPUS, 'oMbRe');
verifier('« oMbRe » (casse mixte) : 4 occurrences', rMixte.totalOccurrences === 4);

// ---------- 3. Accents ignorés ----------
const rCafe = chercherDansLivre(CORPUS, 'cafe');
verifier('« cafe » (sans accent) trouve « café » : 2 occurrences', rCafe.totalOccurrences === 2, String(rCafe.totalOccurrences));
const rCafeAccent = chercherDansLivre(CORPUS, 'café');
verifier('« café » (avec accent) : 2 occurrences', rCafeAccent.totalOccurrences === 2);
const rEcarlate = chercherDansLivre(CORPUS, 'ecarlate');
verifier('« ecarlate » trouve « Écarlate » : 1 occurrence', rEcarlate.totalOccurrences === 1, String(rEcarlate.totalOccurrences));
verifier('« ÉCARLATE » : 1 occurrence', chercherDansLivre(CORPUS, 'ÉCARLATE').totalOccurrences === 1);
verifier(
  'accents : la requête accentuée et non accentuée donnent le même total',
  chercherDansLivre(CORPUS, 'epilogue').totalOccurrences ===
    chercherDansLivre(CORPUS, 'Épilogue').totalOccurrences
);

// ---------- 4. Extraits + lien vers le chapitre ----------
const ch1 = rOmbre.chapitres[0];
verifier('extrait 0 (c1) contient le mot trouvé en contexte', /L'ombre glissait/.test(ch1.extraits[0].contexte), ch1.extraits[0].contexte);
verifier('extrait 1 (c1) surligne bien « ombre »', /ombre plus profonde/.test(ch1.extraits[1].contexte));
verifier('pas d’extrait pour le chapitre sans correspondance', rOmbre.chapitres.every((c) => c.chapitreId !== 'c3'));
verifier('ancre = lien direct vers le chapitre', ch1.ancre === 'chapitre-1' && rOmbre.chapitres[1].ancre === 'chapitre-2');
verifier('ancreChapitre(0) = « chapitre-1 »', ancreChapitre(0) === 'chapitre-1');
verifier(
  'extraits : plaque cohérente avec le contexte',
  ch1.extraits[0].plaque.debut >= 0 && ch1.extraits[0].plaque.fin > ch1.extraits[0].plaque.debut
);

// ---------- 5. Plafond d'extraits (comptage intact) ----------
const rPlafond = chercherDansLivre(CORPUS, 'ombre', { maxExtraitsParChapitre: 1 });
verifier('plafond : 1 extrait max par chapitre', rPlafond.chapitres.every((c) => c.extraits.length === 1));
verifier('plafond : le comptage reste exact (4)', rPlafond.totalOccurrences === 4, String(rPlafond.totalOccurrences));
verifier('plafond : nbOccurrences du ch.1 reste 3', rPlafond.chapitres[0].nbOccurrences === 3);

// ---------- 6. Contexte tronqué + marge ----------
const long = `Début. ${'mot '.repeat(60)}ombre ${'suite '.repeat(60)}Fin.`;
const rLong = chercherDansLivre(
  [{ id: 'x', position: 0, titre: 'Long', texte: long }],
  'ombre',
  { marge: 20 }
);
const ctxLong = rLong.chapitres[0].extraits[0].contexte;
verifier('contexte : ellipse de début et de fin', ctxLong.startsWith('…') && ctxLong.endsWith('…'), ctxLong.slice(0, 20));
verifier('contexte : le terme reste présent', /ombre/.test(ctxLong));
verifier('contexte : épuré sur une seule ligne', !/\n/.test(ctxLong));

// ---------- 7. Garde-fous ----------
verifier('terme d’un seul caractère ignoré', chercherDansLivre(CORPUS, 'a').totalOccurrences === 0);
verifier('terme vide ignoré', chercherDansLivre(CORPUS, '   ').totalOccurrences === 0);
verifier('corpus vide → résultat vide', chercherDansLivre([], 'ombre').totalOccurrences === 0);

// ---------- 8. Non-régression du moteur existant ----------
verifier('contexte(ch1) provient du moteur existant', contexte('c1', 0).includes('murs'));

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`);
  process.exit(1);
}
console.log('\nTous les tests de recherche plein livre passent.');
