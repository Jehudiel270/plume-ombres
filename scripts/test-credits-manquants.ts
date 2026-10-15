// ============================================================
// Tests réels — Complément de crédits AU PRORATA (lib/credits-manquants.ts)
// Usage : npx tsx scripts/test-credits-manquants.ts
//
// PUREMENT LOCAL : aucune base, aucun réseau, aucune écriture. Le
// catalogue utilisé est le CATALOGUE RÉEL de lib/abonnement.ts
// (snapshot généré depuis public.packs_credits), donc les volumes et
// les prix testés sont ceux de la production.
//
// Couvre : déficit, sélection du pack le plus juste, complément au
// prorata, arrondi commercial, réduction, message, et les cas limites.
// ============================================================

import { packsCredits, libelleCaracteres } from '../lib/abonnement';
import {
  arrondiCommercial,
  calculerComplement,
  packLePlusJuste,
  soldeRestant,
  GRILLE_REMISE_XOF,
  PLANCHER_REMISE_XOF,
  type ComplementCredits,
} from '../lib/credits-manquants';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

/** Normalise les espaces (l'ICU fr-FR utilise des espaces fines insécables). */
const norm = (s: string) => s.replace(/\s/g, ' ');

function principal() {
  const packs = packsCredits();

  // ----------------------------------------------------------
  // 0. Ancrage sur le CATALOGUE RÉEL
  // ----------------------------------------------------------
  console.log('— 0. Catalogue réel des packs (source de vérité) —');
  const volumes = packs.map((p) => p.caracteres);
  const prix = packs.map((p) => p.prixXof);
  verifier(
    '0.1 : 4 packs réels (250 k / 600 k / 1,8 M / 4 M)',
    JSON.stringify(volumes) === JSON.stringify([250000, 600000, 1800000, 4000000]),
    JSON.stringify(volumes)
  );
  verifier(
    '0.2 : prix réels (500 / 1 000 / 2 500 / 5 000 F CFA)',
    JSON.stringify(prix) === JSON.stringify([500, 1000, 2500, 5000]),
    JSON.stringify(prix)
  );

  // ----------------------------------------------------------
  // 1. Arrondi commercial (grille 50 F, plancher 100 F)
  // ----------------------------------------------------------
  console.log('\n— 1. Arrondi commercial —');
  verifier('1.1 : grille = 50 F, plancher = 100 F',
    GRILLE_REMISE_XOF === 50 && PLANCHER_REMISE_XOF === 100);
  verifier('1.2 : 0 → plancher 100', arrondiCommercial(0) === 100);
  verifier('1.3 : négatif → plancher 100', arrondiCommercial(-5) === 100);
  verifier('1.4 : 40 → 100 (plancher)', arrondiCommercial(40) === 100);
  verifier('1.5 : 124 → 100 (multiple le plus proche)', arrondiCommercial(124) === 100);
  verifier('1.6 : 126 → 150', arrondiCommercial(126) === 150);
  verifier('1.7 : 400 → 400 (déjà sur la grille)', arrondiCommercial(400) === 400);

  // ----------------------------------------------------------
  // 2. Solde restant & pack le plus juste
  // ----------------------------------------------------------
  console.log('\n— 2. Solde restant & pack le plus juste —');
  verifier(
    '2.1 : soldeRestant additionne quota + crédits',
    soldeRestant({ quotaRestant: 580000, credits: 40000 }) === 620000
  );
  verifier(
    '2.2 : soldeRestant ignore les valeurs négatives',
    soldeRestant({ quotaRestant: -10, credits: -5 }) === 0
  );
  verifier(
    '2.3 : 20 000 manquants → plus petit pack qui couvre = 250 k',
    packLePlusJuste(20000, packs)?.code === 'credits_250'
  );
  verifier(
    '2.4 : 400 000 manquants → 600 k (et non 250 k)',
    packLePlusJuste(400000, packs)?.code === 'credits_600'
  );
  verifier(
    '2.5 : 1 500 000 manquants → 1,8 M',
    packLePlusJuste(1500000, packs)?.code === 'credits_1800'
  );
  verifier(
    '2.6 : déficit au-delà du plus gros pack → renvoie le plus gros',
    packLePlusJuste(5000000, packs)?.code === 'credits_4000'
  );
  verifier('2.7 : aucun pack → null', packLePlusJuste(1000, []) === null);

  // ----------------------------------------------------------
  // 3. Cas cible : solde JUSTE EN DESSOUS de la taille du livre
  // ----------------------------------------------------------
  console.log('\n— 3. Cas cible (solde juste sous la taille du livre) —');

  // 3.a Livre 600 000 car. (référence projet) ; il manque 20 000.
  const a: ComplementCredits = calculerComplement(
    600000,
    { quotaRestant: 580000, credits: 0 },
    packs
  );
  verifier('3.a : nécessite un complément', a.necessaire === true);
  verifier('3.a : déficit exact = 20 000', a.deficit === 20000);
  verifier('3.a : pack le plus juste = Pack Découverte (250 k)',
    a.pack?.code === 'credits_250' && a.packCaracteres === 250000);
  verifier('3.a : un seul pack suffit', a.couvre === true && a.packsNecessaires === 1);
  verifier('3.a : prix plein 500 F', a.prixPleinXof === 500);
  verifier('3.a : complément au prorata = 100 F (arrondi commercial)',
    a.prixProrataXof === 100, String(a.prixProrataXof));
  verifier('3.a : réduction = 400 F (80 %)',
    a.remiseXof === 400 && a.remisePourcent === 80);
  verifier('3.a : message clair (taille, déficit, pack, prix)',
    norm(a.message).includes('600 000 caractères') &&
      norm(a.message).includes('20 000') &&
      norm(a.message).includes('Pack Découverte') &&
      norm(a.message).includes('100 F CFA') &&
      norm(a.message).includes('400 F CFA de moins'),
    a.message);

  // 3.b Livre 600 000 ; il manque 400 000 → 600 k à 666,67 F → arrondi 650.
  const b = calculerComplement(600000, { quotaRestant: 200000, credits: 0 }, packs);
  verifier('3.b : déficit = 400 000', b.deficit === 400000);
  verifier('3.b : pack = 600 k', b.pack?.code === 'credits_600');
  verifier('3.b : prorata arrondi = 650 F', b.prixProrataXof === 650,
    String(b.prixProrataXof));
  verifier('3.b : réduction = 350 F (35 %)',
    b.remiseXof === 350 && b.remisePourcent === 35);

  // 3.c Quota + crédits combinés : le solde total suffit presque.
  const c = calculerComplement(
    600000,
    { quotaRestant: 550000, credits: 40000 },
    packs
  );
  verifier('3.c : solde = 590 000, déficit = 10 000',
    c.soldeRestant === 590000 && c.deficit === 10000);
  verifier('3.c : prorata jamais sous le plancher (100 F)', c.prixProrataXof === 100);

  // ----------------------------------------------------------
  // 4. Cas limites
  // ----------------------------------------------------------
  console.log('\n— 4. Cas limites —');

  // 4.a Le solde suffit : aucune proposition.
  const d = calculerComplement(600000, { quotaRestant: 700000, credits: 0 }, packs);
  verifier('4.a : solde suffisant → pas de complément',
    d.necessaire === false && d.deficit === 0 && d.pack === null);
  verifier('4.a : prix prorata = 0', d.prixProrataXof === 0);
  verifier('4.a : message « Votre solde couvre ce livre »',
    norm(d.message).includes('Votre solde couvre ce livre'), d.message);

  // 4.b Déficit au-delà du plus gros pack : plusieurs packs, pas de prorata.
  const e = calculerComplement(5000000, { quotaRestant: 0, credits: 0 }, packs);
  verifier('4.b : 5 M → 2 × Pack Collection, couvre = false',
    e.couvre === false && e.packsNecessaires === 2, JSON.stringify({
      couvre: e.couvre,
      n: e.packsNecessaires,
    }));
  verifier('4.b : pas de remise quand un seul pack ne suffit pas', e.remiseXof === 0);
  verifier('4.b : message « Un seul pack ne suffit pas »',
    norm(e.message).includes('Un seul pack ne suffit pas'), e.message);

  // 4.c Aucun pack disponible.
  const f = calculerComplement(600000, { quotaRestant: 100, credits: 0 }, packs.slice(0, 0));
  verifier('4.c : aucun pack → pack null, nécessite = true',
    f.pack === null && f.necessaire === true);
  verifier('4.c : message « aucun pack de crédits n’est disponible »',
    norm(f.message).includes('aucun pack de crédits'), f.message);

  // 4.d Taille de livre inconnue (0).
  const g = calculerComplement(0, { quotaRestant: 0, credits: 0 }, packs);
  verifier('4.d : taille inconnue → pas de proposition',
    g.necessaire === false && g.pack === null);
  verifier('4.d : message dédié',
    norm(g.message).includes('Taille du livre inconnue'), g.message);

  // 4.e Déficit exactement égal au pack : prorata = prix plein, pas de remise.
  const h = calculerComplement(250000, { quotaRestant: 0, credits: 0 }, packs);
  verifier('4.e : déficit = pack entier → prorata = plein (500 F), remise 0',
    h.prixProrataXof === 500 && h.remiseXof === 0 && h.remisePourcent === 0);

  // 4.f Le prorata ne dépasse JAMAIS le prix plein (borne).
  const candidats = [1, 999, 10000, 100000, 249999, 250000];
  verifier(
    '4.f : prorata ≤ prix plein sur tout déficit du Pack Découverte',
    candidats.every((déficit) => {
      const r = calculerComplement(déficit, { quotaRestant: 0, credits: 0 }, packs);
      return r.prixProrataXof <= r.prixPleinXof;
    })
  );

  // ----------------------------------------------------------
  console.log(
    `\n${echecs === 0 ? '✓ TOUS LES TESTS PASSENT' : `✗ ${echecs} ÉCHEC(S)`} ` +
      `— packs réels : ${packs.map((p) => `${libelleCaracteres(p.caracteres ?? 0)}/${p.prixXof}F`).join(', ')}`
  );
  process.exit(echecs === 0 ? 0 : 1);
}

principal();
