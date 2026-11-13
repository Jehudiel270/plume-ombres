// ============================================================
// lib/fonctionnalites/registre.test.ts — Registre des interrupteurs.
//
// Les règles testées ici sont celles du brief (BRIEF-HERMES §1) et
// de la maquette (docs/FEATURE-FLAGS.md) : le serveur est
// l'autorité, l'exposition publique reste éteinte, le déploiement
// progressif est déterministe par lecteur.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERRUPTEURS,
  ITINERAIRES_ADMIN,
  ITINERAIRES_SOCLE,
  apercuDeploiement,
  compartiment,
  construireLignesOuvertureMasse,
  estCheminAdmin,
  estCheminApi,
  estCheminSocle,
  etatParDefaut,
  evaluerInterrupteur,
  interrupteurParCle,
  interrupteurPourChemin,
  niveauPlanDepuisCode,
  normaliserChemin,
  planifierOuvertureMasse,
  type EtatInterrupteur,
} from './registre';

const ETAT_OUVERT: EtatInterrupteur = {
  actif: true,
  planMinimal: null,
  deploiement: 100,
};

test('les clés sont uniques et en snake_case stable', () => {
  const cles = INTERRUPTEURS.map((i) => i.cle);
  assert.equal(new Set(cles).size, cles.length, 'clé en double dans le registre');
  for (const cle of cles) {
    assert.match(cle, /^[a-z][a-z0-9_]*$/, `clé non snake_case : ${cle}`);
  }
});

test('tout interrupteur couvre au moins un itinéraire, une API, ou se justifie', () => {
  for (const def of INTERRUPTEURS) {
    const couvert =
      def.itineraires.length > 0 || def.api.length > 0 || Boolean(def.sansItineraire);
    assert.equal(couvert, true, `interrupteur sans effet : ${def.cle}`);
  }
});

test('l’exposition publique est éteinte par défaut, partout', () => {
  for (const def of INTERRUPTEURS) {
    if (!def.risqueJuridique) continue;
    assert.equal(def.prod, false, `module à risque actif par défaut : ${def.cle}`);
    assert.ok(def.noteJuridique, `module à risque sans note juridique : ${def.cle}`);
    const defaut = etatParDefaut(def);
    assert.equal(evaluerInterrupteur(def, defaut).ouvert, false);
  }
});

test('un module à risque ne s’ouvre JAMAIS sans confirmation juriste', () => {
  for (const def of INTERRUPTEURS) {
    if (!def.risqueJuridique) continue;
    const forcéOuvert: EtatInterrupteur = { ...ETAT_OUVERT, actif: true };
    assert.equal(
      evaluerInterrupteur(def, forcéOuvert).raison,
      'juriste',
      `${def.cle} s’ouvrirait sans juriste`
    );
    const validé: EtatInterrupteur = { ...forcéOuvert, juristeOk: true };
    assert.equal(evaluerInterrupteur(def, validé).ouvert, true);
  }
});

test('les clubs restent privés : pas de risque juridique, éteints par défaut', () => {
  const clubs = interrupteurParCle('clubs');
  assert.ok(clubs, 'clubs absent du registre');
  assert.equal(clubs.risqueJuridique, undefined);
  assert.equal(clubs.prod, false);
  assert.match(clubs.description, /PRIVÉS/);
  assert.match(clubs.description, /AUCUN texte de chapitre/);
});

test('normaliserChemin : requête, fragment, casse et slashs superflus', () => {
  assert.deepEqual(normaliserChemin('/Livres/42/GRAPHE?onglet=1'), [
    'livres',
    '42',
    'graphe',
  ]);
  assert.deepEqual(normaliserChemin('//theories//'), ['theories']);
  assert.deepEqual(normaliserChemin('/'), []);
  assert.deepEqual(normaliserChemin('/livres/%20x'), ['livres', ' x']);
});

