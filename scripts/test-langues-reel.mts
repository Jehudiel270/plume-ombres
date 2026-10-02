// ============================================================
// scripts/test-langues-reel.mts — PREUVE RÉELLE du catalogue
// étendu (vague 7) : on traduit une phrase anglaise vers des
// langues NOUVELLES (au-delà de fr/en) via la vraie chaîne, et on
// mesure quel moteur a servi chaque paire.
//
// Usage : npx tsx scripts/test-langues-reel.mts
// ============================================================

import { readFileSync } from 'node:fs';
import { libelleLangue } from '../lib/types';

try {
  for (const ligne of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* pas de .env.local */
}

const PHRASE =
  'She pressed her back against the cold stone wall, and the night held its breath.';

const CIBLES: Array<[string, string]> = [
  ['fr', 'Français'],
  ['es', 'Espagnol'],
  ['de', 'Allemand'],
  ['ar', 'Arabe'],
  ['sw', 'Swahili'],
  ['zh', 'Chinois (simplifié)'],
  ['hi', 'Hindi'],
];

async function principal() {
  const { traduireAvecSecours, ordreSecours, descriptionMoteur } = await import(
    '../lib/providers'
  );

  console.log('=== PREUVE RÉELLE — CATALOGUE DE LANGUES ÉTENDU ===\n');
  console.log(`chaîne : ${ordreSecours().join(' → ')}\n`);

  const resultats: Array<Record<string, unknown>> = [];
  let echecs = 0;

  for (const [code, attendu] of CIBLES) {
    const libelle = libelleLangue(code);
    if (libelle !== attendu) {
      throw new Error(`libellé de ${code} = « ${libelle} », attendu « ${attendu} »`);
    }
    const t0 = Date.now();
    try {
      const r = await traduireAvecSecours(PHRASE, { source: 'en', cible: code });
      const ms = Date.now() - t0;
      const vide = !r.traduit || r.traduit.trim().length === 0;
      if (vide) echecs += 1;
      console.log(
        `en → ${code.padEnd(3)} (${libelleLangue(code)}) : ${r.fournisseur} en ${ms} ms` +
          `${r.prive ? ' [PRIVÉ]' : ''}`
      );
      console.log(`      « ${r.traduit.slice(0, 110)} »`);
      resultats.push({
        cible: code,
        libelle: libelleLangue(code),
        moteur: r.fournisseur,
        prive: r.prive,
        ms,
        caracteres: r.traduit.length,
      });
    } catch (e) {
      echecs += 1;
      console.log(`en → ${code} : ÉCHEC (${(e as Error).message.slice(0, 80)})`);
      resultats.push({ cible: code, moteur: null, erreur: (e as Error).message.slice(0, 80) });
    }
  }

  const parMoteur: Record<string, number> = {};
  for (const r of resultats) {
    const m = (r.moteur as string) ?? 'echec';
    parMoteur[m] = (parMoteur[m] ?? 0) + 1;
  }

  console.log('\nRÉSUMÉ_JSON ' + JSON.stringify({ resultats, parMoteur, echecs }));
  console.log('\n' + descriptionMoteur('libretranslate'));
  if (echecs > 0) {
    console.error(`\n${echecs} langue(s) en échec`);
    process.exit(1);
  }
  console.log('✓ toutes les langues testées ont été traduites');
}

principal().catch((e) => {
  console.error('ÉCHEC :', e instanceof Error ? e.message : e);
  process.exit(1);
});
