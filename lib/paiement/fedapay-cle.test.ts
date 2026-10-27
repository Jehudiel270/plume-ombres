// ============================================================
// fedapay-cle.test.ts — Preuves du garde-fou clé / environnement.
// Exécution : npx tsx --test lib/paiement/fedapay-cle.test.ts
// Aucun réseau.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleCoherente, cleFedapay, fedapayEnv } from './fedapay';

function avecEnv(vars: Record<string, string | undefined>, corps: () => void) {
  const sauve = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    corps();
  } finally {
    process.env = sauve;
  }
}

test('une clé live est refusée en mode sandbox (et inversement)', () => {
  assert.equal(cleCoherente('live', 'sk_live_abc'), true);
  assert.equal(cleCoherente('live', 'sk_sandbox_abc'), false);
  assert.equal(cleCoherente('sandbox', 'sk_sandbox_abc'), true);
  assert.equal(cleCoherente('sandbox', 'sk_live_abc'), false);
  assert.equal(cleCoherente('live', null), false);
  // Format non reconnu : on ne bloque pas une clé qu'on ne sait pas classer.
  assert.equal(cleCoherente('live', 'autre_chose'), true);
});

test('la clé de l’environnement courant est prioritaire', () => {
  avecEnv(
    {
      FEDAPAY_ENV: 'live',
      FEDAPAY_LIVE_SECRET_KEY: 'sk_live_prioritaire',
      FEDAPAY_SANDBOX_SECRET_KEY: 'sk_sandbox_ignoree',
      FEDAPAY_SECRET_KEY: 'sk_live_generique',
    },
    () => {
      assert.equal(fedapayEnv(), 'live');
      assert.equal(cleFedapay(), 'sk_live_prioritaire');
    }
  );
});

test('repli sur FEDAPAY_SECRET_KEY (configuration mono-environnement)', () => {
  avecEnv(
    {
      FEDAPAY_ENV: 'live',
      FEDAPAY_LIVE_SECRET_KEY: '',
      FEDAPAY_SANDBOX_SECRET_KEY: 'sk_sandbox_x',
      FEDAPAY_SECRET_KEY: 'sk_live_generique',
    },
    () => {
      assert.equal(cleFedapay(), 'sk_live_generique');
    }
  );
});

test('en sandbox, la clé sandbox est retenue', () => {
  avecEnv(
    {
      FEDAPAY_ENV: 'sandbox',
      FEDAPAY_LIVE_SECRET_KEY: 'sk_live_x',
      FEDAPAY_SANDBOX_SECRET_KEY: 'sk_sandbox_y',
      FEDAPAY_SECRET_KEY: 'sk_live_generique',
    },
    () => {
      assert.equal(fedapayEnv(), 'sandbox');
      assert.equal(cleFedapay(), 'sk_sandbox_y');
    }
  );
});
