// ============================================================
// lib/admin-paiements.test.ts — Preuves des filtres et agrégats.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FILTRES_VIDES,
  agregerPaiements,
  debutPeriode,
  filtrerPaiements,
  libelleStatut,
  valeursDisponibles,
  type FiltresPaiements,
} from './admin-paiements';
import type { PaiementAdmin } from './admin-stats';

const MAINTENANT = new Date('2026-11-03T12:00:00.000Z');

function paiement(partiel: Partial<PaiementAdmin> & { reference: string }): PaiementAdmin {
  return {
    pseudo: 'lectrice',
    plan: 'pack_2500',
    montant: 2500,
    devise: 'XOF',
    statut: 'reussi',
    fournisseur: 'fedapay',
    operateur: 'mtn',
    referenceFournisseur: 'trx_1',
    creeLe: '2026-11-03T08:00:00.000Z',
    ...partiel,
  };
}

const JEU: PaiementAdmin[] = [
  paiement({ reference: 'p_auj', creeLe: '2026-11-03T08:00:00.000Z' }),
  paiement({
    reference: 'p_hier',
    creeLe: '2026-11-02T08:00:00.000Z',
    statut: 'echoue',
    fournisseur: 'fedapay',
    montant: 500,
  }),
  paiement({
    reference: 'p_10j',
    creeLe: '2026-10-24T08:00:00.000Z',
    fournisseur: 'simulation',
    pseudo: 'Prosper',
    montant: 5000,
  }),
  paiement({ reference: 'p_vieux', creeLe: '2026-01-05T08:00:00.000Z', montant: 1000 }),
  paiement({ reference: 'p_sansdate', creeLe: null }),
];

test('les filtres vides laissent tout passer', () => {
  assert.equal(filtrerPaiements(JEU, FILTRES_VIDES, MAINTENANT).length, JEU.length);
});

test('la période « aujourd’hui » ne garde que le jour courant', () => {
  const filtres: FiltresPaiements = { ...FILTRES_VIDES, periode: 'aujourd_hui' };
  const resultat = filtrerPaiements(JEU, filtres, MAINTENANT);
  assert.deepEqual(
    resultat.map((p) => p.reference),
    ['p_auj']
  );
});

test('la période « sept jours » garde les six jours précédents', () => {
  const filtres: FiltresPaiements = { ...FILTRES_VIDES, periode: 'sept_jours' };
  const resultat = filtrerPaiements(JEU, filtres, MAINTENANT);
  assert.deepEqual(
    resultat.map((p) => p.reference).sort(),
    ['p_auj', 'p_hier']
  );
});

test('un paiement sans date est exclu de toute période bornée', () => {
  const filtres: FiltresPaiements = { ...FILTRES_VIDES, periode: 'trente_jours' };
  const references = filtrerPaiements(JEU, filtres, MAINTENANT).map((p) => p.reference);
  assert.ok(!references.includes('p_sansdate'));
  assert.ok(references.includes('p_10j'));
});

test('filtre par statut et par fournisseur', () => {
  const parStatut = filtrerPaiements(JEU, { ...FILTRES_VIDES, statut: 'echoue' }, MAINTENANT);
  assert.deepEqual(parStatut.map((p) => p.reference), ['p_hier']);

  const parFournisseur = filtrerPaiements(
    JEU,
    { ...FILTRES_VIDES, fournisseur: 'simulation' },
    MAINTENANT
  );
  assert.deepEqual(parFournisseur.map((p) => p.reference), ['p_10j']);
});

test('la recherche est insensible à la casse et aux accents', () => {
  assert.deepEqual(
    filtrerPaiements(JEU, { ...FILTRES_VIDES, recherche: 'prosper' }, MAINTENANT).map(
      (p) => p.reference
    ),
    ['p_10j']
  );
  assert.deepEqual(
    filtrerPaiements(JEU, { ...FILTRES_VIDES, recherche: 'P_10J' }, MAINTENANT).map(
      (p) => p.reference
    ),
    ['p_10j']
  );
  // Deux mots : tous doivent apparaître (ET, pas OU).
  assert.deepEqual(
    filtrerPaiements(JEU, { ...FILTRES_VIDES, recherche: 'simulation 5000' }, MAINTENANT).map(
      (p) => p.reference
    ),
    ['p_10j']
  );
});

