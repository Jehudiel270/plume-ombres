// ============================================================
// Tests réels — P0.9 (abonnement Premium et paiement FedaPay).
// Usage : npx tsx scripts/test-abonnement-paiement.ts
//
// AUCUNE clé ni compte réel requis : tout se prouve en mémoire.
//
//   A. Tunnel de bout en bout en SIMULATION : trace → paiement →
//      webhook → abonnement actif → QUOTA PREMIUM APPLIQUÉ.
//   B. Échec : le statut d'abonnement reste INCHANGÉ.
//   C. Idempotence (webhook rejoué) et intégrité du montant.
//   D. FedaPay : signature HMAC, normalisation des statuts, extraction
//      d'événement — et RÈGLE « ne jamais croire le corps » (le statut
//      du webhook est revérifié via l'API).
//   E. Migration : présence des tables/fonctions clés, dont
//      attribuer_abonnement / revoquer_abonnement (rôle admin).
// ============================================================

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  QUOTA_PREMIUM_CARACTERES,
  quotaPourPlan,
  planParCode,
  statutEffectif,
} from '../lib/abonnement';
import {
  FedaPayFournisseur,
  normaliserStatutFedapay,
} from '../lib/paiement/fedapay';
import { SimulationFournisseur, normaliserSimulation } from '../lib/paiement/simulation';
import type { FournisseurPaiement } from '../lib/paiement/fournisseur';
import {
  MagasinAbonnementMemoire,
  MagasinPaiementMemoire,
} from '../lib/paiement/magasin';
import {
  initierPaiement,
  traiterEvenement,
  traiterWebhook,
  type ContextePaiement,
} from '../lib/paiement/service';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

const QUOTA_BASE = 500_000;

function contexte(fournisseur: FournisseurPaiement): ContextePaiement {
  return {
    magasinPaiement: new MagasinPaiementMemoire(),
    magasinAbonnement: new MagasinAbonnementMemoire(),
    fournisseur,
    baseUrl: 'https://plume.exemple',
  };
}

// ------------------------------------------------------------
// A. Tunnel simulation bout-en-bout + quota Premium
// ------------------------------------------------------------
async function partieA() {
  console.log('\n— A. Tunnel simulation bout-en-bout —');
  const ctx = contexte(new SimulationFournisseur('https://plume.exemple'));
  const plan = planParCode('premium_mensuel')!;

  // Quota avant : gratuit.
  const quotaAvant = quotaPourPlan(planParCode('gratuit'), QUOTA_BASE);
  verifier(
    'A1 : quota gratuit = plafond de base (pas d’avantage)',
    quotaAvant === QUOTA_BASE,
    String(quotaAvant)
  );

  const init = await initierPaiement(ctx, {
    proprietaireId: 'compte-1',
    plan: 'premium_mensuel',
    telephone: '+22990000000',
  });
  verifier(
    'A2 : TRACER AVANT D’APPELER — la trace existe en en_attente',
    init.paiement.statut === 'en_attente' &&
      init.paiement.reference.startsWith('PLU-') &&
      (await ctx.magasinPaiement.lire(init.paiement.reference)) !== null,
    init.paiement.reference
  );
  verifier(
    'A3 : URL de guichet pointée vers la page locale simulée',
    init.url.includes('/paiement/simulation?reference='),
    init.url
  );
  verifier(
    'A4 : aucun abonnement avant confirmation',
    statutEffectif(await ctx.magasinAbonnement.lire('compte-1')) === 'inactif'
  );

  // Webhook simulé « réussi ».
  const res = await traiterEvenement(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: plan.prixXof,
  });
  verifier(
    'A5 : paiement marqué réussi, abonnement activé',
    res.paiement?.statut === 'reussi' &&
      res.abonnement?.statut === 'actif' &&
      res.applique === true,
    JSON.stringify({ p: res.paiement?.statut, a: res.abonnement?.statut })
  );
  const abonnement = await ctx.magasinAbonnement.lire('compte-1');
  verifier(
    'A6 : abonnement premium actif, période renseignée',
    statutEffectif(abonnement) === 'actif' &&
      !!abonnement?.periode_debut &&
      !!abonnement?.periode_fin,
    JSON.stringify(abonnement)
  );

  // Quota Premium APPLIQUÉ.
  const quotaApresPremium = quotaPourPlan(plan, QUOTA_BASE);
  verifier(
    'A7 : QUOTA PREMIUM APPLIQUÉ (plafond élargi)',
    quotaApresPremium === QUOTA_PREMIUM_CARACTERES &&
      quotaApresPremium > QUOTA_BASE,
    String(quotaApresPremium)
  );

  // Historisation.
  const histo = await ctx.magasinAbonnement.listerHistorique('compte-1');
  verifier(
    'A8 : historisation présente (activation)',
    histo.length === 1 && histo[0].statut === 'actif',
    JSON.stringify(histo)
  );

  // Idempotence : webhook rejoué.
  const rejoue = await traiterEvenement(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: plan.prixXof,
  });
  const histoApres = await ctx.magasinAbonnement.listerHistorique('compte-1');
  verifier(
    'A9 : webhook rejoué = idempotent (aucune double activation)',
    rejoue.dejaTraite === true && rejoue.applique === false && histoApres.length === 1
  );
}

