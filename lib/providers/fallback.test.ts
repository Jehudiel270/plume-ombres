// ============================================================
// providers/fallback.test.ts — Test de la chaîne de secours.
//
// Mock de fetch global : on prouve la BASCULE automatique quand le
// premier moteur échoue (réseau, HTTP non-200, quota, timeout),
// la configuration par variable d'environnement, l'exposition du
// moteur réellement utilisé, et l'absence de fuite de texte dans
// le journal.
//
// Lancement : npx tsx --test lib/providers/fallback.test.ts
// ============================================================

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  traduireAvecSecours,
  ordreSecours,
  moteurUtilise,
  idMoteurUtilise,
  modePriveStrict,
  fournisseurEstPrive,
  descriptionMoteur,
  essaisSecours,
  ErreurChaineSecours,
  ORDRE_SECOURS_DEFAUT,
  IDS_PRIVES,
} from './fallback';

/** Marqueur unique : il ne doit JAMAIS apparaître dans le journal. */
const SECRET = 'LE_SECRET_DU_LIVRE_42';
const TEXTE = `Once upon a time ${SECRET} walked into the night.`;

const VRAI_FETCH = globalThis.fetch;
const VRAI_INFO = console.info;
const VRAI_ERROR = console.error;

const VARIABLES = [
  'GEMINI_API_KEY',
  'TRANSLATOR_FALLBACK_ORDER',
  'TRANSLATOR_FALLBACK_TIMEOUT_MS',
  'TRANSLATOR_FALLBACK_ESSAIS',
  'TRANSLATOR_FALLBACK_LOG',
  'TRANSLATOR_PRIVE_STRICT',
  'LIBRETRANSLATE_URL',
  'MYMEMORY_EMAIL',
] as const;

const envInitial: Record<string, string | undefined> = {};
for (const cle of VARIABLES) envInitial[cle] = process.env[cle];

let journal: string[] = [];

function capturerJournal(): void {
  journal = [];
  console.info = (...args: unknown[]) => {
    journal.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    journal.push(args.map(String).join(' '));
  };
}

type Gestionnaire = (
  init?: RequestInit
) => Response | Promise<Response>;

/** Installe un fetch simulé : la fonction choisit la réponse par URL. */
function definirFetch(selecteur: (url: string) => Gestionnaire | null): void {
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
    const gestionnaire = selecteur(url);
    if (!gestionnaire) {
      throw new Error(`URL inattendue dans le test : ${url}`);
    }
    return gestionnaire(init);
  }) as typeof fetch;
}

const okJson = (corps: unknown): Gestionnaire => () =>
  new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const errHttp = (statut: number, corps = 'erreur'): Gestionnaire => () =>
  new Response(corps, { status: statut });

const panneReseau = (): Gestionnaire => () => {
  throw new TypeError('fetch failed');
};

afterEach(() => {
  globalThis.fetch = VRAI_FETCH;
  console.info = VRAI_INFO;
  console.error = VRAI_ERROR;
  for (const cle of VARIABLES) {
    const valeur = envInitial[cle];
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
});

test('bascule LibreTranslate → Gemini quand le premier échoue (réseau)', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.TRANSLATOR_FALLBACK_ORDER;
  capturerJournal();

  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) return panneReseau();
    if (url.includes('generativelanguage.googleapis.com')) {
      return okJson({
        candidates: [{ content: { parts: [{ text: 'Il était une fois.' }] } }],
      });
    }
    return null;
  });

  const resultat = await traduireAvecSecours(TEXTE, {
    source: 'en',
    cible: 'fr',
  });

  assert.equal(resultat.fournisseur, 'gemini');
  assert.equal(resultat.essais, 2);
  assert.equal(resultat.traduit, 'Il était une fois.');
  assert.equal(idMoteurUtilise(), 'gemini');
  assert.match(moteurUtilise() ?? '', /Gemini/);
  assert.ok(
    !journal.join('\n').includes(SECRET),
    'le journal ne doit contenir aucun fragment du texte'
  );
});

test('bascule sur HTTP 500 puis quota 429, réussit sur Google', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.TRANSLATOR_FALLBACK_ORDER;
  capturerJournal();

  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) return errHttp(500);
    if (url.includes('generativelanguage.googleapis.com')) {
      return errHttp(429, 'quota dépassé');
    }
    if (url.includes('translate.googleapis.com')) {
      return okJson([[['Bonjour le monde', 'Once', null, null, 10]]]);
    }
    return null;
  });

  const resultat = await traduireAvecSecours(TEXTE, {
    source: 'en',
    cible: 'fr',
  });

  assert.equal(resultat.fournisseur, 'google');
  assert.equal(resultat.essais, 3);
  assert.equal(resultat.traduit, 'Bonjour le monde');

  const texteJournal = journal.join('\n');
  assert.match(texteJournal, /moteur=libretranslate/);
  assert.match(texteJournal, /moteur=gemini/);
  assert.match(texteJournal, /cause=quota/);
  assert.match(texteJournal, /moteur=google/);
  assert.ok(!texteJournal.includes(SECRET));
  assert.ok(!texteJournal.includes('Once upon'));
});

