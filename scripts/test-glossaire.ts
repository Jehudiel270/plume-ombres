// ============================================================
// scripts/test-glossaire.ts — Tests réels P1.1 (hors réseau).
//
// Prouve, sur un texte d'exemple :
//   (a) un nom propre présent au glossaire est rendu EXACTEMENT
//       comme fourni (insensible à la casse, mots entiers), y
//       compris via traduireAvec() sur un moteur moqueur ;
//   (b) le contexte glissant est bien injecté dans le prompt
//       réellement construit — le prompt est AFFICHÉ ;
//   (c) le coût en caractères/tokens reste borné (budget).
//
// Usage : npx tsx scripts/test-glossaire.ts
// ============================================================

import {
  appliquerGlossaire,
  composerInstructionSysteme,
  construireContexteGlissant,
  construireDirectives,
  detecterCandidatsGlossaire,
  estimerTokens,
  normaliserSource,
  BUDGET_DIRECTIVES_CARACTERES,
  BUDGET_CONTEXTE_CARACTERES,
} from '../lib/glossaire';
import { traduireAvec } from '../lib/providers/index';
import type {
  FournisseurTraduction,
  OptionsTraduction,
} from '../lib/providers/types';
import type { IdFournisseur, PaireGlossaire } from '../lib/types';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`✓ ${nom}`);
  } else {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

// ------------------------------------------------------------
// Moteur moqueur : capture l'instruction système et le texte reçus.
// Il « garde » les noms propres mais avec une casse instable, pour
// prouver que l'imposition du glossaire est insensible à la casse.
// ------------------------------------------------------------
class FournisseurEspion implements FournisseurTraduction {
  readonly id: IdFournisseur = 'gemini';
  readonly nom = 'Espion (test)';
  readonly maxCharsParRequete = 6000;
  readonly delaiEntreRequetes = 0;
  readonly qualite = 'haute' as const;

  derniereInstruction = '';
  dernierTexte = '';

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    this.dernierTexte = texte;
    this.derniereInstruction = composerInstructionSysteme(
      'Tu es un traducteur littéraire expert spécialisé en dark romance.',
      options
    );
    // Traduction simulée : les noms propres sont conservés mais la casse
    // varie d'un segment à l'autre, comme le fait un vrai moteur.
    return texte.replace(/\bRavenswood\b/gi, (m) =>
      m === m.toUpperCase() ? 'RAVENSWOOD' : 'ravenswood'
    );
  }
}

