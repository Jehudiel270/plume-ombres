// ============================================================
// lib/graphe-ia.test.ts — Preuves du parseur de propositions IA.
// Aucun réseau : on teste analyserProposition (pure) et le prompt.
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyserProposition,
  estNiveauDetail,
  promptGraphe,
  defNiveauDetail,
  NIVEAUX_DETAIL,
} from './graphe-ia';

test('le prompt impose le JSON et l\u2019interdit de deviner la suite', () => {
  const p = promptGraphe('detaille');
  assert.ok(p.includes('JSON'), 'le prompt exige un JSON');
  assert.ok(p.includes('UNIQUEMENT'), 'garde anti-spoilers présente');
  assert.ok(p.includes('personnages'), 'structure demandée');
  // Chaque niveau a son exigence propre.
  assert.ok(promptGraphe('essentiel').includes('ESSENTIEL'));
  assert.ok(promptGraphe('exhaustif').includes('EXHAUSTIF'));
});

test('les niveaux de détails sont complets et bornés', () => {
  assert.equal(NIVEAUX_DETAIL.length, 3);
  for (const n of NIVEAUX_DETAIL) {
    assert.ok(n.maxContexte > 0);
    assert.ok(n.maxSortie > 0);
    assert.ok(n.description.length > 10);
  }
  assert.ok(estNiveauDetail('essentiel'));
  assert.ok(!estNiveauDetail('bavardage'));
  // Défaut : le niveau détaillé.
  assert.equal(defNiveauDetail('nimporte' as never).id, 'detaille');
});

const REPONSE_VALIDE = `Voici ma proposition :
\`\`\`json
{
  "personnages": [
    {"nom": "Isolde", "role": "protagoniste", "importance": 3, "description": "Héroïne au cœur sombre.", "premierePosition": 1},
    {"nom": "Malrik", "role": "antagoniste", "importance": 3, "description": "Seigneur de la cité.", "premierePosition": 2},
    {"nom": "Isolde", "role": "secondaire", "importance": 1, "description": "Doublon ignoré."}
  ],
  "relations": [
    {"origine": "Isolde", "destination": "Malrik", "libelle": "se méfie de", "type": "mefiance", "sens": "ab", "intensite": 4, "etat": "tendue", "fiabilite": "fait", "premierePosition": 2},
    {"origine": "Isolde", "destination": "Isolde", "libelle": "boucle", "type": "autre", "sens": "none", "intensite": 1},
    {"origine": "Inconnu", "destination": "Malrik", "libelle": "hante", "type": "secret", "sens": "none", "intensite": 2}
  ],
  "evenements": [
    {"position": 1, "genre": "rencontre", "titre": "Première rencontre", "texte": "Un regard de trop.", "personnages": ["Isolde", "Malrik"]},
    {"position": 9, "genre": "rupture", "titre": "Chapitre non lu", "personnages": ["Isolde"]}
  ]
}
\`\`\``;

test('le parseur extrait le JSON enrobé et valide chaque champ', () => {
  const p = analyserProposition(REPONSE_VALIDE, 3, 'detaille', 8);
  assert.ok(p, 'proposition extraite');
  // Doublon de nom ignoré (2 personnages, pas 3).
  assert.equal(p!.personnages.length, 2);
  assert.equal(p!.personnages[0]!.nom, 'Isolde');
  assert.equal(p!.personnages[0]!.role, 'protagoniste');
  // Relation en boucle écartée, relation avec inconnu écartée.
  assert.equal(p!.relations.length, 1);
  assert.equal(p!.relations[0]!.type, 'mefiance');
  assert.equal(p!.relations[0]!.fiabilite, 'fait');
  // L'événement du chapitre 9 est écarté (au-delà de la longueur 8).
  assert.equal(p!.evenements.length, 1);
  assert.equal(p!.evenements[0]!.position, 1);
  // Les noms des personnages cités sont conservés tels quels.
  assert.deepEqual(p!.evenements[0]!.personnages, ['Isolde', 'Malrik']);
  assert.equal(p!.jusquPosition, 3);
  assert.equal(p!.niveauDetail, 'detaille');
});

test('un champ invalide retombe sur une valeur sûre', () => {
  const p = analyserProposition(
    `{"personnages": [{"nom": "  Ada  ", "role": "divinité", "importance": 99, "description": "   "}],
      "relations": [{"origine": "Ada", "destination": "Ada", "libelle": "  ", "type": "inconnu", "intensite": 42}],
      "evenements": [{"position": 0, "titre": "  ", "genre": "fete"}]}`,
    2,
    'essentiel',
    5
  );
  assert.ok(p);
  assert.equal(p!.personnages.length, 1);
  assert.equal(p!.personnages[0]!.nom, 'Ada'); // nom nettoyé
  assert.equal(p!.personnages[0]!.role, 'secondaire'); // rôle inconnu → sûr
  assert.equal(p!.personnages[0]!.importance, 2); // hors bornes → 2
  assert.equal(p!.personnages[0]!.description, null); // vide → null
  assert.equal(p!.relations.length, 0); // boucle écartée
  assert.equal(p!.evenements.length, 0); // position 0 et titre vide écartés
  // Type inconnu jamais conservé : la relation n'existe plus, mais si
  // elle existait, elle serait « autre ».
});

test('sans personnage exploitable, la proposition est refusée', () => {
  assert.equal(analyserProposition('aucun JSON ici', 2, 'detaille', 5), null);
  assert.equal(analyserProposition('{"personnages": []}', 2, 'detaille', 5), null);
  assert.equal(analyserProposition('{"personnages": [{"nom": ""}]}', 2, 'detaille', 5), null);
  assert.equal(analyserProposition('{"personnages": [{x}]}', 2, 'detaille', 5), null);
});
