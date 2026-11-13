// ============================================================
// lib/cles-api.test.ts — Preuves du réservoir de clés : succession
// filtrée par abonnement, cooldown (temps de repos), détection des
// échecs de clé, lecture défensive de la table.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COOLDOWN_CLE_MS,
  SEUIL_ECHECS,
  cleServitPourPlan,
  cleUsable,
  echecVautPourCle,
  listerClesApi,
  metaFournisseur,
  estFournisseurConnu,
  successionPourPlan,
  type LigneCleApi,
} from './cles-api';

function ligne(surcharge: Partial<LigneCleApi>): LigneCleApi {
  return {
    id: surcharge.id ?? 'id-defaut',
    fournisseur: surcharge.fournisseur ?? 'gemini',
    libelle: surcharge.libelle ?? 'Clé',
    valeur: surcharge.valeur ?? 'AIzaSyD-1234567890abcdefghijklmnopqrstuv',
    planMinimal: surcharge.planMinimal ?? null,
    position: surcharge.position ?? 0,
    actif: surcharge.actif ?? true,
    echecsConsecutifs: surcharge.echecsConsecutifs ?? 0,
    suspendueLe: surcharge.suspendueLe ?? null,
    derniereErreur: surcharge.derniereErreur ?? null,
    majLe: surcharge.majLe ?? null,
  };
}

test('cleServitPourPlan : null sert tout le monde, sinon niveau et au-dessus', () => {
  // Sans affectation : tous les niveaux.
  assert.equal(cleServitPourPlan(null, 'gratuit'), true);
  assert.equal(cleServitPourPlan(null, 'illimite'), true);
  // Clé réservée « Passionné et plus ».
  assert.equal(cleServitPourPlan('passionne', 'gratuit'), false);
  assert.equal(cleServitPourPlan('passionne', 'lecteur'), false);
  assert.equal(cleServitPourPlan('passionne', 'passionne'), true);
  assert.equal(cleServitPourPlan('passionne', 'illimite'), true);
  // Clé réservée « Illimité » seul.
  assert.equal(cleServitPourPlan('illimite', 'passionne'), false);
  assert.equal(cleServitPourPlan('illimite', 'illimite'), true);
  // Niveau inconnu (essai admin) : pas de filtrage.
  assert.equal(cleServitPourPlan('passionne', null), true);
  assert.equal(cleServitPourPlan('bizarre', 'lecteur'), true);
});

test('cleUsable : inactive ou en repos récent = non ; repos expiré = oui', () => {
  const maintenant = Date.now();
  assert.equal(cleUsable(ligne({ actif: false }), maintenant), false);
  assert.equal(cleUsable(ligne({}), maintenant), true);
  // Suspendue il y a 10 secondes : encore en repos (1 minute).
  assert.equal(
    cleUsable(ligne({ suspendueLe: new Date(maintenant - 10_000).toISOString() }), maintenant),
    false
  );
  // Suspendue il y a 2 minutes : réintégrée dans la rotation.
  assert.equal(
    cleUsable(
      ligne({ suspendueLe: new Date(maintenant - COOLDOWN_CLE_MS - 60_000).toISOString() }),
      maintenant
    ),
    true
  );
  // Horodatage illisible : on ne bloque pas (défensif).
  assert.equal(cleUsable(ligne({ suspendueLe: 'pas-une-date' }), maintenant), true);
});