async function main() {
  // ============================================================
  // (a) Traduction imposée, insensible à la casse
  // ============================================================
  console.log('\n— (a) Glossaire imposé (insensible à la casse) —');
  const glossaire: PaireGlossaire[] = [
    { source: 'Ravenswood', traduction: 'Corbeaud' },
    { source: 'Elizabeth Bennet', traduction: 'Elisabeth Bennet' },
  ];

  const source = 'She walked through the halls of Ravenswood, and RAVENSWOOD answered.';
  const brut = 'Elle traversa les couloirs de Ravenswood, et RAVENSWOOD répondit.';
  const applique = appliquerGlossaire(brut, glossaire);
  console.log(`  source : ${source}`);
  console.log(`  brut   : ${brut}`);
  console.log(`  imposé : ${applique.texte}`);
  verifier(
    'les deux graphies (Ravenswood / RAVENSWOOD) deviennent « Corbeaud »',
    applique.texte === 'Elle traversa les couloirs de Corbeaud, et Corbeaud répondit.',
    applique.texte
  );
  verifier('2 remplacements comptés', applique.remplacements === 2);

  const idempotent = appliquerGlossaire(applique.texte, glossaire);
  verifier(
    'application idempotente (2e passe = 0 remplacement)',
    idempotent.remplacements === 0
  );

  const sousChaine = appliquerGlossaire('The Ravenswoodshire estate.', glossaire);
  verifier(
    'pas de remplacement dans une sous-chaîne (Ravenswoodshire intact)',
    sousChaine.texte === 'The Ravenswoodshire estate.',
    sousChaine.texte
  );

  const multi = appliquerGlossaire('elizabeth bennet smiled.', glossaire);
  verifier(
    'nom multi-mots imposé quelle que soit la casse',
    multi.texte === 'Elisabeth Bennet smiled.',
    multi.texte
  );

  // Même garantie À TRAVERS traduireAvec (chemin réel de la route API).
  const espion = new FournisseurEspion();
  const viaMoteur = await traduireAvec(espion, brut, {
    source: 'en',
    cible: 'fr',
    glossaire,
  });
  console.log(`  traduireAvec → ${viaMoteur}`);
  verifier(
    'traduireAvec(...) impose le glossaire sur la sortie du moteur',
    viaMoteur === 'Elle traversa les couloirs de Corbeaud, et Corbeaud répondit.',
    viaMoteur
  );

  // ============================================================
  // (b) Contexte glissant dans le prompt réellement construit
  // ============================================================
  console.log('\n— (b) Contexte glissant injecté dans le prompt —');
  const segmentsPrecedents = [
    { source: 'The storm raged.', traduit: 'La tempête faisait rage.' },
    { source: 'She ran.', traduit: 'Elle courut vers le manoir.' },
    {
      source: 'Ravenswood loomed above her.',
      traduit: 'Corbeaud se dressait au-dessus d’elle, immense et noir.',
    },
  ];
  // Rappel de contexte réellement envoyé au moteur : uniquement les
  // passages précédents — les termes fixés partent via `glossaire` et
  // sont composés une seule fois dans le prompt (pas de doublon).
  const contexte = construireContexteGlissant({ segments: segmentsPrecedents });
  console.log(
    `  contexte (${contexte.caracteres} car. ≈ ${contexte.tokensEstimes} tokens) :`
  );
  console.log(`    ${contexte.extrait.replace(/\n/g, '\n    ')}`);

  // Capacité « personnages déjà traduits » du rappel (utilisable seule).
  const contexteAvecTermes = construireContexteGlissant({
    entrees: glossaire,
    segments: [],
  });
  verifier(
    'le rappel peut inclure les personnages déjà traduits',
    contexteAvecTermes.extrait.includes('Ravenswood = Corbeaud'),
    contexteAvecTermes.extrait
  );

  const directives = construireDirectives({
    entrees: glossaire,
    contexte: contexte.extrait,
  });
  const texteASegment = 'He stood at the window of Ravenswood, watching her.';
  const espion2 = new FournisseurEspion();
  await espion2.traduire(texteASegment, {
    source: 'en',
    cible: 'fr',
    glossaire,
    directives: directives.directives,
  });
  const prompt = espion2.derniereInstruction;
  console.log('  PROMPT réellement construit (instruction système) :');
  console.log('  ┌' + '─'.repeat(70));
  for (const ligne of prompt.split('\n')) console.log(`  │ ${ligne}`);
  console.log('  └' + '─'.repeat(70));

  verifier(
    'le prompt contient la traduction imposée « Corbeaud »',
    prompt.includes('Corbeaud')
  );
  verifier(
    'le prompt contient le nom multi-mots imposé',
    prompt.includes('Elisabeth Bennet')
  );
  verifier(
    'le prompt contient un extrait du segment précédent (contexte glissant)',
    prompt.includes('se dressait au-dessus d’elle'),
    prompt
  );
  verifier(
    'le prompt contient le rappel des passages précédents',
    prompt.includes('Corbeaud se dressait')
  );
  verifier(
    'les directives sont bornées par le budget global',
    directives.caracteres <= BUDGET_DIRECTIVES_CARACTERES,
    `${directives.caracteres} > ${BUDGET_DIRECTIVES_CARACTERES}`
  );

  // ============================================================
  // (c) Budget : le coût n'explose pas
  // ============================================================
  console.log('\n— (c) Budget de tokens —');
  const grosGlossaire: PaireGlossaire[] = Array.from({ length: 500 }, (_, i) => ({
    source: `Personnage Nombreux ${i}`,
    traduction: `Personnage Nombreux ${i} FR`,
  }));
  const grosSegments = Array.from({ length: 12 }, (_, i) => ({
    source: `Paragraphe ${i}`,
    traduit:
      'Un long passage traduit répété pour gonfler volontairement le contexte. '.repeat(6),
  }));

  const grosContexte = construireContexteGlissant({
    entrees: grosGlossaire,
    segments: grosSegments,
  });
  const grossesDirectives = construireDirectives({
    entrees: grosGlossaire,
    contexte: grosContexte.extrait,
  });

  const naifSansBudget =
    grosGlossaire.map((e) => `${e.source} = ${e.traduction}`).join(' ; ').length +
    grosSegments.map((s) => s.traduit).join(' ').length;
  console.log('  sans budget (concaténation naïve) :', naifSansBudget, 'caractères');
  console.log(
    '  avec budget (plafonné)            :',
    grossesDirectives.caracteres,
    'caractères ≈',
    grossesDirectives.tokensEstimes,
    'tokens'
  );
  verifier(
    'contexte borné par son budget',
    grosContexte.caracteres <= BUDGET_CONTEXTE_CARACTERES,
    `${grosContexte.caracteres} > ${BUDGET_CONTEXTE_CARACTERES}`
  );
  verifier(
    'directives bornées par le budget global (500 entrées à la source)',
    grossesDirectives.caracteres <= BUDGET_DIRECTIVES_CARACTERES,
    `${grossesDirectives.caracteres} > ${BUDGET_DIRECTIVES_CARACTERES}`
  );
  verifier(
    'réduction effective par rapport à la concaténation naïve',
    grossesDirectives.caracteres < naifSansBudget / 5,
    `${grossesDirectives.caracteres} vs ${naifSansBudget}`
  );
  verifier('le budget a bien tronqué', grossesDirectives.tronque);
  verifier(
    'estimation tokens cohérente (≈ car./4)',
    estimerTokens('abcd') === 1 && estimerTokens('a'.repeat(1600)) === 400
  );

  // ============================================================
  // (d) Détection automatique de candidats
  // ============================================================
  console.log('\n— (d) Détection de candidats (noms propres récurrents) —');
  const extraitLivre = [
    'Ravenswood stood on the cliff. The wind howled over Ravenswood.',
    'Elizabeth Bennet walked to Ravenswood with Elizabeth Bennet’s umbrella.',
    'Night fell fast. The night was cold, and night came again.',
    'Chapter Three. Ravenswood awaited Elizabeth Bennet.',
    'The storm broke. The rain fell on Ravenswood.',
  ].join('\n');
  const candidats = detecterCandidatsGlossaire(extraitLivre, { dejaConnus: ['Corbeaud'] });
  console.log('  candidats :', JSON.stringify(candidats));
  const sources = candidats.map((c) => c.source);
  verifier('« Ravenswood » détecté', sources.includes('Ravenswood'));
  verifier('« Elizabeth Bennet » détecté', sources.includes('Elizabeth Bennet'));
  verifier(
    '« The » (mot-outil) écarté',
    !sources.some((s) => s.toLowerCase() === 'the')
  );
  verifier('« Night » (vu aussi en minuscule) écarté', !sources.includes('Night'));
  verifier('aucun candidat vide', candidats.every((c) => c.source.trim().length > 0));
  verifier(
    'candidats triés par score décroissant',
    candidats.every((c, i) => i === 0 || candidats[i - 1].score >= c.score)
  );
  verifier(
    'normalisation insensible à la casse',
    normaliserSource('  RAVENSWOOD ') === normaliserSource('ravenswood')
  );

  console.log(
    `\n${echecs === 0 ? '✓ TOUS LES TESTS PASSENT' : `✗ ${echecs} ÉCHEC(S)`}\n`
  );
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Erreur inattendue :', e);
  process.exit(1);
});