test('la correspondance par préfixe inclut les sous-chemins', () => {
  assert.equal(interrupteurPourChemin('/theories'), interrupteurParCle('theories'));
  assert.equal(
    interrupteurPourChemin('/theories/comparateur'),
    interrupteurParCle('theories')
  );
  // '*' = un segment exact ; les SOUS-CHEMINS restent inclus
  // (sémantique de la maquette, conservée).
  assert.equal(
    interrupteurPourChemin('/livres/abc123/graphe'),
    interrupteurParCle('graphe')
  );
  assert.equal(
    interrupteurPourChemin('/livres/abc123/graphe/details'),
    interrupteurParCle('graphe')
  );
  // Un chemin du socle n'est couvert par aucun interrupteur.
  assert.equal(interrupteurPourChemin('/bibliotheque'), undefined);
});

test('la portée API et la portée pages sont séparées', () => {
  assert.equal(interrupteurPourChemin('/api/clubs', 'api'), interrupteurParCle('clubs'));
  // /clubs (page) ne matche pas /api/clubs et réciproquement.
  assert.equal(interrupteurPourChemin('/api/clubs', 'pages'), undefined);
  assert.equal(interrupteurPourChemin('/clubs', 'api'), undefined);
});

test('socle et admin : décisions explicites', () => {
  assert.equal(estCheminSocle('/bibliotheque'), true);
  assert.equal(estCheminSocle('/livres/abc'), true);
  assert.equal(estCheminSocle('/tarifs'), true);
  assert.equal(estCheminSocle('/api/paiement/webhook'), true);
  assert.equal(estCheminSocle('/theories'), false);
  assert.equal(estCheminAdmin('/admin'), true);
  assert.equal(estCheminAdmin('/admin/fonctionnalites'), true);
  assert.equal(estCheminAdmin('/api/admin/roles'), true);
  assert.equal(estCheminAdmin('/adminx'), false);
  assert.equal(estCheminApi('/api/clubs'), true);
  assert.equal(estCheminApi('/clubs'), false);
});

test('aucun itinéraire d’interrupteur n’absorbe une route du socle', () => {
  // Sémantique identique à couvre() du registre.
  const couvreMotif = (m: string[], s: string[]): boolean =>
    m.length === 0
      ? s.length === 0
      : m.length <= s.length && m.every((x, i) => x === '*' || x === s[i]);
  for (const socle of ITINERAIRES_SOCLE) {
    for (const def of INTERRUPTEURS) {
      const motifs = [...def.itineraires, ...def.api];
      for (const motif of motifs) {
        const ms = normaliserChemin(motif);
        const ss = normaliserChemin(socle);
        // 1. Un interrupteur ne couvre JAMAIS une route du socle :
        //    la barrière ne doit pas éteindre l'atelier personnel.
        assert.equal(
          couvreMotif(ms, ss),
          false,
          `${motif} (${def.cle}) couvre la route du socle ${socle}`
        );
        // 2. Inverse admis UNIQUEMENT si l'interrupteur est plus
        //    profond qu'un préfixe du socle (ex. /livres/*/graphe sous
        //    /livres) : la barrière retient l'interrupteur le plus
        //    spécifique, le reste du socle reste ouvert.
        if (couvreMotif(ss, ms)) {
          assert.ok(
            ms.length > ss.length,
            `${motif} (${def.cle}) fait doublon avec la route du socle ${socle}`
          );
        }
      }
    }
  }
});

test('l’admin n’est jamais derrière un interrupteur', () => {
  for (const admin of ITINERAIRES_ADMIN) {
    assert.equal(
      interrupteurPourChemin(admin, 'pages'),
      undefined,
      `${admin} couvert par un interrupteur`
    );
    assert.equal(
      interrupteurPourChemin(admin, 'api'),
      undefined,
      `${admin} (api) couvert par un interrupteur`
    );
  }
});

test('compartiment : déterministe, stable, réparti', () => {
  assert.equal(compartiment('lecteur-a', 'clubs'), compartiment('lecteur-a', 'clubs'));
  assert.notEqual(compartiment('lecteur-a', 'clubs'), compartiment('lecteur-b', 'clubs'));
  const valeurs = new Set(
    Array.from({ length: 200 }, (_, i) => compartiment(`lecteur-${i}`, 'clubs'))
  );
  assert.ok(valeurs.size > 60, `répartition trop faible : ${valeurs.size} valeurs`);
});