test('successionPourPlan : filtre fournisseur + plan + état, trie par position', () => {
  const maintenant = Date.now();
  const cles = [
    ligne({ id: 'a', fournisseur: 'gemini', position: 1 }),
    ligne({ id: 'b', fournisseur: 'gemini', position: 0, planMinimal: 'illimite' }),
    ligne({ id: 'c', fournisseur: 'deepseek', position: 2 }),
    ligne({ id: 'd', fournisseur: 'gemini', position: 2, actif: false }),
    ligne({
      id: 'e',
      fournisseur: 'gemini',
      position: 3,
      suspendueLe: new Date(maintenant - 1000).toISOString(),
    }),
  ];

  // Sans filtre de niveau (niveau null = sans filtrage documenté) :
  // TOUTES les Gemini utilisables, y compris les clés réservées.
  assert.deepEqual(
    successionPourPlan(cles, 'gemini', null, maintenant).map((c) => c.id),
    ['b', 'a']
  );
  // Pour un gratuit : la clé réservée 'illimite' est exclue.
  assert.deepEqual(
    successionPourPlan(cles, 'gemini', 'gratuit', maintenant).map((c) => c.id),
    ['a']
  );
  // Pour un Illimité : la clé réservée 'b' sert d'abord (position 0).
  assert.deepEqual(
    successionPourPlan(cles, 'gemini', 'illimite', maintenant).map((c) => c.id),
    ['b', 'a']
  );
  // Fournisseur isolé.
  assert.deepEqual(
    successionPourPlan(cles, 'deepseek', 'gratuit', maintenant).map((c) => c.id),
    ['c']
  );
});

test('echecVautPourCle : quota et accès oui, modèle absent non', () => {
  assert.ok(echecVautPourCle('Gemini a répondu 429 (gemini-flash-latest).'));
  assert.ok(echecVautPourCle('Le modèle a répondu 401.'));
  assert.ok(echecVautPourCle('API key invalid'));
  assert.ok(echecVautPourCle('quota exceeded for this project'));
  // Un modèle fermé (404) ou saturé (503) n'est PAS un échec de clé :
  // c'est la bascule de modèle normale.
  assert.equal(echecVautPourCle('Le modèle a répondu 404.'), false);
  assert.equal(echecVautPourCle('Le modèle a répondu 503.'), false);
});

test('metaFournisseur et estFournisseurConnu : catalogue défensif', () => {
  assert.equal(metaFournisseur('gemini').libelle, 'Gemini (Google AI Studio)');
  // Fournisseur inconnu → « Autre » (jamais d'exception).
  assert.equal(metaFournisseur('inconnu').id, 'autre');
  assert.equal(estFournisseurConnu('deepseek'), true);
  assert.equal(estFournisseurConnu('pas-un-fournisseur'), false);
  assert.equal(estFournisseurConnu(42), false);
});

type Ligne = Record<string, unknown>;

/** Client factice : from('cles_api') → réponse fixée, chaîne complète. */
function clientFactice(reponse: { data: Ligne[] | null; error: { message: string } | null }) {
  const brut = {
    from(_table: string) {
      return {
        select() {
          return {
            order() {
              return {
                order: async () => reponse,
              };
            },
          };
        },
      };
    },
  };
  return brut as unknown as Parameters<typeof listerClesApi>[0];
}

test('listerClesApi lit la base et résiste à une table absente', async () => {
  const ok = clientFactice({
    data: [
      {
        id: 'x1',
        fournisseur: 'gemini',
        libelle: ' Clé un ',
        valeur: 'AIzaSyD-1234567890abcdefghijklmnopqrstuv',
        plan_minimal: 'passionne',
        position: 0,
        actif: true,
        echecs_consecutifs: 2,
        suspendue_le: null,
        derniere_erreur: null,
        maj_le: '2026-11-13T10:00:00Z',
      },
      { id: 'x2', valeur: 'cle-trop-etrange-sans-fournisseur-valide' },
    ],
    error: null,
  });
  const cles = await listerClesApi(ok);
  assert.equal(cles.length, 2);
  assert.equal(cles[0].libelle, 'Clé un');
  assert.equal(cles[0].planMinimal, 'passionne');
  assert.equal(cles[0].echecsConsecutifs, 2);
  // Ligne mal formée : normalisée sur des valeurs sûres (fournisseur 'autre').
  assert.equal(cles[1].fournisseur, 'autre');
  assert.equal(cles[1].actif, true);

  const erreur = clientFactice({ data: null, error: { message: 'relation does not exist' } });
  assert.deepEqual(await listerClesApi(erreur), []);

  assert.equal(SEUIL_ECHECS, 3, 'seuil de repos documenté');
});
