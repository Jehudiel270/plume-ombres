// ============================================================
// scripts/preuve-bascule-modele.mts
//
// PREUVE DU CORRECTIF — bascule AU NIVEAU DU MODÈLE.
//
// Scénario 1 — INJECTION DE PANNE : le modèle préféré accepte la
//   connexion puis reste SILENCIEUX (le mode de panne réellement
//   observé : le 503 « high demand » qui pend). On vérifie que le
//   délai PROPRE AU MODÈLE (GEMINI_MODEL_TIMEOUT_MS) coupe court et
//   que le modèle suivant sert la traduction — sans perdre Gemini
//   ni consommer le budget global de la chaîne.
//   C'est exactement ce qui ÉCHOUAIT avant le correctif : la requête
//   figée consommait les 20 s du budget de la chaîne et faisait
//   retomber le produit sur `google`.
//
// Scénario 2 — MODÈLE INEXISTANT/REFUSÉ (404 réel) : on vérifie
//   qu'un GEMINI_MODEL invalide bascule toujours sur un modèle
//   valide de la liste élargie.
//
// Usage : npx tsx scripts/preuve-bascule-modele.mts
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
  /* environnement courant */
}

const VRAI_FETCH = globalThis.fetch;
const EXTRAIT =
  'She pressed her back against the cold stone wall of the alley. ' +
  'The night smelled of rain and regret, and the city was silent. ' +
  'He looked at her with those gray eyes, and she looked away.';

const { traduireAvecSecours } = await import('../lib/providers');
const { modeleGemini, modelesGemini, delaiModeleMs } = await import('../lib/providers/gemini');

const urlsModele: string[] = [];
function modeleDe(url: string): string {
  const g = url.match(/models\/([^:]+):/);
  return g ? g[1] : '(non-gemini)';
}

async function scenario1() {
  console.log('--- SCÉNARIO 1 : modèle préféré SILENCIEUX (requête qui pend) ---');
  process.env.GEMINI_MODEL_TIMEOUT_MS = '2500';
  const prefere = modeleGemini();

  globalThis.fetch = (async (entree: any, init?: any): Promise<Response> => {
    const url = typeof entree === 'string' ? entree : String(entree?.url ?? entree);
    if (url.includes('generativelanguage.googleapis.com')) {
      const modele = modeleDe(url);
      urlsModele.push(modele);
      if (modele === prefere) {
        // PANNE INJECTÉE : la socket est acceptée, la réponse ne vient
        // JAMAIS. Seul l'abandon (délai propre au modèle) débloque.
        return new Promise<Response>((_r, rejeter) => {
          const signal: AbortSignal | undefined = init?.signal;
          const echouer = () => rejeter(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          if (!signal) return;
          if (signal.aborted) return echouer();
          signal.addEventListener('abort', echouer, { once: true });
        });
      }
    }
    return VRAI_FETCH(entree, init); // les autres modèles : appels RÉELS
  }) as typeof fetch;

  const t0 = Date.now();
  const r = await traduireAvecSecours(EXTRAIT, { source: 'en', cible: 'fr' }, ['gemini']);
  const ms = Date.now() - t0;

  console.log(`  délai par modèle configuré : ${delaiModeleMs()} ms`);
  console.log(`  modèles sollicités         : ${urlsModele.join(' → ')}`);
  console.log(`  moteur retenu              : ${r.fournisseur}`);
  console.log(`  durée totale               : ${ms} ms  (budget de la chaîne : 20000 ms)`);
  console.log(`  aperçu                     : ${r.traduit.slice(0, 90)}`);

  if (r.fournisseur !== 'gemini') throw new Error('S1 : Gemini perdu (bascule moteur annoncée)');
  if (urlsModele.length < 2) throw new Error('S1 : le 2e modèle n’a pas été essayé');
  if (ms > 15000) throw new Error(`S1 : budget global consommé (${ms} ms)`);
  console.log('  ✓ le délai par modèle coupe le modèle figé et le suivant répond\n');
  delete process.env.GEMINI_MODEL_TIMEOUT_MS;
  globalThis.fetch = VRAI_FETCH;
  return { modeleFigé: prefere, modèleRetenu: urlsModele[urlsModele.length - 1], ms, moteur: r.fournisseur };
}

async function scenario2() {
  console.log('--- SCÉNARIO 2 : GEMINI_MODEL inexistant (404 réel) ---');
  const ancien = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-2.5-flash'; // réellement 404 sur cette clé
  urlsModele.length = 0;
  globalThis.fetch = (async (entree: any, init?: any): Promise<Response> => {
    const url = typeof entree === 'string' ? entree : String(entree?.url ?? entree);
    if (url.includes('generativelanguage.googleapis.com')) urlsModele.push(modeleDe(url));
    return VRAI_FETCH(entree, init);
  }) as typeof fetch;

  console.log(`  liste essayée : ${modelesGemini().join(' → ')}`);
  const t0 = Date.now();
  const r = await traduireAvecSecours(EXTRAIT, { source: 'en', cible: 'fr' }, ['gemini']);
  const ms = Date.now() - t0;
  console.log(`  modèles appelés  : ${urlsModele.join(' → ')}`);
  console.log(`  moteur retenu    : ${r.fournisseur} — ${ms} ms`);
  console.log(`  aperçu           : ${r.traduit.slice(0, 90)}`);
  if (r.fournisseur !== 'gemini') throw new Error('S2 : Gemini perdu après un modèle 404');
  if (!r.traduit.trim()) throw new Error('S2 : traduction vide');
  console.log('  ✓ un modèle refusé bascule sur un modèle valide\n');
  if (ancien === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = ancien;
  globalThis.fetch = VRAI_FETCH;
  return { modeleInvalide: 'gemini-2.5-flash', modèleRetenu: urlsModele[urlsModele.length - 1], ms };
}

async function principal() {
  console.log('=== PREUVE DU CORRECTIF — BASCULE AU NIVEAU DU MODÈLE ===');
  console.log(`modèle préféré : ${modeleGemini()}`);
  console.log(`liste          : ${modelesGemini().join(' → ')}\n`);
  const s1 = await scenario1();
  const s2 = await scenario2();
  console.log('RÉSUMÉ_JSON ' + JSON.stringify({ s1, s2 }));
  console.log('\n✓ LES DEUX SCÉNARIOS PASSENT — le correctif tient.');
}

principal().catch((e) => {
  console.error('ÉCHEC :', e instanceof Error ? e.message : e);
  globalThis.fetch = VRAI_FETCH;
  process.exit(1);
});
