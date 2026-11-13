// ============================================================
// lib/bilingue.test.ts — Appariement de la vue bilingue (F7).
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  apparierDepuisSegments,
  apparierParagraphes,
} from './bilingue';

test('segments : une ligne = une paire, non traduit = colonne vide', () => {
  const paires = apparierDepuisSegments([
    { source: '  Bonjour le monde. ', traduit: ' Hello world. ' },
    { source: 'Non traduit.', traduit: null },
    { source: null, traduit: 'Orphelin.' },
    { source: null, traduit: null },
    { source: '', traduit: '' },
  ]);
  assert.equal(paires.length, 3); // la ligne vide est ignorée
  assert.deepEqual(paires[0], {
    source: 'Bonjour le monde.',
    traduit: 'Hello world.',
    debutTraduit: -1,
  });
  assert.deepEqual(paires[1], { source: 'Non traduit.', traduit: '', debutTraduit: -1 });
  assert.deepEqual(paires[2], { source: '', traduit: 'Orphelin.', debutTraduit: -1 });
});

test('paragraphes : appariement par index avec offsets exacts côté traduit', () => {
  const source = ['Première phrase source.', '', 'Deuxième paragraphe source.'].join('\n');
  const traduit = ['First source sentence.', '', 'Second source paragraph.'].join('\n');
  const paires = apparierParagraphes(source, traduit);
  assert.equal(paires.length, 2);
  assert.equal(paires[0].source, 'Première phrase source.');
  assert.equal(paires[0].traduit, 'First source sentence.');
  assert.equal(paires[0].debutTraduit, 0);
  assert.equal(paires[1].traduit, 'Second source paragraph.');
  assert.ok(paires[1].debutTraduit > 0);
});

test('paragraphes : les séparateurs de scène sont exclus des deux côtés', () => {
  const source = ['Para un.', '', '* * *', '', 'Para deux.'].join('\n');
  const traduit = ['Para one.', '', '* * *', '', 'Para two.'].join('\n');
  const paires = apparierParagraphes(source, traduit);
  assert.equal(paires.length, 2);
  assert.equal(paires[0].source, 'Para un.');
  assert.equal(paires[1].source, 'Para deux.');
});

test('paragraphes : ce qui dépasse reste affiché, seul dans sa colonne', () => {
  const paires = apparierParagraphes(
    ['Un.', '', 'Deux.', '', 'Trois.'].join('\n'),
    ['One.', '', 'Two.'].join('\n')
  );
  assert.equal(paires.length, 3);
  assert.equal(paires[2].source, 'Trois.');
  assert.equal(paires[2].traduit, '');
  assert.equal(paires[2].debutTraduit, -1);
});

test('paragraphes : blancs et texte vide ne cassent rien', () => {
  assert.deepEqual(apparierParagraphes('', ''), []);
  assert.deepEqual(apparierParagraphes('   \n\n  ', ''), []);
  const seul = apparierParagraphes('Seul.', '');
  assert.equal(seul.length, 1);
  assert.equal(seul[0].source, 'Seul.');
  assert.equal(seul[0].traduit, '');
});