test('déploiement progressif : ouvert, partiel, fermé', () => {
  const def = interrupteurParCle('progression')!;
  const fermé: EtatInterrupteur = { ...ETAT_OUVERT, deploiement: 0 };
  // À 0 %, personne n'y accède (le compartiment est toujours >= 0).
  assert.equal(evaluerInterrupteur(def, fermé, { utilisateurId: 'u1' }).raison, 'deploiement');
  // À 100 %, tout le monde.
  const ouvert: EtatInterrupteur = { ...ETAT_OUVERT, deploiement: 100 };
  assert.equal(evaluerInterrupteur(def, ouvert, { utilisateurId: 'u1' }).ouvert, true);
  // Le verdict dépend du lecteur : stable par lecteur.
  const partiel: EtatInterrupteur = { ...ETAT_OUVERT, deploiement: 10 };
  const verdictA = evaluerInterrupteur(def, partiel, { utilisateurId: 'lecteur-1' }).ouvert;
  assert.equal(
    verdictA,
    evaluerInterrupteur(def, partiel, { utilisateurId: 'lecteur-1' }).ouvert
  );
  // Sans contexte lecteur (proxy), le déploiement ne bloque pas : la page revérifie.
  assert.equal(evaluerInterrupteur(def, partiel).ouvert, true);
});

test('plan minimal : bloqué sans abonnement suffisant, ouvert sinon', () => {
  const def = interrupteurParCle('univers')!;
  assert.equal(def.planMinimal, 'illimite');
  // État ouvert avec la contrainte de plan du registre (le défaut en
  // production est ÉTEINT : c'est testé ailleurs).
  const ouvert: EtatInterrupteur = {
    actif: true,
    planMinimal: def.planMinimal,
    deploiement: 100,
  };
  assert.equal(
    evaluerInterrupteur(def, ouvert, { utilisateurId: 'u1', niveauPlan: 'gratuit' }).raison,
    'plan'
  );
  assert.equal(
    evaluerInterrupteur(def, ouvert, { utilisateurId: 'u1', niveauPlan: 'lecteur' }).raison,
    'plan'
  );
  assert.equal(
    evaluerInterrupteur(def, ouvert, { utilisateurId: 'u1', niveauPlan: 'passionne' }).raison,
    'plan'
  );
  assert.equal(
    evaluerInterrupteur(def, ouvert, { utilisateurId: 'u1', niveauPlan: 'illimite' }).ouvert,
    true
  );
  // Un visiteur sans contexte lecteur passe la barre grossière du proxy :
  // la page du module revérifie le plan côté serveur.
  assert.equal(evaluerInterrupteur(def, ouvert).ouvert, true);
});