// ------------------------------------------------------------
// B. Échec : statut inchangé
// ------------------------------------------------------------
async function partieB() {
  console.log('\n— B. Échec — abonnement inchangé —');
  const ctx = contexte(new SimulationFournisseur('https://plume.exemple'));

  const init = await initierPaiement(ctx, {
    proprietaireId: 'compte-2',
    plan: 'premium_mensuel',
    telephone: '22990000001',
  });
  const res = await traiterEvenement(ctx, {
    referenceInterne: init.paiement.reference,
    statut: 'echoue',
  });
  verifier(
    'B1 : paiement marqué échoué',
    res.paiement?.statut === 'echoue',
    String(res.paiement?.statut)
  );
  verifier(
    'B2 : statut d’abonnement INCHANGÉ (toujours inactif)',
    statutEffectif(await ctx.magasinAbonnement.lire('compte-2')) === 'inactif'
  );

  // Échec sur un compte DÉJÀ premium : l'abonnement reste actif.
  const ctx3 = contexte(new SimulationFournisseur('https://plume.exemple'));
  const ok = await initierPaiement(ctx3, {
    proprietaireId: 'compte-3',
    plan: 'premium_mensuel',
    telephone: '22990000002',
  });
  await traiterEvenement(ctx3, {
    referenceInterne: ok.paiement.reference,
    statut: 'reussi',
    montant: 3000,
  });
  const echecSuivant = await initierPaiement(ctx3, {
    proprietaireId: 'compte-3',
    plan: 'premium_annuel',
    telephone: '22990000002',
  });
  await traiterEvenement(ctx3, {
    referenceInterne: echecSuivant.paiement.reference,
    statut: 'echoue',
  });
  verifier(
    'B3 : un échec ne révoque pas un abonnement déjà actif',
    statutEffectif(await ctx3.magasinAbonnement.lire('compte-3')) === 'actif'
  );
}

// ------------------------------------------------------------
// C. Intégrité du montant
// ------------------------------------------------------------
async function partieC() {
  console.log('\n— C. Intégrité du montant —');
  const ctx = contexte(new SimulationFournisseur('https://plume.exemple'));
  const init = await initierPaiement(ctx, {
    proprietaireId: 'compte-4',
    plan: 'premium_mensuel',
    telephone: '22990000003',
  });
  let refuse = false;
  try {
    await traiterEvenement(ctx, {
      referenceInterne: init.paiement.reference,
      statut: 'reussi',
      montant: 1, // montant trop faible
    });
  } catch {
    refuse = true;
  }
  verifier(
    'C1 : montant incohérent REFUSÉ (pas d’activation)',
    refuse && statutEffectif(await ctx.magasinAbonnement.lire('compte-4')) === 'inactif'
  );
}

