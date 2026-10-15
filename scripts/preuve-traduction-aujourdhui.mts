// ============================================================
// scripts/preuve-traduction-aujourdhui.mts
//
// PREUVE D'EXÉCUTION RÉELLE — « la traduction marche-t-elle
// AUJOURD'HUI malgré gemini-flash-latest en 503 ? »
//
// Aucun mock : on appelle la VRAIE chaîne de secours du projet
// (lib/providers/fallback → traduireAvecSecours) avec l'ordre
// RÉEL résolu par ordreSecours(), sur un extrait de roman
// anglais d'environ 3 000 caractères.
//
// Un intercepteur de `fetch` (transparent : il rappelle le vrai
// fetch) journalise, moteur par moteur, l'URL appelée et le code
// HTTP reçu — c'est ce qui permet d'affirmer QUEL modèle Gemini a
// réellement produit la traduction, information que la chaîne de
// secours n'expose pas dans son résultat.
//
// Aucune valeur de clé n'est affichée.
//
// Usage : npx tsx scripts/preuve-traduction-aujourdhui.mts
// ============================================================

import { readFileSync } from 'node:fs';

// --- Chargement de .env.local (jamais affiché) -----------------
try {
  for (const ligne of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, cle, valeur] = m;
    if (process.env[cle] === undefined) process.env[cle] = valeur.trim();
  }
} catch {
  /* pas de .env.local : on continue avec l'environnement courant */
}

// --- Intercepteur fetch TRANSPARENT (traçage des appels) -------
interface Appel {
  moteur: string;
  detail: string;
  statut: number | null;
  ms: number;
  ok: boolean;
}

const appels: Appel[] = [];
const VRAI_FETCH = globalThis.fetch;

function moteurDe(url: string): { moteur: string; detail: string } {
  if (url.includes('127.0.0.1:5000') || url.includes('localhost:5000') || /:5\d\d\d\//.test(url))
    return { moteur: 'libretranslate', detail: 'auto-hébergé' };
  const g = url.match(/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:]+):/);
  if (g) return { moteur: 'gemini', detail: g[1] };
  if (url.includes('translate.googleapis.com')) return { moteur: 'google', detail: 'endpoint public' };
  if (url.includes('api.mymemory.translated.net')) return { moteur: 'mymemory', detail: 'API publique' };
  return { moteur: 'inconnu', detail: url.slice(0, 80) };
}

globalThis.fetch = (async (entree: any, init?: any): Promise<Response> => {
  const url =
    typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : String(entree?.url ?? entree);
  const { moteur, detail } = moteurDe(url);
  const t0 = Date.now();
  try {
    const r = await VRAI_FETCH(entree, init);
    appels.push({ moteur, detail, statut: r.status, ms: Date.now() - t0, ok: r.ok });
    return r;
  } catch (e) {
    appels.push({ moteur, detail, statut: null, ms: Date.now() - t0, ok: false });
    throw e;
  }
}) as typeof fetch;

// --- Extrait de roman anglais (~3 000 caractères) ---------------
const EXTRAIT = `The house on Rue des Ombres had been waiting for her, the way a wound waits for the blade.

Lila pressed her palm flat against the door and felt the cold climb her wrist like a confession. Somewhere behind the shutters, a clock she had never wound was still counting. She had spent eleven years telling herself that she would never come back to this street, and eleven years is a long time to keep a promise you never intended to keep.

"Do not go in," he had said, the night before, on the bridge, with the river thrashing beneath them like something drowned and furious. His voice had been low, careful, the voice of a man describing a fire to someone standing inside it. "Whatever it says to you in there, it is not her. It only wears her."

She had laughed then. She remembered the sound of her own laughter, and how it had died in her throat when she saw that he was not laughing at all.

The lock gave way as though it had been oiled for her. Inside, the air was thick and sweet, the smell of lilies left too long in standing water, and beneath it something older, something like iron and rain. The hallway stretched away into a dark that did not behave like darkness. It leaned. It breathed. It made room for her, the way a mouth makes room for a lie.

On the wall, the photographs had been turned to face the plaster, every single one, as if the people in them had been told to look away. She turned one back. Her mother's face, younger than Lila was now, smiling at someone just outside the frame. She turned another. Herself, nine years old, standing in this same hallway, holding the hand of a woman who was not in the picture.

"Lila."

The voice came from the top of the stairs. It was her mother's voice, exactly, down to the small catch on the second syllable, the catch she had spent years trying to forget and had never once managed to. It was so perfect that it was obscene.

"I waited," the voice said, gently, the way a hand closes around a throat. "I waited so long for you to come home. Don't you want to see me?"

She should have run. Any sensible girl would have run. But she had not been sensible since the winter her mother died, and somewhere under the floorboards of her own chest, something had been listening for that voice for eleven years, straining toward it, starving for it.

She put her foot on the first stair. The wood did not creak. It welcomed her.

By the third stair she understood that the house was not haunted. Haunted would have been a mercy. The house was hungry, and hunger is patient in a way that grief has never managed to be. It had learned her mother's voice the way she had learned to survive without it: slowly, thoroughly, until the imitation was better than the thing it killed.

At the top of the stairs, a door stood ajar, and behind it, a candle burned without smoke, and someone who was not her mother said her name again, and this time it got the second syllable wrong.`;

