import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fusionnerAgenda,
  libelleDelai,
  MAX_ENTREES_AGENDA,
  type BruteEcheance,
  type BruteRencontre,
} from './suivis';

const MAINTENANT = new Date('2026-11-15T12:00:00Z');

const rencontre = (surcharge: Partial<BruteRencontre> = {}): BruteRencontre => ({
  cle: 'r1',
  prevuLe: '2026-11-21T18:00:00Z',
  titre: 'Rencontre — Étape 3',
  clubTitre: 'Les Veilleuses',
  mode: 'salon écrit',
  noteChapitres: 'Chapitres 9 à 12',
  lien: '/clubs/abc',
  ...surcharge,
});

const echeance = (surcharge: Partial<BruteEcheance> = {}): BruteEcheance => ({
  cle: 'd1',
  echeance: '2026-11-18T00:00:00Z',
  titre: 'Douze chapitres avant Noël',
  detail: 'Objectif chapitres, cible 12',
  lien: '/defis',
  ...surcharge,
});

test('agenda : rencontres et échéances fusionnées, triées du plus proche', () => {
  const agenda = fusionnerAgenda([rencontre()], [echeance()], MAINTENANT);
  assert.equal(agenda.length, 2);
  assert.equal(agenda[0].cle, 'd1'); // le 18 avant le 21
  assert.equal(agenda[0].genre, 'echeance');
  assert.equal(agenda[1].cle, 'r1');
  assert.equal(agenda[1].genre, 'rencontre');
  assert.ok(agenda[1].detail.includes('Les Veilleuses'));
  assert.ok(agenda[1].detail.includes('salon écrit'));
});

test('agenda : les événements passés sont écartés (tolérance d’une minute)', () => {
  const agenda = fusionnerAgenda(
    [rencontre({ prevuLe: '2026-11-14T18:00:00Z' })],
    [echeance({ echeance: '2026-11-15T11:59:00Z' })], // 1 min : tolérée
    MAINTENANT
  );
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].cle, 'd1');
});

test('agenda : doublons de clé écartés, lignes illisibles ignorées', () => {
  const agenda = fusionnerAgenda(
    [rencontre(), rencontre({ cle: 'r1' }), rencontre({ cle: 'r2', prevuLe: 'pas une date' })],
    [],
    MAINTENANT
  );
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].cle, 'r1');
});

test('agenda : sortie bornée au plafond', () => {
  const many: BruteEcheance[] = Array.from({ length: 50 }, (_, i) =>
    echeance({
      cle: `d${i}`,
      echeance: new Date(Date.parse('2026-12-01T00:00:00Z') + i * 86_400_000).toISOString(),
    })
  );
  const agenda = fusionnerAgenda([], many, MAINTENANT);
  assert.equal(agenda.length, MAX_ENTREES_AGENDA);
});

test('délai : aujourd’hui, demain, puis en jours', () => {
  assert.equal(libelleDelai('2026-11-15T20:00:00Z', MAINTENANT), "aujourd'hui");
  assert.equal(libelleDelai('2026-11-16T09:00:00Z', MAINTENANT), 'demain');
  assert.equal(libelleDelai('2026-11-21T09:00:00Z', MAINTENANT), 'dans 6 jours');
  assert.equal(libelleDelai('pas une date', MAINTENANT), '');
});
