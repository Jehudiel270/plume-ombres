// ============================================================
// politique-webhook.test.ts — Preuves de la politique de réponse.
// Exécution : npx tsx --test lib/paiement/politique-webhook.test.ts
// Aucun réseau, aucune base.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { estPing, statutHttpErreurWebhook } from './politique-webhook';

test('un ping FedaPay est reconnu (name, event)', () => {
  assert.equal(estPing({ name: 'ping' }), true);
  assert.equal(estPing({ name: 'PING' }), true);
  assert.equal(estPing({ event: 'ping' }), true);
});

test('une vraie transaction n’est pas prise pour un ping', () => {
  assert.equal(
    estPing({ name: 'transaction.approved', entity: { id: 1 } }),
    false
  );
  assert.equal(estPing({}), false);
  assert.equal(estPing(null), false);
  assert.equal(estPing('ping'), false);
});

test('les échecs DÉFINITIFS renvoient 400 (pas de réessai)', () => {
  assert.equal(
    statutHttpErreurWebhook(
      'Paiement inconnu (référence interne : PLU-X, référence fournisseur : 12).'
    ),
    400
  );
  assert.equal(
    statutHttpErreurWebhook('Montant incohérent pour PLU-X : 500 ≠ 2500.'),
    400
  );
  assert.equal(
    statutHttpErreurWebhook('Webhook sans référence fournisseur : impossible de revérifier.'),
    400
  );
});

test('les échecs TRANSITOIRES renvoient 500 (FedaPay doit réessayer)', () => {
  assert.equal(
    statutHttpErreurWebhook('[fedapay] fetch failed'),
    500
  );
  assert.equal(
    statutHttpErreurWebhook('connection timeout'),
    500
  );
  assert.equal(
    statutHttpErreurWebhook('Traitement impossible.'),
    500
  );
});