// --- Instrumentation : profondeur d'un objet de résultat -------
const { ordreSecours, traduireAvecSecours, modePriveStrict } = await import('../lib/providers');
const { modeleGemini, modelesGemini } = await import('../lib/providers/gemini');

async function principal() {
  console.log('=== PREUVE D’EXÉCUTION RÉELLE — TRADUCTION AUJOURD’HUI ===');
  console.log(`horodatage            : ${new Date().toISOString()}`);
  console.log(`longueur de l’extrait : ${EXTRAIT.length} caractères`);
  console.log(`modèle Gemini préféré : ${modeleGemini()}`);
  console.log(`liste de modèles      : ${modelesGemini().join(' → ')}`);
  console.log(`ordre réel de la chaîne : ${ordreSecours().join(' → ')}`);
  console.log(`mode privé strict     : ${modePriveStrict()}`);
  console.log('');

  const t0 = Date.now();
  const resultat = await traduireAvecSecours(EXTRAIT, { source: 'en', cible: 'fr' });
  const dureeMs = Date.now() - t0;

  console.log('--- APPELS RÉSEAU RÉELLEMENT EFFECTUÉS (dans l’ordre) ---');
  for (const a of appels) {
    console.log(
      `  ${a.moteur.padEnd(14)} ${String(a.statut ?? 'PANNE').padEnd(6)} ${String(a.ms).padStart(6)} ms  ${a.detail}`
    );
  }
  console.log('');

  // Modèle Gemini ayant réellement renvoyé 200 (le cas échéant).
  const geminiOk = appels.filter((a) => a.moteur === 'gemini' && a.ok).pop();
  const geminiEchecs = appels.filter((a) => a.moteur === 'gemini' && !a.ok);

  console.log('--- RÉSULTAT ---');
  console.log(`moteur retenu  : ${resultat.fournisseur}  (${resultat.nomFournisseur})`);
  if (geminiOk) console.log(`modèle utilisé : ${geminiOk.detail}`);
  else console.log('modèle utilisé : — (Gemini n’a pas servi)');
  console.log(`modèles écartés: ${geminiEchecs.map((e) => `${e.detail}=${e.statut}`).join(', ') || '—'}`);
  console.log(`durée totale   : ${dureeMs} ms  (tentative gagnante : ${resultat.dureeMs} ms)`);
  console.log(`moteurs essayés: ${resultat.essais} — tentatives réseau : ${resultat.tentatives}`);
  console.log(`privé          : ${resultat.prive} (strict : ${resultat.priveStrict})`);
  console.log('');
  console.log('--- 400 PREMIERS CARACTÈRES DE LA TRADUCTION FRANÇAISE ---');
  console.log(resultat.traduit.slice(0, 400));
  console.log('');

  const ok = typeof resultat.traduit === 'string' && resultat.traduit.trim().length > 200;
  console.log(
    `VERDICT : ${ok ? 'LA TRADUCTION FONCTIONNE' : 'LA TRADUCTION NE FONCTIONNE PAS'} ` +
      `(moteur=${resultat.fournisseur}, modèle=${geminiOk?.detail ?? 'n/a'}, ${dureeMs} ms)`
  );
  console.log(
    'RÉSUMÉ_JSON ' +
      JSON.stringify({
        moteur: resultat.fournisseur,
        modele: geminiOk?.detail ?? null,
        dureeMs,
        dureeGagnanteMs: resultat.dureeMs,
        essais: resultat.essais,
        tentatives: resultat.tentatives,
        caracteres: resultat.traduit.length,
        appels: appels.map((a) => `${a.moteur}:${a.detail}:${a.statut}`),
      })
  );
  process.exit(ok ? 0 : 1);
}

principal().catch((e) => {
  console.error('ÉCHEC DE LA CHAÎNE :', e instanceof Error ? e.message : e);
  console.log(
    'RÉSUMÉ_JSON ' + JSON.stringify({ erreur: String(e), appels: appels.map((a) => `${a.moteur}:${a.detail}:${a.statut}`) })
  );
  process.exit(1);
});
