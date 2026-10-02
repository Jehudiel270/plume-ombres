// ============================================================
// providers/sante.test.ts — Contrôle de santé (sondes réelles,
// cache, mode privé strict). Lancement :
//   npx tsx --test lib/providers/sante.test.ts
// ============================================================

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifierChaine,
  verifierMoteur,
  viderCacheSante,
} from './sante';

const VRAI_FETCH = globalThis.fetch;

const VARIABLES = [
  'TRANSLATOR_PRIVE_STRICT',
  'TRANSLATOR_FALLBACK_ORDER',
  'TRANSLATOR_SANTE_TTL_MS',
  'TRANSLATOR_SANTE_TIMEOUT_MS',
  'GEMINI_API_KEY',
  'LIBRETRANSLATE_URL',
] as const;

const envInitial: Record<string, string | undefined> = {};
for (const cle of VARIABLES) envInitial[cle] = process.env[cle];

type Gestionnaire = () => Response | Promise<Response>;

/** Installe un fetch simulé qui COMPTE les appels par mot-clé d'URL. */
function definirFetch(
  selecteur: (url: string) => Gestionnaire | null,
  compteur: Map<string, number>
): void {
  globalThis.fetch = (async (entree: RequestInfo | URL) => {
    const url =
      typeof entree === 'string'
        ? entree
        : entree instanceof URL
          ? entree.href
          : String((entree as Request).url);
    for (const [cle, n] of [...compteur]) {
      if (url.includes(cle)) compteur.set(cle, n + 1);
    }
    const g = selecteur(url);
    if (!g) throw new Error(`URL inattendue : ${url}`);
    return g();
  }) as typeof fetch;
}

const okJson = (corps: unknown): Gestionnaire => () =>
  new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  globalThis.fetch = VRAI_FETCH;
  viderCacheSante();
  for (const cle of VARIABLES) {
    const v = envInitial[cle];
    if (v === undefined) delete process.env[cle];
    else process.env[cle] = v;
  }
});

test('santé : sonde réelle + cache (aucun appel répété)', async () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'libretranslate,mymemory';
  process.env.TRANSLATOR_SANTE_TTL_MS = '60000'; // cache long pour le test
  viderCacheSante();

  const compteur = new Map<string, number>([
    ['127.0.0.1:5000', 0],
    ['api.mymemory.translated.net', 0],
  ]);
  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) {
      return okJson({ translatedText: 'Bonjour le monde.' });
    }
    if (url.includes('api.mymemory.translated.net')) {
      return okJson({
        responseData: { translatedText: 'Bonjour.' },
        responseStatus: 200,
      });
    }
    return null;
  }, compteur);

  const s1 = await verifierChaine();
  assert.equal(s1.moteurs.length, 2);
  assert.equal(s1.moteurActif?.id, 'libretranslate');
  assert.equal(s1.moteurs[0].etat, 'ok');
  assert.ok((s1.moteurs[0].latenceMs ?? -1) >= 0);
  assert.equal(s1.moteurs[1].etat, 'ok');

  // Deuxième lecture SANS forcer : servie par le cache → 1 appel chacun.
  const s2 = await verifierChaine();
  assert.equal(s2.moteurActif?.id, 'libretranslate');
  assert.equal(compteur.get('127.0.0.1:5000'), 1, 'cache : pas de 2e sonde');
  assert.equal(compteur.get('api.mymemory.translated.net'), 1);

  // Forçage : une sonde de plus.
  await verifierChaine(true);
  assert.equal(compteur.get('127.0.0.1:5000'), 2, 'forcer ignore le cache');
});

test('santé : mode privé strict ⇒ tiers désactivés, privé seul sondé', async () => {
  process.env.TRANSLATOR_PRIVE_STRICT = '1';
  process.env.TRANSLATOR_FALLBACK_ORDER = 'libretranslate,google,mymemory';
  viderCacheSante();

  const compteur = new Map<string, number>([
    ['127.0.0.1:5000', 0],
    ['translate.googleapis.com', 0],
    ['api.mymemory.translated.net', 0],
  ]);
  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) {
      return okJson({ translatedText: 'Bonjour.' });
    }
    throw new Error(`tiers sollicité en mode privé strict : ${url}`);
  }, compteur);

  const s = await verifierChaine();
  assert.equal(s.priveStrict, true);
  assert.deepEqual(s.ordre, ['libretranslate']);
  assert.equal(s.moteurs.length, 1);
  assert.equal(s.moteurActif?.id, 'libretranslate');
  assert.equal(compteur.get('translate.googleapis.com'), 0);
  assert.equal(compteur.get('api.mymemory.translated.net'), 0);
});

test('santé : panne d’un moteur ⇒ indisponible, le suivant devient actif', async () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'libretranslate,mymemory';
  process.env.TRANSLATOR_SANTE_TTL_MS = '60000';
  viderCacheSante();

  definirFetch(
    (url) => {
      if (url.includes('127.0.0.1:5000')) {
        return () => new Response('boom', { status: 500 });
      }
      if (url.includes('api.mymemory.translated.net')) {
        return okJson({
          responseData: { translatedText: 'Bonjour.' },
          responseStatus: 200,
        });
      }
      return null;
    },
    new Map()
  );

  const s = await verifierChaine();
  assert.equal(s.moteurs[0].etat, 'indisponible');
  assert.equal(s.moteurs[0].cause, 'http');
  assert.equal(s.moteurActif?.id, 'mymemory');
});

test('santé : Gemini sans clé ⇒ non configuré (jamais sondé)', async () => {
  delete process.env.GEMINI_API_KEY;
  viderCacheSante();
  const m = await verifierMoteur('gemini', true);
  assert.equal(m.etat, 'non_configure');
  assert.equal(m.prive, false);
});
