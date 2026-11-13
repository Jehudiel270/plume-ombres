// ============================================================
// lib/cles-api-sonde.test.ts — Preuves de la sonde de clé d'API.
// AUCUN appel réseau : le « fetch » est injecté par les preuves.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import { sonderCle } from './cles-api-sonde';

function reponse(ok: boolean, statut: number, corps: string): Response {
  return {
    ok,
    status: statut,
    text: async () => corps,
  } as unknown as Response;
}

test('une clé Gemini acceptée est déclarée valide, sans rien révéler', async () => {
  let urlAppelle = '';
  let entetesRecus: Record<string, string> = {};
  const resultat = await sonderCle('gemini', 'AIzaSECRET', async (url, init) => {
    urlAppelle = url;
    entetesRecus = init.headers;
    return reponse(true, 200, JSON.stringify({ models: [{}, {}, {}] }));
  });
  assert.equal(resultat.ok, true);
  assert.equal(resultat.attribuable, false);
  assert.match(resultat.message, /3 modèles/);
  assert.ok(!resultat.message.includes('AIzaSECRET'), 'aucune valeur de clé dans le message');
  assert.equal(urlAppelle, 'https://generativelanguage.googleapis.com/v1beta/models');
  // La clé part dans l'entête (pas dans l'URL, qui finit dans les journaux).
  assert.equal(entetesRecus['x-goog-api-key'], 'AIzaSECRET');
  assert.ok(!urlAppelle.includes('AIzaSECRET'));
});

test('une clé porteur (DeepSeek) est envoyée dans Authorization', async () => {
  const resultat = await sonderCle('deepseek', 'sk-SECRET', async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/models');
    assert.equal(init.headers.Authorization, 'Bearer sk-SECRET');
    return reponse(true, 200, JSON.stringify({ data: [{}, {}] }));
  });
  assert.equal(resultat.ok, true);
  assert.match(resultat.message, /2 modèles/);
});

test('un 429 (quota) est imputable à la clé et lisible', async () => {
  const resultat = await sonderCle('gemini', 'AIzaSECRET', async () =>
    reponse(false, 429, '{"error":"Resource has been exhausted (quota)."}')
  );
  assert.equal(resultat.ok, false);
  assert.equal(resultat.attribuable, true);
  assert.match(resultat.message, /HTTP 429/);
});

test('un 401 (clé invalide) est imputable à la clé', async () => {
  const resultat = await sonderCle('openai', 'sk-SECRET', async () =>
    reponse(false, 401, 'Invalid API key')
  );
  assert.equal(resultat.ok, false);
  assert.equal(resultat.attribuable, true);
  assert.match(resultat.message, /HTTP 401/);
});

test('une panne réseau n’est PAS imputable à la clé', async () => {
  const resultat = await sonderCle('mistral', 'cle-SECRET', async () => {
    const erreur = new Error('connect ECONNREFUSED');
    erreur.name = 'TypeError';
    throw erreur;
  });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.attribuable, false);
  assert.match(resultat.message, /Requête impossible/);
});

test('un dépassement de délai est signalé comme non imputable', async () => {
  const resultat = await sonderCle('openrouter', 'sk-or-SECRET', async () => {
    const erreur = new Error('The operation was aborted');
    erreur.name = 'AbortError';
    throw erreur;
  });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.attribuable, false);
  assert.match(resultat.message, /Aucune réponse du fournisseur/);
});

test('un fournisseur sans point de contrôle est dit clairement', async () => {
  const resultat = await sonderCle('autre', 'cle-SECRET');
  assert.equal(resultat.ok, false);
  assert.equal(resultat.attribuable, false);
  assert.match(resultat.message, /Aucun point de contrôle/);
});

test('une réponse 2xx non JSON reste un succès', async () => {
  const resultat = await sonderCle('openai', 'sk-SECRET', async () =>
    reponse(true, 200, 'OK textuel')
  );
  assert.equal(resultat.ok, true);
});
