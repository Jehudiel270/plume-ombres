// ============================================================
// lib/assistance.test.ts — Preuves des gardes de l'aide à la
// reprise (F6/F10) : plafonds de question, statuts de bascule de
// modèle, garde « rien lu ».
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_QUESTION } from './assistance';

test('la question est bornée avant tout envoi au modèle', () => {
  assert.ok(MAX_QUESTION >= 100 && MAX_QUESTION <= 1000);
});

// Les fonctions DB/modèle dépendent du réseau : on teste ici les
// invariants purs qui protègent le lecteur.

test('une position non lue ne produit aucun résumé (garde amont)', async () => {
  // On simule la garde en vérifiant que resumerReprise refuse avant
  // tout appel réseau : client factice qui lèverait sinon.
  const clientLevierait = {
    from: () => {
      throw new Error('ne doit pas être appelé');
    },
  } as unknown as Parameters<typeof import('./assistance').resumerReprise>[0];
  const { resumerReprise } = await import('./assistance');
  assert.equal(await resumerReprise(clientLevierait, 'l1', null), null);
  assert.equal(await resumerReprise(clientLevierait, 'l1', 0), null);
});

test('une question trop courte est refusée avant le modèle', async () => {
  const clientLevierait = {
    from: () => {
      throw new Error('ne doit pas être appelé');
    },
  } as unknown as Parameters<typeof import('./assistance').questionnerIntrigue>[0];
  const { questionnerIntrigue } = await import('./assistance');
  await assert.rejects(
    questionnerIntrigue(clientLevierait, 'l1', 3, '  ?  '),
    /Posez votre question/
  );
});
