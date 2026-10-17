// ============================================================
// lib/traduction/lot.test.ts — Tests du traitement par lot.
//
// Lancement : npx tsx --test lib/traduction/lot.test.ts
//
// Aucun réseau : la chaîne de secours est remplacée par un traducteur
// injecté, et la libération de quota par une fonction espionne.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserLot,
  traiterLotSegments,
  statutLot,
  enParalleleBorne,
  MAX_SEGMENTS_LOT,
  MAX_CARACTERES_LOT,
  MAX_CARACTERES_SEGMENT,
  type SegmentLot,
  type TraducteurLot,
} from './lot';
import { ErreurChaineSecours } from '@/lib/providers';
import type { ResultatTraductionSecours } from '@/lib/providers';

function succes(traduit: string): ResultatTraductionSecours {
  return {
    traduit,
    fournisseur: 'gemini',
    nomFournisseur: 'Gemini',
    description: 'test',
    prive: false,
    priveStrict: false,
    essais: 1,
    tentatives: 1,
    dureeMs: 1,
  };
}

function segment(id: string, longueur: number): SegmentLot {
  return { id, texte: 'a'.repeat(longueur) };
}

/** Traducteur qui réussit toujours, en préfixant le texte. */
const traduireOk: TraducteurLot = async (texte) => succes(`[fr] ${texte.slice(0, 10)}`);

// ------------------------------------------------------------
// 1. Seuils du contrat
// ------------------------------------------------------------

test('lot vide → refus 400', () => {
  const resultat = analyserLot({ source: 'en', cible: 'fr', segments: [] });
  assert.equal(resultat.ok, false);
  if (!resultat.ok) {
    assert.equal(resultat.statut, 400);
    assert.match(resultat.erreur, /vide/i);
  }
});

test('segments absents ou non-tableau → refus 400', () => {
  for (const corps of [
    { source: 'en', cible: 'fr' },
    { source: 'en', cible: 'fr', segments: 'nope' },
    { source: 'en', cible: 'fr', segments: null },
  ]) {
    const resultat = analyserLot(corps);
    assert.equal(resultat.ok, false);
    if (!resultat.ok) assert.equal(resultat.statut, 400);
  }
});

test('41 segments → refus 400 ; 40 segments → accepté', () => {
  const quaranteEtUn = Array.from({ length: MAX_SEGMENTS_LOT + 1 }, (_, i) =>
    segment(`s${i}`, 5)
  );
  const refuse = analyserLot({ source: 'en', cible: 'fr', segments: quaranteEtUn });
  assert.equal(refuse.ok, false);
  if (!refuse.ok) {
    assert.equal(refuse.statut, 400);
    assert.match(refuse.erreur, /40 segments/);
  }

  const quarante = quaranteEtUn.slice(0, MAX_SEGMENTS_LOT);
  const accepte = analyserLot({ source: 'en', cible: 'fr', segments: quarante });
  assert.equal(accepte.ok, true);
  if (accepte.ok) assert.equal(accepte.segments.length, MAX_SEGMENTS_LOT);
});

test('20 001 caractères → refus 400 ; 20 000 → accepté', () => {
  // 20 segments de 1 000 = 20 000 (borne haute acceptée).
  const vingtMille = Array.from({ length: 20 }, (_, i) => segment(`s${i}`, 1_000));
  const ok = analyserLot({ source: 'en', cible: 'fr', segments: vingtMille });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.caracteresRetenus, MAX_CARACTERES_LOT);

  // 20 001 : un caractère de plus.
  const trop = vingtMille.map((s, i) => (i === 0 ? segment('s0', 1_001) : s));
  const refuse = analyserLot({ source: 'en', cible: 'fr', segments: trop });
  assert.equal(refuse.ok, false);
  if (!refuse.ok) {
    assert.equal(refuse.statut, 400);
    assert.match(refuse.erreur, /20\s?000/);
  }
});

test('paramètres manquants → refus 400', () => {
  const resultat = analyserLot({ segments: [segment('s1', 10)], cible: 'fr' });
  assert.equal(resultat.ok, false);
  if (!resultat.ok) assert.equal(resultat.statut, 400);
});

test('segment > 6 000 caractères : hors réservation, signalé « long »', () => {
  const analyse = analyserLot({
    source: 'en',
    cible: 'fr',
    segments: [
      segment('court', 100),
      segment('long', MAX_CARACTERES_SEGMENT + 1),
    ],
  });
  assert.equal(analyse.ok, true);
  if (!analyse.ok) return;
  assert.deepEqual(analyse.idsTropLongs, ['long']);
  // Seul le segment tenté est réservé.
  assert.equal(analyse.caracteresRetenus, 100);
});

