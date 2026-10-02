// ============================================================
// scripts/test-gemini-reel.mts — PREUVE RÉELLE Gemini.
//
//   1. Charge .env.local (sans jamais afficher de valeur).
//   2. Traduit une phrase littéraire avec le modèle par défaut
//      (`gemini-flash-latest`) : modèle + durée mesurés.
//   3. Prouve qu'un modèle INDISPONIBLE (« no longer available to
//      new users » / inconnu) déclenche bien la BASCULE vers le
//      moteur suivant, sans perdre le travail.
//
// Usage : npx tsx scripts/test-gemini-reel.mts
// ============================================================

import { readFileSync } from 'node:fs';
import { modeleGemini, modelesGemini, cleGemini, FournisseurGemini } from '../lib/providers/gemini';
import { traduireAvecSecours, ErreurChaineSecours } from '../lib/providers/fallback';

// --- Chargement minimal de .env.local (sans clé jamais imprimée) ---
try {
  for (const ligne of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, cle, valeur] = m;
    if (process.env[cle] === undefined) process.env[cle] = valeur.trim();
  }
} catch {
  console.log('(.env.local absent — variables d’environnement uniquement)');
}

const PHRASE =
  'She pressed her back against the cold stone wall, and the night held its breath.';

console.log('=== PREUVE RÉELLE GEMINI ===\n');
console.log(`clé présente : ${cleGemini() ? 'oui' : 'non'}`);
console.log(`modèle      : ${modeleGemini()}`);
console.log(`modèles (bascule) : ${modelesGemini().join(' → ')}\n`);

// ---------- 1. Traduction réelle avec le modèle par défaut ----------
{
  const fournisseur = new FournisseurGemini();
  const t0 = Date.now();
  try {
    const traduit = await fournisseur.traduire(PHRASE, { source: 'en', cible: 'fr' });
    const ms = Date.now() - t0;
    console.log(`[OK] ${modeleGemini()} en ${ms} ms`);
    console.log(`     EN : ${PHRASE}`);
    console.log(`     FR : ${traduit}`);
    console.log(
      `     ${PHRASE.length} caractères → ${Math.round((PHRASE.length / ms) * 1000)} car/s\n`
    );
  } catch (e) {
    console.log(`[ÉCHEC] ${(e as Error).message}\n`);
    process.exitCode = 1;
  }
}

// ---------- 2. Modèle indisponible ⇒ bascule AU NIVEAU DU MODÈLE ----------
{
  const ancien = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'modele-inexistant-xyz-000';
  console.log(`modèle forcé (test de bascule) : ${modeleGemini()}`);
  console.log(`liste de repli : ${modelesGemini().join(' → ')}`);
  const t0 = Date.now();
  try {
    const r = await traduireAvecSecours(
      PHRASE,
      { source: 'en', cible: 'fr' },
      ['gemini', 'mymemory']
    );
    const ms = Date.now() - t0;
    console.log(
      `[BASCULE MODÈLE OK] moteur : ${r.fournisseur} · ${r.essais} moteur(s) · ${ms} ms`
    );
    console.log(`     FR : ${r.traduit}`);
    // Un modèle auxiliaire fermé/saturé ne doit PAS faire tomber Gemini :
    // le modèle de secours prend le relais, et le moteur reste Gemini.
    if (r.fournisseur !== 'gemini') {
      console.log(
        `     ✗ Gemini a été abandonné alors que le modèle de secours était disponible`
      );
      process.exitCode = 1;
    } else if ((r.traduit ?? '').trim().length === 0) {
      console.log('     ✗ traduction vide');
      process.exitCode = 1;
    } else {
      console.log('     ✓ le modèle indisponible a été absorbé sans perdre l’appel');
    }
  } catch (e) {
    if (e instanceof ErreurChaineSecours) {
      console.log(
        `[ÉCHEC CHAÎNE] ${e.echecs.map((x) => x.id + ':' + x.categorie).join(', ')}`
      );
    } else {
      console.log('[ÉCHEC]', (e as Error).message);
    }
    process.exitCode = 1;
  } finally {
    if (ancien === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = ancien;
  }
}

console.log('\n=== FIN ===');
