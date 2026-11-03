import test from 'node:test';
import assert from 'node:assert/strict';

import { echapperCsv, versCsv } from './admin-stats';

const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

test('CSV : une cellule ordinaire reste intacte', () => {
  assert.equal(echapperCsv('jehudieldossou@gmail.com'), 'jehudieldossou@gmail.com');
  assert.equal(echapperCsv(42), '42');
  assert.equal(echapperCsv(null), '');
});

test('CSV : séparateur, guillemet et saut de ligne sont encadrés', () => {
  assert.equal(echapperCsv('a;b'), '"a;b"');
  assert.equal(echapperCsv('a,b'), '"a,b"');
  assert.equal(echapperCsv(`a${LF}b`), `"a${LF}b"`);
  assert.equal(echapperCsv('il a dit "non"'), '"il a dit ""non"""');
});

test('CSV : une cellule qui ressemble à une formule est neutralisée', () => {
  assert.equal(echapperCsv('=1+1'), "'=1+1");
  assert.equal(echapperCsv('+33 6 00 00 00 00'), "'+33 6 00 00 00 00");
  assert.equal(echapperCsv('-42'), "'-42");
  assert.equal(echapperCsv('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(echapperCsv(`${TAB}cmd`), `'${TAB}cmd`);
  assert.equal(echapperCsv(`${CR}cmd`), `"${`'${CR}cmd`}"`);
});

test('CSV : la neutralisation survit à l’encadrement', () => {
  const cellule = echapperCsv('=HYPERLINK("http://x";"clic")');
  assert.ok(cellule.startsWith('"\'='), cellule);
  assert.ok(!cellule.startsWith('='), cellule);
});

test('CSV : une formule au milieu du texte reste du texte', () => {
  assert.equal(echapperCsv('a=b'), 'a=b');
  assert.equal(echapperCsv('x + y'), 'x + y');
});

test('CSV : en-tête et lignes partagent le même séparateur', () => {
  const sortie = versCsv(
    [
      { cle: 'courriel', libelle: 'Courriel' },
      { cle: 'plan', libelle: 'Plan' },
    ],
    [
      { courriel: 'a@b.c', plan: 'Lecteur mensuel' },
      { courriel: '=cmd', plan: 'x;y' },
    ]
  );
  assert.deepEqual(sortie.split(CR + LF), [
    'Courriel;Plan',
    'a@b.c;Lecteur mensuel',
    "'=cmd;\"x;y\"",
  ]);
});
