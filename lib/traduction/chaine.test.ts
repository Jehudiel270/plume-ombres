import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFONDEUR_MAX_CHAINE,
  fautIlEnchainer,
  profondeurSuivante,
} from './chaine';

// ------------------------------------------------------------
// profondeurSuivante
// ------------------------------------------------------------

test('profondeurSuivante : un premier déclenchement (aucun paramètre) vaut 1', () => {
  assert.equal(profondeurSuivante(null), 1);
  assert.equal(profondeurSuivante(undefined), 1);
  assert.equal(profondeurSuivante(''), 1);
});

test('profondeurSuivante : incrémente la valeur reçue', () => {
  assert.equal(profondeurSuivante('0'), 1);
  assert.equal(profondeurSuivante('41'), 42);
  assert.equal(profondeurSuivante('199'), 200);
});

test('profondeurSuivante : une valeur illisible ne casse pas la chaîne', () => {
  assert.equal(profondeurSuivante('abc'), 1);
  assert.equal(profondeurSuivante('-5'), 1);
  assert.equal(profondeurSuivante('NaN'), 1);
});

// ------------------------------------------------------------
// fautIlEnchainer
// ------------------------------------------------------------

test('fautIlEnchainer : relance un passage en cours qui a avancé', () => {
  assert.equal(fautIlEnchainer({ statut: 'en_cours', lots: { faits: 40 } }, 1), true);
});

test('fautIlEnchainer : ne relance jamais un passage terminé ou en erreur', () => {
  assert.equal(fautIlEnchainer({ statut: 'termine', lots: { faits: 40 } }, 1), false);
  assert.equal(fautIlEnchainer({ statut: 'erreur', lots: { faits: 40 } }, 1), false);
  assert.equal(fautIlEnchainer({ statut: 'bail_perdu', lots: { faits: 40 } }, 1), false);
  assert.equal(fautIlEnchainer({ statut: 'inactif' }, 1), false);
});

test('fautIlEnchainer : ne boucle pas à vide quand rien n’a été traduit', () => {
  assert.equal(fautIlEnchainer({ statut: 'en_cours', lots: { faits: 0 } }, 1), false);
  assert.equal(fautIlEnchainer({ statut: 'en_cours', lots: {} }, 1), false);
  assert.equal(fautIlEnchainer({ statut: 'en_cours' }, 1), false);
});

test('fautIlEnchainer : s’arrête à la profondeur maximale', () => {
  const corps = { statut: 'en_cours', lots: { faits: 12 } };
  assert.equal(fautIlEnchainer(corps, PROFONDEUR_MAX_CHAINE), true);
  assert.equal(fautIlEnchainer(corps, PROFONDEUR_MAX_CHAINE + 1), false);
});

test('fautIlEnchainer : refuse une profondeur absurde ou une réponse vide', () => {
  const corps = { statut: 'en_cours', lots: { faits: 12 } };
  assert.equal(fautIlEnchainer(corps, 0), false);
  assert.equal(fautIlEnchainer(corps, Number.NaN), false);
  assert.equal(fautIlEnchainer(null, 1), false);
  assert.equal(fautIlEnchainer(undefined, 1), false);
});
