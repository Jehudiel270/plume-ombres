// ============================================================
// Test de pipeline complet HORS base de données :
// import d'un texte test (~500 mots) → découpage → traduction
// (MyMemory, sans clé) → réassemblage. Vérifie la structure.
// Usage : npx tsx scripts/test-pipeline.ts
// ============================================================

import { preparerLivre, MAX_CHARS_SEGMENT } from '../lib/import-livre';
import { verifierIntegrite, decouperTexte, assembler } from '../lib/segmenter';
import { FournisseurMyMemory } from '../lib/providers/mymemory';

process.env.MYMEMORY_EMAIL = 'plume-ombres@exemple.com'; // quota supérieur

// --- Texte de test : dark romance, ~500 mots, plusieurs paragraphes,
// dont un paragraphe volontairement plus long que la limite segment.
const TEXTE_TEST = `Chapter One

The night smelled of rain and regret.

Isabella pressed her back against the cold stone wall of the alley, her heart hammering against her ribs like a caged bird. She had not planned to be here, hunted through the streets of Paris by men who served a master she refused to name, even to herself. The velvet darkness swallowed the city whole, and somewhere above, a window opened, spilling a blade of golden light across the cobblestones.

She dared to breathe.

"You should not have run from me, little dove." The voice came from behind her, low and warm, the kind of voice that promised both salvation and ruin. She knew it. She had known it since the night he had first appeared at the opera, watching her from the shadows of the gilded box, his eyes the color of aged whiskey and twice as dangerous.

Isabella closed her eyes. "Let me go, Lucien."

"I cannot," he said simply, and the honesty in his voice was worse than any lie. "You carry my name in your blood now, and I will follow you through every lifetime until you stop running."

Chapter Two

He stepped into the light, and the world tilted.

He was beautiful in the way that storms are beautiful: magnificent, merciless, impossible to look away from. His coat was black, his collar loose, and on his wrist gleamed a silver bracelet that she recognized at once — the one she had thrown into the Seine the night she had sworn to forget him.

"You kept it," she whispered.

"I kept everything," Lucien replied, and his smile was slow and devastating. "Every letter you never sent. Every door you closed in my face. Every night I stood beneath your window in the rain, telling myself that one day you would look at me and see not the monster, but the man who loved you enough to become one."

Isabella felt the cold seep through her thin dress, felt the weight of three years of silence pressing down upon her shoulders. She could run again. She could disappear into the labyrinth of the city and lose herself among the living. But her feet would not move, and her voice, when it finally came, was barely a breath: "Why do you love me, Lucien? I have given you nothing but pain."

"You have given me everything," he said, closing the distance between them until she could smell the rain on his skin and the faint, intoxicating scent of sandalwood and smoke. "You have given me a reason to feel. And I have spent every day since you left learning to be worthy of the fire you lit in me. Stay, Isabella. Not because I command it, but because you want to."

The rain began to fall again, soft and cold against her burning cheeks, and for the first time in three years, Isabella did not run.

She stayed.
`;

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

async function principal() {
  console.log('— Import & découpage —');
  const livre = preparerLivre(TEXTE_TEST, 'cendres-de-paris.txt');
  console.log(
    `  ${livre.chapitres.length} chapitre(s), ${livre.totalSegments} segments (limite ${MAX_CHARS_SEGMENT} car.)`
  );
  verifier('2 chapitres détectés', livre.chapitres.length === 2);
  verifier('segments > 0', livre.totalSegments > 0);
  verifier(
    'segments ≤ limite',
    livre.chapitres.every((c) => c.segments.every((s) => s.source.length <= MAX_CHARS_SEGMENT))
  );
  verifier(
    'intégrité texte_source par chapitre',
    livre.chapitres.every(
      (c) => verifierIntegrite(c.texte_source, decouperTexte(c.texte_source, MAX_CHARS_SEGMENT))
    )
  );

  // Paragraphe volontairement éclaté en plusieurs segments (test du découpage).
  const longParagraphe = 'Her eyes were the color of embers and her laughter was a blade. '.repeat(20);
  const unitesLong = decouperTexte(longParagraphe, MAX_CHARS_SEGMENT);
  verifier(
    'paragraphe géant découpé',
    unitesLong.length > 1 &&
      verifierIntegrite(longParagraphe, unitesLong) &&
      unitesLong.every((u) => u.source.length <= MAX_CHARS_SEGMENT)
  );

  console.log('— Traduction EN→FR (MyMemory) —');
  const fournisseur = new FournisseurMyMemory();
  let traduits = 0;
  const debut = Date.now();
  const livreTraduit = [];

  for (const chapitre of livre.chapitres) {
    const resultats: Array<{ traduit: string | null; suite: string }> = [];
    for (const segment of chapitre.segments) {
      if (!segment.source) {
        resultats.push({ traduit: null, suite: segment.suite });
        continue;
      }
      const texte = await fournisseur.traduire(segment.source, {
        source: 'en',
        cible: 'fr',
      });
      resultats.push({ traduit: texte, suite: segment.suite });
      traduits += 1;
      await new Promise((r) => setTimeout(r, 200));
    }
    const assemble = assembler(resultats);
    livreTraduit.push({ titre: chapitre.titre, texte: assemble });
  }
  console.log(`  ${traduits} segments traduits en ${((Date.now() - debut) / 1000).toFixed(1)} s`);

  const chap1 = livreTraduit[0];
  const chap2 = livreTraduit[1];

  verifier('chapitre 1 traduit non vide', chap1.texte.trim().length > 0);
  verifier('chapitre 2 traduit non vide', chap2.texte.trim().length > 0);
  verifier(
    'structure conservée : nb de paragraphes identique',
    chap1.texte.trim().split('\n\n').length ===
      livre.chapitres[0].texte_source.trim().split('\n\n').length
  );

  // Extraction d'un échantillon français pour contrôle visuel.
  const extrait = chap1.texte
    .split('\n\n')
    .slice(0, 3)
    .map((p) => p.trim())
    .join('\n\n');
  console.log('\n— Aperçu du chapitre 1 traduit —\n');
  console.log(extrait.slice(0, 600));
  console.log('\n');

  console.log(echecs === 0 ? '✓ Pipeline complet OK.' : `✗ ${echecs} échec(s).`);
  process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
