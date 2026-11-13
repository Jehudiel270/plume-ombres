// ============================================================
// lib/parametres.test.ts — Preuves de la clé du modèle : masquage,
// validation, priorité variable d'environnement > base, lecture
// résiliente (table absente → null, jamais de crash).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLE_PARAMETRE_GEMINI,
  LONGUEUR_CLE_MIN,
  masquerCle,
  validerCleCollee,
} from './parametres';

type Ligne = { valeur?: unknown; maj_le?: unknown; maj_par?: unknown } | null;

/** Client factice : from('parametres_systeme') → réponse fixée. */
function clientFactice(reponse: { data: Ligne; error: { message: string } | null }) {
  const appels: string[] = [];
  const brut = {
    from(table: string) {
      appels.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => reponse,
          }),
        }),
      };
    },
  };
  return {
    appels,
    client: brut as unknown as Parameters<
      typeof import('./parametres').lireParametreServeur
    >[0],
  };
}

test('masquerCle n’expose jamais une clé entière', () => {
  const cle = 'AIzaSyD-1234567890abcdefghijklmnopqrstuv';
  const apercu = masquerCle(cle);
  assert.equal(apercu, 'AIza…stuv');
  assert.ok(!apercu?.includes(cle), 'la clé complète ne doit pas apparaître');
  assert.equal(masquerCle(''), null);
  assert.equal(masquerCle('court'), null);
  assert.equal(masquerCle(null), null);
  assert.equal(masquerCle(undefined), null);
});

test('validerCleCollee refuse les clés incomplètes ou espacées', () => {
  assert.ok(validerCleCollee('tropcourt'));
  assert.ok(validerCleCollee(`x`.repeat(LONGUEUR_CLE_MIN - 1)));
  assert.ok(validerCleCollee('AIzaSyD-1234 une clé avec espaces'));
  assert.ok(validerCleCollee(null));
  assert.ok(validerCleCollee(42));
  assert.equal(validerCleCollee('AIzaSyD-1234567890abcdefghijklmnopqrstuv'), null);
});

test('lireParametreServeur lit la base et résiste à une table absente', async () => {
  const { lireParametreServeur } = await import('./parametres');

  const ok = clientFactice({ data: { valeur: ' AIzaSyD-abc ', maj_le: '2026-11-13T10:00:00Z' }, error: null });
  assert.equal(await lireParametreServeur(ok.client, CLE_PARAMETRE_GEMINI), 'AIzaSyD-abc');
  assert.deepEqual(ok.appels, ['parametres_systeme']);

  const vide = clientFactice({ data: null, error: null });
  assert.equal(await lireParametreServeur(vide.client, CLE_PARAMETRE_GEMINI), null);

  const erreur = clientFactice({ data: null, error: { message: 'relation does not exist' } });
  assert.equal(await lireParametreServeur(erreur.client, CLE_PARAMETRE_GEMINI), null);
});

test('resoudreCleGemini : la variable d’environnement prime sur la base', async () => {
  const { resoudreCleGemini } = await import('./parametres');
  const CLEF = 'GEMINI_API_KEY';
  const sauvegarde = process.env[CLEF];
  try {
    process.env[CLEF] = 'cle-environnement';
    const base = clientFactice({ data: { valeur: 'cle-en-base' }, error: null });
    assert.equal(await resoudreCleGemini(base.client), 'cle-environnement');
  } finally {
    if (sauvegarde === undefined) delete process.env[CLEF];
    else process.env[CLEF] = sauvegarde;
  }
});

test('resoudreCleGemini retombe sur la base puis sur une chaîne vide', async () => {
  const { resoudreCleGemini } = await import('./parametres');
  const CLEF = 'GEMINI_API_KEY';
  const sauvegarde = process.env[CLEF];
  try {
    delete process.env[CLEF];
    const base = clientFactice({ data: { valeur: 'cle-en-base' }, error: null });
    assert.equal(await resoudreCleGemini(base.client), 'cle-en-base');

    const vide = clientFactice({ data: null, error: null });
    assert.equal(await resoudreCleGemini(vide.client), '');
    assert.equal(await resoudreCleGemini(), '');
  } finally {
    if (sauvegarde === undefined) delete process.env[CLEF];
    else process.env[CLEF] = sauvegarde;
  }
});
