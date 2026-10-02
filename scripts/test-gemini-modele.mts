// ============================================================
// scripts/test-gemini-modele.mts — PREUVE RÉELLE Gemini (W6/A6).
//
//   1. Charge .env.local (aucune valeur secrète n'est affichée).
//   2. Traduit un extrait littéraire avec le modèle par défaut
//      (`gemini-flash-latest`) : modèle + durée MESURÉS.
//   3. Prouve qu'un modèle REFUSÉ (« no longer available to new
//      users » / inconnu) déclenche la BASCULE vers le moteur
//      suivant — c'est une panne de fournisseur comme une autre.
//
// Usage : npx tsx scripts/test-gemini-modele.mts
// ============================================================

import { readFileSync } from 'node:fs';

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

const EXTRAIT =
  'He traced the scar along her collarbone, and the whole world narrowed to the ' +
  'space between his thumb and her pulse. Some cages are made of silk.';

async function principal() {
  const { fournisseurParId, traduireAvecSecours } = await import('../lib/providers');
  const { modeleGemini, cleGemini } = await import('../lib/providers/gemini');

  console.log('=== PREUVE RÉELLE GEMINI ===\n');
  console.log(`clé Gemini présente : ${cleGemini() ? 'oui' : 'non'}`);
  console.log(`modèle par défaut   : ${modeleGemini()}\n`);
  if (!cleGemini()) {
    console.error('Aucune GEMINI_API_KEY : test impossible.');
    process.exit(1);
  }

  const resume: Record<string, unknown> = { modele: modeleGemini() };

  // --- 1. Traduction réelle (avec reprise sur 503 « high demand ») ---
  const gemini = fournisseurParId('gemini');
  let traduit = '';
  let directMs = 0;
  let derniereErreur = '';
  for (let essai = 1; essai <= 4 && !traduit; essai++) {
    const t0 = Date.now();
    try {
      traduit = await gemini.traduire(EXTRAIT, { source: 'en', cible: 'fr' });
      directMs = Date.now() - t0;
    } catch (e) {
      derniereErreur = e instanceof Error ? e.message : String(e);
      console.log(`   tentative ${essai} échouée : ${derniereErreur.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, 2500 * essai));
    }
  }
  if (!traduit) {
    console.error('Gemini indisponible après 4 essais :', derniereErreur);
    process.exit(1);
  }
  console.log(`[DIRECT] Gemini ${modeleGemini()} en ${directMs} ms :\n  ${traduit}\n`);
  resume.geminiDirect = {
    modele: modeleGemini(),
    ms: directMs,
    caracteres: traduit.length,
    apercu: traduit.slice(0, 140),
  };

  // --- 2. La chaîne retient Gemini (ou bascule honnêtement si le
  //        tier gratuit est momentanément saturé — 503 fréquents). ---
  let r: Awaited<ReturnType<typeof traduireAvecSecours>> | null = null;
  let chaineMs = 0;
  for (let essai = 1; essai <= 3; essai++) {
    const t1 = Date.now();
    r = await traduireAvecSecours(EXTRAIT, { source: 'en', cible: 'fr' }, [
      'gemini',
      'mymemory',
    ] as const);
    chaineMs = Date.now() - t1;
    if (r.fournisseur === 'gemini') break;
    console.log(
      `[CHAÎNE] essai ${essai} : Gemini saturé → repli ${r.fournisseur} (${r.essais} moteur(s) essayé(s))`
    );
    await new Promise((res) => setTimeout(res, 4000));
  }
  console.log(
    `[CHAÎNE] moteur retenu : ${r!.fournisseur} (${r!.essais} essayé(s)) en ${chaineMs} ms`
  );
  resume.chaineGemini = { fournisseur: r!.fournisseur, ms: chaineMs, essais: r!.essais };

  // --- 3. Modèle REFUSÉ ⇒ jamais d'échec net (bascule modèle ou moteur) ---
  process.env.GEMINI_MODEL = 'gemini-modele-inexistant-xyz';
  const t2 = Date.now();
  const r2 = await traduireAvecSecours(
    EXTRAIT,
    { source: 'en', cible: 'fr' },
    ['gemini', 'mymemory']
  );
  const basculeMs = Date.now() - t2;
  console.log(
    `[MODÈLE INVALIDE] moteur retenu : ${r2.fournisseur} (${r2.essais} essayé(s)) en ${basculeMs} ms`
  );
  if (!r2.traduit || !r2.traduit.trim()) {
    throw new Error('Modèle invalide : aucune traduction rendue (échec net).');
  }
  resume.modeleRefuse = {
    modeleTeste: 'gemini-modele-inexistant-xyz',
    fournisseurRetenu: r2.fournisseur,
    ms: basculeMs,
    essais: r2.essais,
    apercu: r2.traduit.slice(0, 80),
  };
  delete process.env.GEMINI_MODEL;

  console.log('\nRÉSUMÉ_JSON ' + JSON.stringify(resume));
  console.log('\n✓ Gemini réel + bascule sur modèle refusé : OK');
}

principal().catch((e) => {
  console.error('ÉCHEC :', e instanceof Error ? e.message : e);
  process.exit(1);
});
