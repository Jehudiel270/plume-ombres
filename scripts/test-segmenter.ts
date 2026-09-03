// Test rapide du segmenter : intégrité 1:1 sur des cas piégeux.
// Usage : npx tsx scripts/test-segmenter.ts
import {
  decouperTexte,
  verifierIntegrite,
  decouperEnChapitres,
  assembler,
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

// 1. Texte simple avec paragraphes et lignes vides multiples.
const t1 = 'Premier paragraphe.\n\nDeuxième paragraphe.\n\n\nTroisième avec\nretour à la ligne interne.\n';
verifier('intégrité t1', verifierIntegrite(t1, decouperTexte(t1, 100)));

// 2. Blancs de tête et de queue.
const t2 = '\n\n\nTitre\n\nCorps du texte.\n\n';
verifier('intégrité t2 (blancs aux extrémités)', verifierIntegrite(t2, decouperTexte(t2, 100)));

// 3. Paragraphe géant > limite → découpage interne.
const phrase =
  'Elle ferma les yeux, sentit le souffle chaud contre sa nuque, et comprit que cette nuit changerait tout. ';
const t3 = phrase.repeat(12) + '\n\nEt puis la suite.\n';
const u3 = decouperTexte(t3, 100);
verifier('intégrité t3 (paragraphe géant)', verifierIntegrite(t3, u3));
verifier(
  'découpage t3 en plusieurs unités',
  u3.length > 3
);
verifier(
  'aucune unité source > limite',
  u3.every((u) => u.source.length <= 100)
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

// 5. Pas de faux positif : un paragraphe commençant par "Chapter" en milieu
// de phrase ne doit pas créer de chapitre.
const pasFauxPositif = `Il racontait l'histoire de sa vie. Chapter one of his memoirs was about the war, il disait.\n\nIl continua son récit.`;
verifier(
  'pas de faux positif chapitre',
  decouperEnChapitres(pasFauxPositif).length === 1
);

// 6. Assemblage 1:1 après « traduction » simulée.
const source = 'Un.\n\nDeux.\n\n\nTrois.\n';
const unites = decouperTexte(source, 100);
const traduit = unites.map((u, i) => ({
  traduit: u.source ? `TRAD${i} ` : null,
  suite: u.suite,
}));
const assemble = assembler(traduit);
verifier(
  'assemblage conserve la structure (lignes vides)',
  assemble === 'TRAD0 \n\nTRAD1 \n\n\nTRAD2 \n'
);

console.log(echecs === 0 ? '\nTous les tests passent.' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