// ------------------------------------------------------------
// 2. Traduction d'un lot
// ------------------------------------------------------------

test('traiterLotSegments : segment trop long sort en échec sans appel moteur', async () => {
  let appels = 0;
  const traduire: TraducteurLot = async (texte) => {
    appels += 1;
    return succes(texte);
  };
  const { resultats, echecs } = await traiterLotSegments(
    [segment('ok1', 20), segment('long', MAX_CARACTERES_SEGMENT + 1)],
    { source: 'en', cible: 'fr', traduire }
  );
  assert.equal(appels, 1);
  assert.deepEqual(resultats.map((r) => r.id), ['ok1']);
  assert.deepEqual(
    echecs.map((e) => ({ id: e.id, raison: e.raison })),
    [{ id: 'long', raison: 'long' }]
  );
});

test('traiterLotSegments : segment vide → échec « vide », sans appel moteur', async () => {
  let appels = 0;
  const traduire: TraducteurLot = async (texte) => {
    appels += 1;
    return succes(texte);
  };
  const { echecs } = await traiterLotSegments([{ id: 'v', texte: '   ' }, segment('s', 5)], {
    source: 'en',
    cible: 'fr',
    traduire,
  });
  assert.equal(appels, 1);
  assert.deepEqual(echecs.map((e) => e.raison), ['vide']);
});

test('quota libéré : une seule libération, du montant exact des segments échoués', async () => {
  const liberations: number[] = [];
  const traduire: TraducteurLot = async (texte) => {
    if (texte.startsWith('ECHEC')) throw new ErreurChaineSecours([{ id: 'gemini', categorie: 'http' }]);
    return succes(texte);
  };
  const segments: SegmentLot[] = [
    { id: 'a', texte: 'x'.repeat(50) },
    { id: 'b', texte: `ECHEC${'y'.repeat(30)}` }, // 35 caractères échoués
    { id: 'c', texte: 'z'.repeat(20) },
    { id: 'd', texte: `ECHEC${'w'.repeat(5)}` }, // 10 caractères échoués
  ];
  const { resultats, echecs } = await traiterLotSegments(segments, {
    source: 'en',
    cible: 'fr',
    traduire,
    libererCaracteres: async (n) => {
      liberations.push(n);
    },
  });
  assert.equal(resultats.length, 2);
  assert.equal(echecs.length, 2);
  assert.deepEqual(liberations, [45], 'une seule libération, somme des échecs');
});

test('quota libéré : les segments jamais tentés (trop longs) ne sont pas libérés', async () => {
  const liberations: number[] = [];
  const traduire: TraducteurLot = async () => {
    throw new ErreurChaineSecours([{ id: 'google', categorie: 'reseau' }]);
  };
  await traiterLotSegments([segment('court', 12), segment('long', MAX_CARACTERES_SEGMENT + 5)], {
    source: 'en',
    cible: 'fr',
    traduire,
    libererCaracteres: async (n) => {
      liberations.push(n);
    },
  });
  assert.deepEqual(liberations, [12]);
});

test('quota libéré : rien à libérer quand tout réussit', async () => {
  const liberations: number[] = [];
  await traiterLotSegments([segment('a', 10), segment('b', 20)], {
    source: 'en',
    cible: 'fr',
    traduire: traduireOk,
    libererCaracteres: async (n) => {
      liberations.push(n);
    },
  });
  assert.deepEqual(liberations, []);
});

test('une panne de la libération ne casse pas la réponse du lot', async () => {
  const traduire: TraducteurLot = async (texte) => {
    if (texte === 'ko') throw new Error('panne');
    return succes(texte);
  };
  const { resultats, echecs } = await traiterLotSegments(
    [{ id: 'a', texte: 'bonjour' }, { id: 'b', texte: 'ko' }],
    {
      source: 'en',
      cible: 'fr',
      traduire,
      libererCaracteres: async () => {
        throw new Error('magasin indisponible');
      },
    }
  );
  assert.equal(resultats.length, 1);
  assert.equal(echecs.length, 1);
});

// ------------------------------------------------------------
// 3. Statut global (ok | partiel | indisponible)
// ------------------------------------------------------------

test('statut : ok quand tout réussit', async () => {
  const resultat = await traiterLotSegments([segment('a', 5), segment('b', 6)], {
    source: 'en',
    cible: 'fr',
    traduire: traduireOk,
  });
  assert.equal(statutLot(resultat), 'ok');
});