test('niveauPlanDepuisCode : les codes réels sont mappés sans surprise', () => {
  assert.equal(niveauPlanDepuisCode(null), 'gratuit');
  assert.equal(niveauPlanDepuisCode(''), 'gratuit');
  assert.equal(niveauPlanDepuisCode('code_inconnu'), 'gratuit');
  assert.equal(niveauPlanDepuisCode('gratuit'), 'gratuit');
  assert.equal(niveauPlanDepuisCode('essai'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('lecteur_mensuel'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('lecteur_annuel'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('etudiant_mensuel'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('credits_250'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('premium_mensuel'), 'lecteur');
  assert.equal(niveauPlanDepuisCode('passionne_mensuel'), 'passionne');
  assert.equal(niveauPlanDepuisCode('passionne_annuel'), 'passionne');
  assert.equal(niveauPlanDepuisCode('illimite_mensuel'), 'illimite');
  assert.equal(niveauPlanDepuisCode('groupe_mensuel'), 'illimite');
  assert.equal(niveauPlanDepuisCode('ecole_annuel'), 'illimite');
});

test('apercuDeploiement : borne le nombre de lecteurs de test', () => {
  assert.equal(apercuDeploiement('clubs', 0), 0);
  assert.equal(apercuDeploiement('clubs', 100), 20);
  const partiel = apercuDeploiement('clubs', 25);
  assert.ok(partiel >= 0 && partiel <= 20);
});

test('planifierOuvertureMasse : les modules à risque restent ignorés par défaut', () => {
  const etats = new Map(
    INTERRUPTEURS.map((d) => [d.cle, { actif: false, deploiement: 100 }])
  );
  const plan = planifierOuvertureMasse(etats, false);
  assert.ok(plan.aOuvrir.length > 0);
  assert.ok(
    plan.ignoresRisque.every((cle) => {
      const def = interrupteurParCle(cle);
      return def?.risqueJuridique === true;
    }),
    'toutes les clés ignorées sont à risque juridique'
  );
  assert.equal(plan.inchanges.length, 0);
});

test('planifierOuvertureMasse : avecRisque inclut les modules à risque', () => {
  const etats = new Map(
    INTERRUPTEURS.map((d) => [d.cle, { actif: false, deploiement: 100 }])
  );
  const plan = planifierOuvertureMasse(etats, true);
  const tous = plan.aOuvrir.length;
  assert.equal(
    tous,
    INTERRUPTEURS.length,
    'tous les modules sont planifiés quand aucun n\u2019est ouvert'
  );
  assert.equal(plan.ignoresRisque.length, 0);
  assert.equal(plan.inchanges.length, 0);
});

test('planifierOuvertureMasse : un module ouvert à 100 % est inchangé', () => {
  const etats = new Map(
    INTERRUPTEURS.map((d) => [
      d.cle,
      { actif: d.cle === 'carnet', deploiement: d.cle === 'carnet' ? 100 : 50 },
    ])
  );
  const plan = planifierOuvertureMasse(etats, false);
  assert.ok(plan.inchanges.includes('carnet'));
  assert.ok(!plan.aOuvrir.includes('carnet'));
});

test(
  'construireLignesOuvertureMasse : après JSON.stringify, chaque ligne garde les mêmes clés',
  () => {
    // Non-régression du 14/11/2026 : supabase-js déduit les colonnes de
    // l'UNION des clés du tableau. Une clé absente d'une ligne (valeur
    // undefined retirée par JSON.stringify) serait insérée à NULL par
    // PostgREST — colonne NOT NULL → erreur 23502 sur juriste_ok.
    const cles = INTERRUPTEURS.map((d) => d.cle);
    const lignes = construireLignesOuvertureMasse(
      cles,
      'utilisateur-test',
      '2026-11-14T00:00:00.000Z'
    );
    const envoyees = JSON.parse(JSON.stringify(lignes)) as Array<Record<string, unknown>>;
    assert.equal(envoyees.length, cles.length);
    const clesReference = Object.keys(envoyees[0]).sort();
    for (const ligne of envoyees) {
      assert.deepEqual(
        Object.keys(ligne).sort(),
        clesReference,
        'toutes les lignes portent exactement les mêmes clés'
      );
      assert.equal(
        typeof ligne.juriste_ok,
        'boolean',
        'juriste_ok reste un booléen explicite après sérialisation'
      );
    }
  }
);

test('construireLignesOuvertureMasse : juriste_ok vrai seulement pour les modules à risque', () => {
  const cles = INTERRUPTEURS.map((d) => d.cle);
  const lignes = construireLignesOuvertureMasse(
    cles,
    'utilisateur-test',
    '2026-11-14T00:00:00.000Z'
  );
  for (const ligne of lignes) {
    const def = interrupteurParCle(ligne.cle);
    assert.equal(ligne.juriste_ok, def?.risqueJuridique === true);
    assert.equal(ligne.actif, true, 'l\u2019ouverture pose actif à vrai');
    assert.equal(ligne.deploiement, 100, 'l\u2019ouverture pose le déploiement à 100 %');
    assert.equal(ligne.maj_par, 'utilisateur-test');
    assert.equal(ligne.maj_le, '2026-11-14T00:00:00.000Z');
  }
});
