// ============================================================
// lib/admin-revenus.test.ts — Preuves de la mise en forme des
// indicateurs de revenus (réponse de public.admin_stats_revenus).
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliserStatsRevenus } from './admin-revenus';

test('la réponse nominale donne MRR, ARPU, plans et mois ordonnés', () => {
  const stats = normaliserStatsRevenus({
    mrr_xof: 5000.4,
    actifs_total: 2,
    actifs_par_plan: [
      { plan: 'premium_mensuel', nom: 'Premium — mensuel', prix_xof: 3000, duree_jours: 30, actifs: 2 },
    ],
    par_mois: [
      { periode: '2026-10', nouveaux: 2, sorties: 1, encaisse: 6000, paiements: 2 },
      { periode: '2026-11', nouveaux: 1, sorties: 0, encaisse: 3000, paiements: 1 },
      { periode: '2026-09', nouveaux: 0, sorties: 0, encaisse: 0, paiements: 0 },
    ],
    encaisse_total_xof: 9000,
  });

  assert.ok(stats);
  // 5000.4 est arrondi à l'entier (l'argent s'affiche sans décimale).
  assert.equal(stats.mrrXof, 5000);
  assert.equal(stats.actifsTotal, 2);
  assert.equal(stats.arpuXof, 2500);
  assert.equal(stats.encaisseTotalXof, 9000);
  assert.deepEqual(
    stats.parMois.map((m) => m.periode),
    ['2026-09', '2026-10', '2026-11']
  );
  assert.equal(stats.parMois[1]!.nouveaux, 2);
  assert.equal(stats.parMois[1]!.sorties, 1);
});

test('aucun abonné actif : l’ARPU est null, pas une division impossible', () => {
  const stats = normaliserStatsRevenus({
    mrr_xof: 0,
    actifs_total: 0,
    actifs_par_plan: [],
    par_mois: [],
    encaisse_total_xof: 12345,
  });
  assert.ok(stats);
  assert.equal(stats.arpuXof, null);
  assert.equal(stats.encaisseTotalXof, 12345);
});

test('les lignes mal formées sont écartées sans faire tomber l’écran', () => {
  const stats = normaliserStatsRevenus({
    mrr_xof: 'abc',
    actifs_total: null,
    actifs_par_plan: [null, { nom: 'sans code' }, { plan: 'premium_annuel', actifs: '3' }],
    par_mois: [{ periode: 42 }, { periode: '2026-11', nouveaux: '1', sorties: [], encaisse: '500' }],
    encaisse_total_xof: -5,
  });
  assert.ok(stats);
  assert.equal(stats.mrrXof, 0);
  assert.equal(stats.actifsTotal, 0);
  // La ligne sans `plan` est rejetée ; celle avec plan acceptée.
  assert.equal(stats.actifsParPlan.length, 1);
  assert.equal(stats.actifsParPlan[0]!.plan, 'premium_annuel');
  assert.equal(stats.actifsParPlan[0]!.actifs, 3);
  // La ligne de mois sans période textuelle est rejetée.
  assert.equal(stats.parMois.length, 1);
  assert.equal(stats.parMois[0]!.encaisse, 500);
});

test('une réponse illisible renvoie null (écran « indisponible »)', () => {
  assert.equal(normaliserStatsRevenus(null), null);
  assert.equal(normaliserStatsRevenus({}), null);
  assert.equal(normaliserStatsRevenus('erreur'), null);
});