test('statut : partiel quand un segment échoue', async () => {
  const traduire: TraducteurLot = async (texte) => {
    if (texte === 'ko') throw new ErreurChaineSecours([{ id: 'mymemory', categorie: 'http' }]);
    return succes(texte);
  };
  const resultat = await traiterLotSegments(
    [{ id: 'a', texte: 'bonjour' }, { id: 'b', texte: 'ko' }],
    { source: 'en', cible: 'fr', traduire }
  );
  assert.equal(resultat.resultats.length, 1);
  assert.equal(resultat.echecs.length, 1);
  assert.equal(statutLot(resultat), 'partiel');
});

test('statut : indisponible quand le service lâche sur tout le lot', async () => {
  const traduire: TraducteurLot = async () => {
    throw new ErreurChaineSecours([{ id: 'libretranslate', categorie: 'reseau' }]);
  };
  const resultat = await traiterLotSegments([segment('a', 5), segment('b', 5)], {
    source: 'en',
    cible: 'fr',
    traduire,
  });
  assert.equal(resultat.resultats.length, 0);
  assert.equal(statutLot(resultat), 'indisponible');
});

test('statut : partiel si le lot ne contient que des segments refusés (trop longs)', async () => {
  const resultat = await traiterLotSegments([segment('long', MAX_CARACTERES_SEGMENT + 1)], {
    source: 'en',
    cible: 'fr',
    traduire: traduireOk,
  });
  assert.equal(resultat.echecs[0]?.raison, 'long');
  assert.equal(statutLot(resultat), 'partiel');
});

// ------------------------------------------------------------
// 4. Aucun nom de fournisseur dans les messages utilisateur
// ------------------------------------------------------------

const NOMS_FOURNISSEURS = ['gemini', 'google', 'mymemory', 'libretranslate', 'libre translate'];

test('aucun nom de fournisseur dans les messages d’erreur', async () => {
  const traduire: TraducteurLot = async () => {
    throw new ErreurChaineSecours([
      { id: 'libretranslate', categorie: 'reseau' },
      { id: 'gemini', categorie: 'quota' },
      { id: 'google', categorie: 'http' },
      { id: 'mymemory', categorie: 'timeout' },
    ]);
  };
  const { echecs } = await traiterLotSegments(
    [segment('a', 5), segment('long', MAX_CARACTERES_SEGMENT + 1)],
    { source: 'en', cible: 'fr', traduire }
  );
  assert.ok(echecs.length >= 2);
  for (const echec of echecs) {
    const message = echec.message.toLowerCase();
    for (const nom of NOMS_FOURNISSEURS) {
      assert.equal(
        message.includes(nom),
        false,
        `le message d'échec expose « ${nom} » : ${echec.message}`
      );
    }
    // Aucune trace technique (identifiant moteur, catégorie) non plus.
    assert.equal(/http|reseau|timeout|quota\b/i.test(echec.message), false, echec.message);
  }
});

test('aucun nom de fournisseur quand le moteur renvoie une traduction vide', async () => {
  const traduire: TraducteurLot = async () => succes('   ');
  const { echecs } = await traiterLotSegments([segment('a', 5)], {
    source: 'en',
    cible: 'fr',
    traduire,
  });
  assert.equal(echecs.length, 1);
  const message = echecs[0].message.toLowerCase();
  for (const nom of NOMS_FOURNISSEURS) assert.equal(message.includes(nom), false);
});

// ------------------------------------------------------------
// 5. Parallélisme borné à 8
// ------------------------------------------------------------

test('8 traductions simultanées au maximum par défaut', async () => {
  let enCours = 0;
  let maximum = 0;
  const traduire: TraducteurLot = async (texte) => {
    enCours += 1;
    maximum = Math.max(maximum, enCours);
    await new Promise((r) => setTimeout(r, 5));
    enCours -= 1;
    return succes(texte);
  };
  const segments = Array.from({ length: 20 }, (_, i) => segment(`s${i}`, 5));
  const { resultats } = await traiterLotSegments(segments, {
    source: 'en',
    cible: 'fr',
    traduire,
  });
  assert.equal(resultats.length, 20);
  assert.equal(maximum, 8, `parallélisme observé : ${maximum}`);
  // L'ordre de sortie suit l'ordre d'entrée.
  assert.deepEqual(resultats.map((r) => r.id), segments.map((s) => s.id));
});

test('enParalleleBorne respecte la borne demandée', async () => {
  let enCours = 0;
  let maximum = 0;
  const resultats = await enParalleleBorne([1, 2, 3, 4, 5, 6], 2, async (n) => {
    enCours += 1;
    maximum = Math.max(maximum, enCours);
    await new Promise((r) => setTimeout(r, 3));
    enCours -= 1;
    return n * 2;
  });
  assert.deepEqual(resultats, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximum, 2);
});
