// ============================================================
// lib/admin-webhooks.test.ts — Preuves de la mise en forme du journal
// des livraisons de webhook et du comptage des retentes.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import { bilanWebhooks, normaliserWebhooks } from './admin-webhooks';
import type { LivraisonWebhook } from './admin-webhooks';

function livraison(partiel: Partial<LivraisonWebhook> & { id: number }): LivraisonWebhook {
  return {
    fournisseur: 'fedapay',
    evenement: 'transaction.approved',
    reference: 'PLU-1',
    statutHttp: 200,
    traite: true,
    dejaTraite: false,
    erreur: null,
    creeLe: '2026-11-14T10:00:00Z',
    ...partiel,
  };
}

test('les lignes brutes sont assainies, les lignes cassées rejetées', () => {
  const lignes = normaliserWebhooks([
    { id: 1, fournisseur: 'fedapay', statut_http: '200', traite: true },
    { id: 'abc' },
    null,
    { id: 4, reference: '  ', erreur: '', deja_traite: true },
  ]);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0]!.statutHttp, 200);
  assert.equal(lignes[0]!.reference, null); // blanc → null
  assert.equal(lignes[1]!.fournisseur, 'inconnu');
  assert.equal(lignes[1]!.dejaTraite, true);
  assert.equal(normaliserWebhooks('rien').length, 0);
});

test('les échecs sont comptés : non traités ou statut HTTP en erreur', () => {
  const { echecs } = bilanWebhooks([
    livraison({ id: 1 }), // OK
    livraison({ id: 2, traite: false, statutHttp: 500, erreur: 'base indisponible' }),
    livraison({ id: 3, traite: false, statutHttp: 401, erreur: 'signature invalide' }),
    livraison({ id: 4, statutHttp: 200 }), // OK
    livraison({ id: 5, statutHttp: 429 }), // statut en erreur même si « traité »
  ]);
  assert.equal(echecs, 3);
});

test('les retentes comptent chaque livraison au-delà de la première', () => {
  const { retentes } = bilanWebhooks([
    livraison({ id: 1, reference: 'PLU-1' }), // première livraison
    livraison({ id: 2, reference: 'PLU-1' }), // retente n° 1
    livraison({ id: 3, reference: 'PLU-1', dejaTraite: true }), // retente n° 2
    livraison({ id: 4, reference: 'PLU-2' }), // autre référence
    livraison({ id: 5, reference: null }), // sans référence : non comptée
  ]);
  assert.equal(retentes, 2);
});

test('aucune référence dupliquée : aucune retente', () => {
  const { retentes, echecs } = bilanWebhooks([
    livraison({ id: 1, reference: 'PLU-1' }),
    livraison({ id: 2, reference: 'PLU-2' }),
  ]);
  assert.equal(retentes, 0);
  assert.equal(echecs, 0);
});
