// ============================================================
// lib/salon.test.ts — Preuves du salon vivant (F11 v3) :
// agrégation des réactions, transformation des messages (filtrage
// anti-spoilers, messages privés), tri du fil.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import { agregerReactions, triFil, versMessageSalon } from './salon';
import type { LigneMessageBrute, LigneReactionBrute } from './salon';

const MON_ID = '11111111-1111-1111-1111-111111111111';
const AUTRE_ID = '22222222-2222-2222-2222-222222222222';
const TROISIEME_ID = '33333333-3333-3333-3333-333333333333';

const membre = (overrides: Partial<LigneMessageBrute> = {}): LigneMessageBrute => ({
  id: 1,
  auteur_id: AUTRE_ID,
  contenu: 'Quel chapitre !',
  chapitre_max: 0,
  created_at: '2026-11-15T10:00:00Z',
  modifie_le: null,
  epingle: false,
  reponse_a: null,
  signale: false,
  prive: false,
  destinataire_id: null,
  profiles: { pseudo: 'Ombre' },
  ...overrides,
});

const options = (overrides: Record<string, unknown> = {}) => ({
  monId: MON_ID,
  maPosition: 5,
  estCreateur: false,
  pseudosMembres: new Map([
    [AUTRE_ID, 'Ombre'],
    [MON_ID, 'Moi'],
    [TROISIEME_ID, 'Tierce'],
  ]),
  ...overrides,
});

test('réactions : agrégation par émoji avec comptage et « moi »', () => {
  const lignes: LigneReactionBrute[] = [
    { message_id: 1, utilisateur_id: AUTRE_ID, emoji: '❤️' },
    { message_id: 1, utilisateur_id: MON_ID, emoji: '❤️' },
    { message_id: 1, utilisateur_id: TROISIEME_ID, emoji: '❤️' },
    { message_id: 1, utilisateur_id: TROISIEME_ID, emoji: '🔥' },
    { message_id: 2, utilisateur_id: AUTRE_ID, emoji: '😱' },
  ];
  const agrege = agregerReactions(lignes, MON_ID);
  assert.equal(agrege.size, 2);
  assert.deepEqual(agrege.get(1), [
    { emoji: '❤️', total: 3, moi: true },
    { emoji: '🔥', total: 1, moi: false },
  ]);
  assert.deepEqual(agrege.get(2), [{ emoji: '😱', total: 1, moi: false }]);
});

test('réactions : fil vide → aucune entrée', () => {
  assert.equal(agregerReactions([], MON_ID).size, 0);
});

test('message public : transformation complète', () => {
  const toutJuste = new Date(Date.now() - 60_000).toISOString();
  const m = versMessageSalon(membre({ created_at: toutJuste }), options());
  assert.ok(m);
  assert.equal(m.auteur, 'Ombre');
  assert.equal(m.mien, false);
  assert.equal(m.prive, false);
  assert.equal(m.destinataire, null);
  assert.deepEqual(m.reactions, []);
  assert.equal(m.editionPossible, true); // fenêtre de 15 minutes ouverte
  assert.equal(m.signale, false);
});

test('message au-delà de ma lecture : contenu jamais envoyé', () => {
  const m = versMessageSalon(membre({ chapitre_max: 9 }), options());
  assert.equal(m, null);
  const visible = versMessageSalon(membre({ chapitre_max: 5 }), options());
  assert.ok(visible);
});

test('message privé : visible seulement si je suis concerné (RLS en amont)', () => {
  const mp = versMessageSalon(
    membre({ prive: true, destinataire_id: MON_ID }),
    options()
  );
  assert.ok(mp);
  assert.equal(mp.prive, true);
  assert.equal(mp.destinataire, 'Moi');

  const mpParti = versMessageSalon(
    membre({ prive: true, destinataire_id: '44444444-4444-4444-4444-444444444444' }),
    options()
  );
  assert.ok(mpParti);
  assert.equal(mpParti.destinataire, null);
});

test('signalement : visible du créateur seulement', () => {
  const pourMembre = versMessageSalon(membre({ signale: true }), options());
  assert.equal(pourMembre?.signale, false);
  const pourCreateur = versMessageSalon(
    membre({ signale: true }),
    options({ estCreateur: true })
  );
  assert.equal(pourCreateur?.signale, true);
});

test('tri du fil : épinglés d’abord, puis récent d’abord', () => {
  const ancien = versMessageSalon(
    membre({ id: 1, created_at: '2026-11-15T08:00:00Z' }),
    options()
  )!;
  const recent = versMessageSalon(
    membre({ id: 2, created_at: '2026-11-15T12:00:00Z' }),
    options()
  )!;
  const epingle = versMessageSalon(
    membre({ id: 3, created_at: '2026-11-15T06:00:00Z', epingle: true }),
    options()
  )!;
  const fil = [ancien, recent, epingle].sort(triFil);
  assert.deepEqual(
    fil.map((m) => m.id),
    [3, 2, 1]
  );
});
