// Test rapide du segmenter : cohérence du découpage + intégrité 1:1.
// Usage : npx tsx scripts/test-segmenter.ts
import {
  decouperTexte,
  verifierIntegrite,
  decouperEnChapitres,
  assembler,
  normaliserSouple,
} from '../lib/segmenter';

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// 1. Paragraphes simples + lignes vides multiples + paragraphe enveloppé
//    (retours à la ligne mous) : le paragraphe entier doit être UNE unité.
const t1 =
  'Premier paragraphe.\n\nDeuxième paragraphe.\n\n\nTroisième avec\nretour à la ligne interne.\n';
const u1 = decouperTexte(t1, 100);
verifier('intégrité t1', verifierIntegrite(t1, u1));
verifier('t1 = 3 paragraphes → 3 unités', u1.length === 3);
verifier(
  'paragraphe enveloppé réuni proprement',
  u1[2].source === 'Troisième avec retour à la ligne interne.'
);

// 2. Blancs de tête et de queue.
const t2 = '\n\n\nTitre\n\nCorps du texte.\n\n';
verifier('intégrité t2 (blancs aux extrémités)', verifierIntegrite(t2, decouperTexte(t2, 100)));

// 3. Paragraphe géant > limite → éclatement en phrases complètes.
const phrase =
  'Elle ferma les yeux, sentit le souffle chaud contre sa nuque, et comprit que cette nuit changerait tout. ';
const t3 = phrase.repeat(8) + '\n\nEt puis la suite.\n';
const u3 = decouperTexte(t3, 100);
verifier('intégrité t3 (paragraphe géant)', verifierIntegrite(t3, u3));
verifier('découpage t3 en plusieurs unités', u3.length > 3);
verifier('aucune unité source > limite', u3.every((u) => u.source.length <= 100));
verifier(
  'unités du paragraphe géant ≤ limite, sauf la dernière partie',
  u3.slice(0, u3.length - 2).every((u) => u.source.length <= 100)
);
verifier(
  'les coupures se font après une fin de phrase ou un mot entier',
  u3
    .slice(0, u3.length - 2)
    .every((u) => u.suite === ' ' && !u.source.endsWith(' '))
);

// 4. Détection des chapitres (français + anglais + markdown).
const livre = `# Prologue

Il faisait nuit sur Venise.

## Chapitre 1

La première fois qu'elle le vit, elle sut qu'il était dangereux.

Chapter 2

Le danger avait un visage, et ce visage souriait.

Chapitre 3

Elle avait promis de ne jamais revenir.`;
const chapitres = decouperEnChapitres(livre);
verifier('détection chapitres (4 attendus)', chapitres.length === 4);
verifier(
  'titres détectés',
  chapitres[0].titre === 'Prologue' &&
    chapitres[1].titre === 'Chapitre 1' &&
    chapitres[2].titre === 'Chapter 2' &&
    chapitres[3].titre === 'Chapitre 3'
);

// 5. Pas de faux positif : un paragraphe commençant par "Chapter" en
//    milieu de phrase ne doit pas créer de chapitre.
const pasFauxPositif = `Il racontait l'histoire de sa vie. Chapter one of his memoirs was about the war, il disait.

Il continua son récit.`;
verifier(
  'pas de faux positif chapitre',
  decouperEnChapitres(pasFauxPositif).length === 1
);

// 6. Assemblage 1:1 après « traduction » simulée (structure préservée).
const source = 'Un.\n\nDeux.\n\n\nTrois.\n';
const unites = decouperTexte(source, 100);
const traduit = unites.map((u, i) => ({
  traduit: u.source ? `TRAD${i}` : null,
  suite: u.suite,
}));
const assemble = assembler(traduit);
verifier(
  'assemblage conserve les séparateurs de paragraphes',
  assemble === 'TRAD0\n\nTRAD1\n\n\nTRAD2 '
);

// 7. La normalisation souple transforme les retours à la ligne mous.
verifier(
  'normaliserSouple réunit les lignes enveloppées',
  normaliserSouple('a\nb\n\nc\nd') === 'a b\n\nc d'
);

// 8. Détection générique de sections (PDF hétérogènes).
const sections = `ACKNOWLEDGEMENTS

I would like to thank my editor, my family and every reader who supported this strange and beautiful journey from the very first page.

Author’s Note

This story deals with heavy themes. Read with care, and remember that the shadows always pass.

He walked slowly into the room, and she did not look away.`;
const decoupeSections = decouperEnChapitres(sections);
verifier(
  'sections génériques détectées (ACKNOWLEDGEMENTS, Author’s Note)',
  decoupeSections.length === 2 &&
    decoupeSections[0].titre === 'ACKNOWLEDGEMENTS' &&
    decoupeSections[1].titre === 'Author’s Note'
);
verifier(
  'la prose ordinaire n’est pas découpée en titres',
  decoupeSections[1].texte.includes('He walked slowly into the room')
);

console.log(echecs === 0 ? '\nTous les tests passent.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