test('ordre configurable par TRANSLATOR_FALLBACK_ORDER', () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'mymemory,google,INCONNU';
  assert.deepEqual(ordreSecours(), ['mymemory', 'google']);

  process.env.TRANSLATOR_FALLBACK_ORDER = 'nimportequoi';
  assert.deepEqual(ordreSecours(), [...ORDRE_SECOURS_DEFAUT]);

  delete process.env.TRANSLATOR_FALLBACK_ORDER;
  assert.deepEqual(ordreSecours(), [...ORDRE_SECOURS_DEFAUT]);
});

test('MyMemory seul moteur configuré sert au premier essai', async () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'mymemory,google';
  process.env.GEMINI_API_KEY = 'cle-test';
  capturerJournal();

  definirFetch((url) => {
    if (url.includes('api.mymemory.translated.net')) {
      return okJson({
        responseData: { translatedText: 'Il était une fois.' },
        responseStatus: 200,
      });
    }
    return null;
  });

  const resultat = await traduireAvecSecours(TEXTE, {
    source: 'en',
    cible: 'fr',
  });

  assert.equal(resultat.fournisseur, 'mymemory');
  assert.equal(resultat.essais, 1);
});

test('timeout par tentative : bascule sur le moteur suivant', async () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'libretranslate,google';
  process.env.TRANSLATOR_FALLBACK_TIMEOUT_MS = '40';
  process.env.GEMINI_API_KEY = 'cle-test';
  capturerJournal();

  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) {
      // Ne répond jamais : seul l'abandon (timeout) doit le débloquer.
      return (init) =>
        new Promise<Response>((_resoudre, rejeter) => {
          const signal = init?.signal ?? undefined;
          const echouer = () =>
            rejeter(
              signal?.reason ??
                new DOMException('Délai dépassé.', 'TimeoutError')
            );
          if (!signal) return;
          if (signal.aborted) return echouer();
          signal.addEventListener('abort', echouer, { once: true });
        });
    }
    if (url.includes('translate.googleapis.com')) {
      return okJson([[['Traduit', 'Once', null, null, 10]]]);
    }
    return null;
  });

  const resultat = await traduireAvecSecours(TEXTE, {
    source: 'en',
    cible: 'fr',
  });

  assert.equal(resultat.fournisseur, 'google');
  assert.equal(resultat.essais, 2);
  assert.match(journal.join('\n'), /cause=timeout/);
});

test('tous les moteurs échouent : ErreurChaineSecours, sans fuite de texte', async () => {
  process.env.GEMINI_API_KEY = 'cle-test';
  delete process.env.TRANSLATOR_FALLBACK_ORDER;
  capturerJournal();

  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) return errHttp(500);
    if (url.includes('generativelanguage.googleapis.com')) return errHttp(429);
    if (url.includes('translate.googleapis.com')) return errHttp(403);
    if (url.includes('api.mymemory.translated.net')) return errHttp(500);
    return null;
  });

  await assert.rejects(
    () => traduireAvecSecours(TEXTE, { source: 'en', cible: 'fr' }),
    (erreur: unknown) => {
      assert.ok(erreur instanceof ErreurChaineSecours);
      assert.equal(erreur.echecs.length, 4);
      assert.ok(!erreur.message.includes(SECRET));
      return true;
    }
  );

  const texteJournal = journal.join('\n');
  assert.match(texteJournal, /moteur=mymemory/);
  assert.ok(!texteJournal.includes(SECRET), 'aucun fragment de texte journalisé');
  assert.ok(!texteJournal.includes('Once upon'), 'aucun fragment de texte journalisé');
});

// ============================================================
// MODE PRIVÉ STRICT (A6/A8)
// ============================================================

