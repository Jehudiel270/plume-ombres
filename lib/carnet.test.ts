// ============================================================
// lib/carnet.test.ts — Preuves du carnet (F2) : plafonds, libellés,
// export MD sans texte intégral.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_EXTRAIT,
  type EntreeCarnet,
  ajouterNote,
  exporterMarkdown,
  libelleType,
  normaliserAnnotation,
  normaliserExtrait,
} from './carnet';

test('un extrait est nettoyé et plafonné avec ellipse', () => {
  assert.equal(normaliserExtrait('  Un   passage\n\nserré.  '), 'Un passage serré.');
  const long = 'a'.repeat(MAX_EXTRAIT + 500);
  const sorti = normaliserExtrait(long) ?? '';
  assert.equal(sorti.length, MAX_EXTRAIT);
  assert.ok(sorti.endsWith('…'));
  assert.equal(normaliserExtrait('   '), null);
});

test('une annotation est plafonnée, une annotation vide devient null', () => {
  assert.equal(normaliserAnnotation('  Ma théorie.  '), 'Ma théorie.');
  const long = 'b'.repeat(5000);
  assert.equal((normaliserAnnotation(long) ?? '').length, 4000);
  assert.equal(normaliserAnnotation(''), null);
});

test('les libellés sont en français, sans jargon', () => {
  assert.equal(libelleType('note'), 'Note');
  assert.equal(libelleType('citation'), 'Citation');
  assert.equal(libelleType('surlignage'), 'Surlignage');
});

const ENTREES: EntreeCarnet[] = [
  {
    id: '1',
    livre_id: 'l1',
    chapitre_id: null,
    type: 'citation',
    extrait: 'La brume gardait le val.',
    annotation: 'À relire au dernier tome.',
    chapitre_titre: 'Chapitre 3 — Le val',
    couleur: 'or',
    created_at: '2026-11-12T10:00:00.000Z',
  },
  {
    id: '2',
    livre_id: 'l1',
    chapitre_id: null,
    type: 'note',
    extrait: null,
    annotation: 'Hypothèse : le gardien est son père.',
    chapitre_titre: null,
    couleur: null,
    created_at: '2026-11-12T09:00:00.000Z',
  },
];

test('l’export MD groupe par type et cite les extraits plafonnés', () => {
  const md = exporterMarkdown(ENTREES, { titreLivre: 'Couronne de brume', pseudo: 'Léa' });
  assert.ok(md.startsWith('# Carnet de lecture — Couronne de brume'));
  assert.ok(md.includes('## Citations (1)'));
  assert.ok(md.includes('## Notes (1)'));
  assert.ok(md.includes('> La brume gardait le val.'));
  assert.ok(md.includes('Hypothèse : le gardien est son père.'));
  assert.ok(md.includes('Chapitre 3 — Le val'));
  assert.ok(md.includes('sans le texte intégral'));
});

test('l’export d’un carnet vide reste lisible', () => {
  const md = exporterMarkdown([], {});
  assert.ok(md.includes('_Carnet vide._'));
});

test('ajouterNote refuse une entrée sans aucun contenu (via le garde du corps)', async () => {
  // Client factice : l'appel ne doit JAMAIS atteindre la base.
  let appele = false;
  const client = {
    from: () => {
      appele = true;
      throw new Error('ne doit pas être appelé');
    },
  } as unknown as Parameters<typeof ajouterNote>[0];
  await assert.rejects(
    ajouterNote(client, {
      livreId: 'l1',
      type: 'note',
      extrait: '',
      annotation: '   ',
    }),
    /Écrivez une note/
  );
  assert.equal(appele, false);
});