// ------------------------------------------------------------
// D. FedaPay : signature, statuts, « ne pas croire le corps »
// ------------------------------------------------------------
async function partieD() {
  console.log('\n— D. FedaPay —');

  verifier(
    'D1 : normalisation des statuts FedaPay',
    normaliserStatutFedapay('approved') === 'reussi' &&
      normaliserStatutFedapay('declined') === 'echoue' &&
      normaliserStatutFedapay('canceled') === 'echoue' &&
      normaliserStatutFedapay('pending') === 'en_attente' &&
      normaliserStatutFedapay('created') === 'en_attente',
    'approved/declined/canceled/pending'
  );
  verifier(
    'D2 : normalisation simulation',
    normaliserSimulation('reussi') === 'reussi' &&
      normaliserSimulation('echoue') === 'echoue'
  );

  // Signature HMAC.
  process.env.FEDAPAY_WEBHOOK_SECRET = 'secret-de-test';
  const feda = new FedaPayFournisseur();
  const corps = { name: 'transaction.approved', entity: { id: 4242, status: 'approved' } };
  const brut = JSON.stringify(corps);
  const attendu = createHmac('sha256', 'secret-de-test').update(brut, 'utf8').digest('hex');
  const entetesOk = { get: (n: string) => (n.toLowerCase() === 'x-fedapay-signature' ? attendu : null) };
  const entetesFaux = { get: (n: string) => (n.toLowerCase() === 'x-fedapay-signature' ? 'deadbeef' : null) };
  const entetesAbsent = { get: () => null };

  verifier('D3 : signature HMAC valide acceptée', feda.verifierSignature(brut, entetesOk));
  verifier('D4 : signature invalide rejetée', !feda.verifierSignature(brut, entetesFaux));
  verifier('D5 : signature absente rejetée', !feda.verifierSignature(brut, entetesAbsent));

  const ev = feda.extraireEvenement(corps);
  verifier(
    'D6 : extraction de l’événement (id fournisseur + statut indicatif)',
    ev?.referenceFournisseur === '4242' && ev?.statut === 'reussi',
    JSON.stringify(ev)
  );
  verifier('D7 : FedaPay non configuré sans clé', !feda.estConfigure());

  // RÈGLE : le corps ne fait pas foi — le statut est revérifié via l'API.
  const fauxFeda: FournisseurPaiement = {
    id: 'faux',
    nom: 'Faux',
    mode: 'sandbox',
    estConfigure: () => true,
    creerPaiement: async () => ({ url: 'https://x', referenceFournisseur: '999', fournisseur: 'faux' }),
    verifierPaiement: async () => ({ statut: 'echoue', montant: 3000 }), // l'API dit échoué
    verifierSignature: () => true,
    extraireEvenement: (c) => ({
      referenceInterne: (c as { ref?: string }).ref ?? null,
      referenceFournisseur: '999',
      statut: 'reussi', // le CORPS prétend réussi
    }),
  };
  const ctxD = contexte(fauxFeda);
  const initD = await initierPaiement(ctxD, {
    proprietaireId: 'compte-5',
    plan: 'premium_mensuel',
    telephone: '22990000004',
  });
  const resD = await traiterWebhook(ctxD, {
    referenceInterne: initD.paiement.reference,
    referenceFournisseur: '999',
    statut: 'reussi',
  });
  verifier(
    'D8 : le corps « réussi » est ANNULÉ par la revérification API (échoué)',
    resD.paiement?.statut === 'echoue' &&
      statutEffectif(await ctxD.magasinAbonnement.lire('compte-5')) === 'inactif',
    JSON.stringify({ statut: resD.paiement?.statut })
  );

  // Et l'inverse : l'API confirme → activation.
  const vraiFeda: FournisseurPaiement = {
    ...fauxFeda,
    verifierPaiement: async () => ({ statut: 'reussi', montant: 3000 }),
  };
  const ctxD2 = contexte(vraiFeda);
  const initD2 = await initierPaiement(ctxD2, {
    proprietaireId: 'compte-6',
    plan: 'premium_mensuel',
    telephone: '22990000005',
  });
  const resD2 = await traiterWebhook(ctxD2, {
    referenceInterne: initD2.paiement.reference,
    referenceFournisseur: '999',
    statut: 'en_attente', // le corps ne dit rien d'utile
  });
  verifier(
    'D9 : la revérification API « réussi » ACTIVE l’abonnement',
    resD2.applique === true &&
      statutEffectif(await ctxD2.magasinAbonnement.lire('compte-6')) === 'actif'
  );
}

// ------------------------------------------------------------
// E. Migration : tables/fonctions clés présentes
// ------------------------------------------------------------
function partieE() {
  console.log('\n— E. Migration SQL —');
  let sql = '';
  try {
    sql = readFileSync(
      'supabase/migrations/20261003000001_abonnement_premium.sql',
      'utf8'
    );
  } catch (e) {
    verifier('E : migration lisible', false, (e as Error).message);
    return;
  }
  const attendus = [
    'public.plans_abonnement',
    'public.abonnements',
    'public.abonnements_historique',
    'public.paiements',
    'public.administrateurs',
    'public.est_admin',
    'public.activer_abonnement',
    'public.resilier_abonnement',
    'public.attribuer_abonnement',
    'public.revoquer_abonnement',
    'public.limite_abonnement',
  ];
  for (const a of attendus) {
    verifier(`E : ${a} déclaré`, sql.includes(a));
  }
  verifier(
    'E : attribuer/revoquer exigent le rôle admin (est_admin)',
    /attribuer_abonnement[\s\S]*?est_admin/.test(sql) &&
      /revoquer_abonnement[\s\S]*?est_admin/.test(sql)
  );
  verifier(
    'E : reserver_quota rendue premium-aware (limite_abonnement)',
    /reserver_quota[\s\S]*?limite_abonnement\(p_proprietaire, p_limite\)/.test(sql)
  );
  verifier(
    'E : statut de paiement normalisé (3 valeurs)',
    sql.includes("('en_attente','reussi','echoue')")
  );
}

async function principal() {
  await partieA();
  await partieB();
  await partieC();
  await partieD();
  partieE();

  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`}`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