test('les filtres se combinent', () => {
  const resultat = filtrerPaiements(
    JEU,
    { recherche: 'fedapay', statut: 'reussi', fournisseur: 'fedapay', periode: 'sept_jours' },
    MAINTENANT
  );
  assert.deepEqual(
    resultat.map((p) => p.reference),
    ['p_auj']
  );
});

test('les agrégats ne comptent que les paiements encaissés dans le volume', () => {
  const agregats = agregerPaiements(JEU, 3);
  assert.equal(agregats.nombre, 5);
  // Quatre « reussi » : 2500 + 5000 + 1000 + 2500. L'échec de 500 est ignoré.
  assert.equal(agregats.volume, 11000);
  assert.equal(agregats.panierMoyen, Math.round(11000 / 4));
  assert.equal(agregats.tauxSucces, 4 / 5);
});

test('la répartition par statut est triée et libellée', () => {
  const agregats = agregerPaiements(JEU, 3);
  assert.equal(agregats.parStatut[0].nombre, 4);
  assert.equal(agregats.parStatut[0].libelle, libelleStatut('reussi'));
  assert.ok(agregats.parStatut.some((ligne) => ligne.libelle === 'Échoué'));
});

test('la série quotidienne est continue et se termine à la date de référence', () => {
  // Horloge figée (MAINTENANT) : le test ne dépend plus du jour réel.
  const agregats = agregerPaiements(JEU, 5, MAINTENANT);
  assert.equal(agregats.serie.length, 5);
  const jours = agregats.serie.map((point) => point.jour);
  assert.equal(new Set(jours).size, 5);
  // Le dernier point est le jour courant de la référence (heure locale).
  const attendu = [
    MAINTENANT.getFullYear(),
    String(MAINTENANT.getMonth() + 1).padStart(2, '0'),
    String(MAINTENANT.getDate()).padStart(2, '0'),
  ].join('-');
  assert.equal(jours[4], attendu);
  // Seul le paiement du jour tombe dans la fenêtre : 2 500.
  const total = agregats.serie.reduce((somme, point) => somme + point.encaisse, 0);
  assert.equal(total, 2500);
});

test('un jeu vide ne casse rien', () => {
  const agregats = agregerPaiements([], 7);
  assert.equal(agregats.nombre, 0);
  assert.equal(agregats.volume, 0);
  assert.equal(agregats.panierMoyen, 0);
  assert.equal(agregats.tauxSucces, 0);
  assert.equal(agregats.serie.length, 7);
  assert.deepEqual(agregats.parStatut, []);
});

test('debutPeriode rend des bornes cohérentes', () => {
  const aujourdHui = debutPeriode('aujourd_hui', MAINTENANT);
  const sept = debutPeriode('sept_jours', MAINTENANT);
  const trente = debutPeriode('trente_jours', MAINTENANT);
  assert.ok(aujourdHui !== null && sept !== null && trente !== null);
  assert.ok(sept < aujourdHui);
  assert.ok(trente < sept);
  assert.equal(sept, aujourdHui - 6 * 24 * 60 * 60 * 1000);
  assert.equal(debutPeriode('tout', MAINTENANT), null);
});

test('valeursDisponibles expose statuts et fournisseurs réels', () => {
  const valeurs = valeursDisponibles(JEU);
  assert.deepEqual(valeurs.fournisseurs.sort(), ['fedapay', 'simulation']);
  assert.ok(valeurs.statuts.some((s) => s.valeur === 'echoue' && s.libelle === 'Échoué'));
});
