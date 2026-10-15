// ============================================================
// providers/gemini.test.ts — Bascule AU NIVEAU DU MODÈLE.
//
// Régression du correctif « modèle préféré instable » :
//  • 503 / 404 sur le modèle préféré ⇒ le modèle suivant sert ;
//  • modèle préféré SILENCIEUX (requête qui pend) ⇒ le délai
//    PROPRE AU MODÈLE coupe court et le suivant sert (avant le
//    correctif, la requête figée consommait tout le budget de la
//    chaîne de secours et faisait perdre Gemini) ;
//  • annulation demandée par l'appelant ⇒ propagée telle quelle ;
//  • tous les modèles en échec ⇒ erreur nette (jamais de succès muet).
//
// Aucune réseau réel : fetch est simulé.
//
// Lancement : npx tsx --test lib/providers/gemini.test.ts
// ============================================================

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FournisseurGemini, modelesGemini, VAR_DELAI_MODELE } from './gemini';

const VRAI_FETCH = globalThis.fetch;
const VARIABLES = ['GEMINI_API_KEY', 'GEMINI_MODEL', VAR_DELAI_MODELE] as const;
const envInitial: Record<string, string | undefined> = {};
for (const c of VARIABLES) envInitial[c] = process.env[c];

const TEXTE = 'She pressed her back against the cold stone wall.';

function modeleDe(url: string): string {
  const m = url.match(/models\/([^:]+):/);
  return m ? m[1] : '';
}

type Gestionnaire = (init?: RequestInit) => Response | Promise<Response>;

function definirFetch(selecteur: (modele: string) => Gestionnaire | null): string[] {
  const appeles: string[] = [];
  globalThis.fetch = (async (
    entree: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof entree === 'string'
        ? entree
        : entree instanceof URL
          ? entree.href
          : String((entree as Request).url);
    const modele = modeleDe(url);
    appeles.push(modele);
    const g = selecteur(modele);
    if (!g) throw new Error(`URL inattendue : ${url}`);
    return g(init);
  }) as typeof fetch;
  return appeles;
}

const okJson = (texte: string): Gestionnaire => () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const errHttp = (statut: number): Gestionnaire => () => new Response('err', { status: statut });

/** Répond jamais : seule l'annulation peut débloquer (panne « pendante »). */
const pend: Gestionnaire = (init) =>
  new Promise<Response>((_r, rejeter) => {
    const signal = init?.signal ?? undefined;
    if (!signal) return;
    const echouer = () => rejeter(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return echouer();
    signal.addEventListener('abort', echouer, { once: true });
  });

afterEach(() => {
  globalThis.fetch = VRAI_FETCH;
  for (const c of VARIABLES) {
    const v = envInitial[c];
    if (v === undefined) delete process.env[c];
    else process.env[c] = v;
  }
});

test('503 sur le modèle préféré ⇒ le modèle suivant sert', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.GEMINI_MODEL;
  const [prefere, secours] = modelesGemini();

  const appeles = definirFetch((modele) =>
    modele === prefere ? errHttp(503) : modele === secours ? okJson('Traduit.') : null
  );

  const r = await new FournisseurGemini().traduire(TEXTE, { source: 'en', cible: 'fr' });
  assert.equal(r, 'Traduit.');
  assert.deepEqual(appeles, [prefere, secours]);
});

test('modèle préféré SILENCIEUX ⇒ délai par modèle, le suivant sert', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  process.env[VAR_DELAI_MODELE] = '60'; // délai par modèle très court (test)
  delete process.env.GEMINI_MODEL;
  const [prefere, secours] = modelesGemini();

  const appeles = definirFetch((modele) =>
    modele === prefere ? pend : modele === secours ? okJson('Sauvé.') : null
  );

  const t0 = Date.now();
  const r = await new FournisseurGemini().traduire(TEXTE, { source: 'en', cible: 'fr' });
  const ms = Date.now() - t0;

  assert.equal(r, 'Sauvé.');
  assert.deepEqual(appeles, [prefere, secours]);
  assert.ok(ms < 5000, `le délai par modèle doit couper court (${ms} ms)`);
});

test('404 sur TOUS les modèles ⇒ erreur nette, jamais de succès muet', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.GEMINI_MODEL;
  const appeles = definirFetch(() => errHttp(404));

  await assert.rejects(
    () => new FournisseurGemini().traduire(TEXTE, { source: 'en', cible: 'fr' }),
    /404/
  );
  assert.equal(appeles.length, modelesGemini().length, 'tous les modèles doivent être essayés');
});

test('annulation demandée par l’appelant ⇒ propagée (pas de bascule)', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.GEMINI_MODEL;
  const appeles = definirFetch(() => pend);

  const controleur = new AbortController();
  controleur.abort(new DOMException('Annulé.', 'AbortError'));

  await assert.rejects(() =>
    new FournisseurGemini().traduire(TEXTE, {
      source: 'en',
      cible: 'fr',
      signal: controleur.signal,
    })
  );
  assert.ok(
    appeles.length <= 1,
    `aucune CASCADE de modèles ne doit avoir lieu (modèles appelés : ${appeles.join(', ')})`
  );
});

test('sans clé ⇒ erreur de configuration explicite', async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => new FournisseurGemini().traduire(TEXTE, { source: 'en', cible: 'fr' }),
    /GEMINI_API_KEY/
  );
});