test('mode privé strict : ordre forcé, aucun moteur tiers sollicité', async () => {
  process.env.TRANSLATOR_PRIVE_STRICT = '1';
  process.env.TRANSLATOR_FALLBACK_ORDER = 'gemini,google,mymemory,libretranslate';
  process.env.GEMINI_API_KEY = 'cle-test';
  capturerJournal();

  assert.equal(modePriveStrict(), true);
  assert.deepEqual(ordreSecours(), [...IDS_PRIVES]);

  const urls: string[] = [];
  definirFetch((url) => {
    urls.push(url);
    if (url.includes('127.0.0.1:5000')) {
      return okJson({ translatedText: 'Bonjour.' });
    }
    return null; // toute autre URL ferait échouer le test
  });

  // Ordre ÉLARGI fourni explicitement : le verrou doit le réduire.
  const resultat = await traduireAvecSecours(TEXTE, { source: 'en', cible: 'fr' }, [
    'libretranslate',
    'gemini',
    'google',
    'mymemory',
  ]);

  assert.equal(resultat.fournisseur, 'libretranslate');
  assert.equal(resultat.prive, true);
  assert.equal(resultat.priveStrict, true);
  assert.ok(
    urls.every((u) => u.includes('127.0.0.1:5000')),
    `aucun tiers ne doit être appelé, or URLs = ${urls.join(', ')}`
  );
});

test('mode privé strict : moteur privé coupé ⇒ échec, jamais de repli tiers', async () => {
  process.env.TRANSLATOR_PRIVE_STRICT = '1';
  process.env.GEMINI_API_KEY = 'cle-test';
  capturerJournal();

  const urls: string[] = [];
  definirFetch((url) => {
    urls.push(url);
    if (url.includes('127.0.0.1:5000')) return panneReseau();
    // Un tiers répondrait : le test échouerait si on l'appelait.
    return okJson([[['Traduction tierce', 'Once', null, null, 10]]]);
  });

  await assert.rejects(
    () =>
      traduireAvecSecours(TEXTE, { source: 'en', cible: 'fr' }, [
        'libretranslate',
        'google',
        'mymemory',
      ]),
    (e: unknown) => e instanceof ErreurChaineSecours
  );

  assert.ok(
    urls.every((u) => u.includes('127.0.0.1:5000')),
    `mode privé strict violé, URLs = ${urls.join(', ')}`
  );
});

test('description honnête du moteur (où va le texte)', () => {
  assert.equal(fournisseurEstPrive('libretranslate'), true);
  assert.equal(fournisseurEstPrive('gemini'), false);
  assert.equal(fournisseurEstPrive('google'), false);
  assert.match(descriptionMoteur('libretranslate'), /priv/i);
  assert.match(descriptionMoteur('google'), /Google/);
  assert.match(descriptionMoteur('mymemory'), /MyMemory/);
});

// ============================================================
// TENTATIVES BORNÉES (sans boucle infinie) + GLOSSAIRE
// ============================================================

test('nombre de tentatives par moteur borné et respecté', async () => {
  process.env.TRANSLATOR_FALLBACK_ESSAIS = '3';
  process.env.TRANSLATOR_FALLBACK_ORDER = 'libretranslate,mymemory';
  capturerJournal();

  let essaisLibre = 0;
  definirFetch((url) => {
    if (url.includes('127.0.0.1:5000')) {
      essaisLibre += 1;
      return errHttp(500);
    }
    if (url.includes('api.mymemory.translated.net')) {
      return okJson({
        responseData: { translatedText: 'Bonjour.' },
        responseStatus: 200,
      });
    }
    return null;
  });

  const r = await traduireAvecSecours(TEXTE, { source: 'en', cible: 'fr' });
  assert.equal(r.fournisseur, 'mymemory');
  assert.equal(essaisLibre, 3, 'exactement 3 tentatives (pas de boucle)');
  assert.equal(r.tentatives, 4, '3 échecs + 1 succès');
});

test('le nombre de tentatives est plafonné (anti-boucle)', () => {
  process.env.TRANSLATOR_FALLBACK_ESSAIS = '99';
  assert.equal(essaisSecours(), 3);
  process.env.TRANSLATOR_FALLBACK_ESSAIS = '0';
  assert.equal(essaisSecours(), 1);
});

test('le glossaire imposé est appliqué par la chaîne', async () => {
  process.env.TRANSLATOR_FALLBACK_ORDER = 'mymemory';
  capturerJournal();

  definirFetch((url) =>
    url.includes('api.mymemory.translated.net')
      ? okJson({
          responseData: { translatedText: 'Marcus marcha vers la porte.' },
          responseStatus: 200,
        })
      : null
  );

  const r = await traduireAvecSecours('Marcus walked to the door.', {
    source: 'en',
    cible: 'fr',
    glossaire: [{ source: 'Marcus', traduction: 'Marc' }],
  });

  assert.equal(r.traduit, 'Marc marcha vers la porte.');
});
