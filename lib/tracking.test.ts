// ============================================================
// lib/tracking.test.ts — Preuves de la normalisation des visites.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  construireEvenement,
  familleAppareil,
  nettoyerChemin,
  sourceDepuisReferent,
  visiteurValide,
} from './tracking';

test('le chemin perd la requête, l’ancre et les remontées', () => {
  assert.equal(nettoyerChemin('/livres/abc?page=2#haut'), '/livres/abc');
  assert.equal(nettoyerChemin('livres/abc'), '/livres/abc');
  assert.equal(nettoyerChemin('  /tarifs  '), '/tarifs');
});

test('les chemins invalides sont rejetés', () => {
  assert.equal(nettoyerChemin(''), null);
  assert.equal(nettoyerChemin(null), null);
  assert.equal(nettoyerChemin('/api/statut'), null);
  assert.equal(nettoyerChemin('/_next/static/chunk.js'), null);
  assert.equal(nettoyerChemin('//exemple.com/piege'), null);
});

test('un chemin trop long est tronqué, jamais rejeté en silence', () => {
  const long = `/${'a'.repeat(500)}`;
  const propre = nettoyerChemin(long);
  assert.ok(propre !== null);
  assert.equal(propre.length, 200);
});

test('la source est un domaine, jamais une URL complète', () => {
  assert.equal(sourceDepuisReferent('https://www.google.com/search?q=plume'), 'google.com');
  assert.equal(sourceDepuisReferent('https://t.co/abc'), 't.co');
  assert.equal(sourceDepuisReferent(''), null);
  assert.equal(sourceDepuisReferent(null), null);
  assert.equal(sourceDepuisReferent('javascript:alert(1)'), null);
  assert.equal(sourceDepuisReferent('pas une url'), null);
});

test('un lien interne ne compte pas comme source', () => {
  assert.equal(
    sourceDepuisReferent('https://plume-ombres.vercel.app/livres', 'plume-ombres.vercel.app'),
    null
  );
  assert.equal(sourceDepuisReferent('https://www.plume-ombres.vercel.app/a', 'plume-ombres.vercel.app'), null);
});

test('les familles d’appareil sont reconnues', () => {
  assert.equal(familleAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile'), 'mobile');
  assert.equal(familleAppareil('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablette');
  assert.equal(familleAppareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'bureau');
  assert.equal(familleAppareil(null), 'inconnu');
  assert.equal(familleAppareil('Googlebot/2.1 (+http://www.google.com/bot.html)'), 'robot');
});

test('un identifiant de session doit être plausible', () => {
  assert.equal(visiteurValide('abcd1234'), 'abcd1234');
  assert.equal(visiteurValide('court'), null);
  assert.equal(visiteurValide('a'.repeat(65)), null);
  assert.equal(visiteurValide('abc def ghi'), null);
  assert.equal(visiteurValide(undefined), null);
});

test('un robot ne produit aucun événement', () => {
  const evenement = construireEvenement({
    chemin: '/',
    referent: 'https://google.com',
    visiteur: 'session12345',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
  });
  assert.equal(evenement, null);
});

test('un événement complet est normalisé', () => {
  const evenement = construireEvenement({
    chemin: '/livres/abc?x=1',
    referent: 'https://www.facebook.com/p/1',
    visiteur: 'session12345',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Mobile Safari',
    hoteCourant: 'plume-ombres.vercel.app',
  });
  assert.deepEqual(evenement, {
    chemin: '/livres/abc',
    source: 'facebook.com',
    appareil: 'mobile',
    visiteur: 'session12345',
  });
});

test('sans identifiant de session, rien n’est enregistré', () => {
  assert.equal(
    construireEvenement({
      chemin: '/',
      referent: null,
      visiteur: '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
    }),
    null
  );
});
