// ============================================================
// lib/confort-lecture.test.ts — Preuves des helpers du confort.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VITESSE_DEFAUT,
  VITESSE_MAX,
  VITESSE_MIN,
  libelleVitesse,
  prochainPas,
  vitesseDefilement,
} from './confort-lecture';

test('la vitesse est bornée dans la fourchette réglable', () => {
  assert.equal(vitesseDefilement(60), 60);
  assert.equal(vitesseDefilement(VITESSE_MIN), VITESSE_MIN);
  assert.equal(vitesseDefilement(VITESSE_MAX), VITESSE_MAX);
  assert.equal(vitesseDefilement(10_000), VITESSE_MAX);
});

test('toute valeur invalide revient à la vitesse par défaut', () => {
  assert.equal(vitesseDefilement(undefined), VITESSE_DEFAUT);
  assert.equal(vitesseDefilement(null), VITESSE_DEFAUT);
  assert.equal(vitesseDefilement('abc'), VITESSE_DEFAUT);
  assert.equal(vitesseDefilement(-5), VITESSE_DEFAUT);
  assert.equal(vitesseDefilement(0), VITESSE_DEFAUT);
  // Une valeur numérique en chaîne est acceptée (localStorage).
  assert.equal(vitesseDefilement('120'), 120);
});

test('le pas suivant avance sans dépasser le fond de page', () => {
  // Page de 2 000 px visibles 800 : fond = 1 200.
  assert.equal(prochainPas(0, 30, 2000, 800), 30);
  assert.equal(prochainPas(1_190, 30, 2000, 800), 1_200);
  assert.equal(prochainPas(600, 900, 2000, 800), 1_200);
});

test('le défilement s\u2019arrête au bas (null)', () => {
  assert.equal(prochainPas(1_200, 30, 2000, 800), null);
  assert.equal(prochainPas(1_250, 30, 2000, 800), null);
});

test('rien à faire défiler : null immédiatement', () => {
  // Contenu plus court que la fenêtre.
  assert.equal(prochainPas(0, 30, 500, 800), null);
  // Conteneur non mesuré.
  assert.equal(prochainPas(0, 30, 0, 0), null);
  assert.equal(prochainPas(NaN, 30, 2000, 800), null);
});

test('le libellé qualitatif suit les paliers de vitesse', () => {
  assert.equal(libelleVitesse(20), 'Contemplative');
  assert.equal(libelleVitesse(40), 'Contemplative');
  assert.equal(libelleVitesse(41), 'Posée');
  assert.equal(libelleVitesse(VITESSE_DEFAUT), 'Posée');
  assert.equal(libelleVitesse(110), 'Posée');
  assert.equal(libelleVitesse(111), 'Soutenue');
  assert.equal(libelleVitesse(200), 'Soutenue');
  assert.equal(libelleVitesse(201), 'Vive');
  assert.equal(libelleVitesse(VITESSE_MAX), 'Vive');
  // Valeurs hors bornes : d'abord bornées, puis libellées.
  assert.equal(libelleVitesse(0), 'Posée'); // invalide → défaut (60)
  assert.equal(libelleVitesse(-5), 'Posée');
  assert.equal(libelleVitesse(9999), 'Vive');
});
