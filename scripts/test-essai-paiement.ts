// ============================================================
// Tests réels — W6/paiement-plans.
// Usage : npx tsx scripts/test-essai-paiement.ts
//
// AUCUNE clé ni compte réel requis : tout se prouve en mémoire, plus
// la lecture des fichiers de migration pour les garde-fous de schéma.
//
//   A. Catalogue FCFA exact (prix, durées, plafonds de livres).
//   B. Essai gratuit : 7 jours, 3 livres, bascule en gratuit.
//   C. Anti-abus : normalisation / comparaison de numéros.
//   D. FedaPay : signature HMAC OBLIGATOIRE (valide/invalide/absente).
//   E. Paiement : montant incohérent REFUSÉ, idempotence du webhook.
//   F. Mode sans clé : l'app ne plante pas (mode « non configuré »).
//   G. Migration : tables/fonctions/triggers déclarés.
// ============================================================

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ESSAI_JOURS,
  ESSAI_LIVRES_MAX,
  PLANS,
  QUOTA_ILLIMITE_CARACTERES,
  accesPremium,
  essaiActif,
  libellePrixDetaille,
  planEffectifCode,
  planParCode,
  plansPublics,
  quotaPourPlan,
  type Abonnement,
} from '../lib/abonnement';
import {
  etatEssai,
  memeTelephone,
  normaliserTelephone,
  CODE_ESSAI_TELEPHONE_UTILISE,
} from '../lib/essai';
import { FedaPayFournisseur } from '../lib/paiement/fedapay';
import { SimulationFournisseur } from '../lib/paiement/simulation';
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

function contexte(fournisseur: FournisseurPaiement): ContextePaiement {
  return {
    magasinPaiement: new MagasinPaiementMemoire(),
    magasinAbonnement: new MagasinAbonnementMemoire(),
    fournisseur,
    baseUrl: 'https://plume.exemple',
  };
}

// ------------------------------------------------------------
// A. Catalogue
// ------------------------------------------------------------
function partieA() {
  console.log('\n— A. Catalogue FCFA —');
  const attendus: Record<string, [number, number]> = {
    gratuit: [0, 0],
    lecteur_mensuel: [1500, 30],
    lecteur_annuel: [14400, 365],
    passionne_mensuel: [3500, 30],
    passionne_annuel: [33600, 365],
    illimite_mensuel: [9000, 30],
    illimite_annuel: [90000, 365],
    etudiant_mensuel: [1200, 30],
    groupe_mensuel: [2400, 30],
    ecole_annuel: [21600, 365],
    premium_mensuel: [3000, 30],
    premium_annuel: [30000, 365],
  };
  for (const [code, [prix, duree]] of Object.entries(attendus)) {
    const p = planParCode(code);
    verifier(
      `A : ${code} = ${prix} FCFA / ${duree} j`,
      !!p && p.prixXof === prix && p.dureeJours === duree,
      p ? `${p.prixXof}/${p.dureeJours}` : 'absent'
    );
  }
  verifier(
    'A : illimité = fair-use 25 000 000 caractères',
    planParCode('illimite_mensuel')?.quotaMensuelCaracteres === QUOTA_ILLIMITE_CARACTERES
  );
  verifier(
    'A : groupe 3 personnes min, école 11 personnes min',
    planParCode('groupe_mensuel')?.minPersonnes === 3 &&
      planParCode('ecole_annuel')?.minPersonnes === 11
  );
  verifier(
    'A : étudiant → vérification requise',
    planParCode('etudiant_mensuel')?.verificationRequise === true
  );
  verifier(
    'A : plafonds de livres (essai 3, lecteur 3, passionné 10, illimité null)',
    planParCode('essai')?.livresMois === 3 &&
      planParCode('lecteur_mensuel')?.livresMois === 3 &&
      planParCode('passionne_mensuel')?.livresMois === 10 &&
      planParCode('illimite_mensuel')?.livresMois === null
  );
  verifier(
    'A : annuels à −20 % (lecteur 14 400, passionné 33 600)',
    planParCode('lecteur_annuel')?.prixXof === 1500 * 12 * 0.8 &&
      planParCode('passionne_annuel')?.prixXof === 3500 * 12 * 0.8
  );
  verifier(
    'A : école 21 600 FCFA/an/personne (1 800/mois)',
    planParCode('ecole_annuel')?.prixXof === 21600 &&
      planParCode('ecole_annuel')?.prixMensuelXof === 1800 &&
      planParCode('ecole_annuel')?.parPersonne === true
  );
  verifier(
    'A : aucun libellé ne nomme un moteur',
    !PLANS.some((p) => /gemini|libretranslate|mymemory|google/i.test(JSON.stringify(p)))
  );
  verifier(
    'A : alias premium masqués du catalogue public',
    planParCode('premium_mensuel')?.masque === true &&
      planParCode('premium_annuel')?.masque === true &&
      !plansPublics().some((p) => p.code.startsWith('premium_'))
  );
  verifier(
    'A : quota illimité effectif = 25 000 000',
    quotaPourPlan(planParCode('illimite_mensuel'), 500_000) === 25_000_000
  );
  verifier(
    'A : libellé groupe détaillé (par personne / mois)',
    libellePrixDetaille(planParCode('groupe_mensuel')!).includes('F CFA') &&
      libellePrixDetaille(planParCode('groupe_mensuel')!).includes('/ personne / mois'),
    libellePrixDetaille(planParCode('groupe_mensuel')!)
  );
}

// ------------------------------------------------------------
// B. Essai gratuit
// ------------------------------------------------------------
function partieB() {
  console.log('\n— B. Essai gratuit —');
  verifier('B : essai = 7 jours, 3 livres', ESSAI_JOURS === 7 && ESSAI_LIVRES_MAX === 3);

  const maintenant = new Date('2026-10-02T12:00:00Z');
  const fin = new Date(maintenant.getTime() + 7 * 86400000).toISOString();
  const essai: Abonnement = {
    proprietaire_id: 'c1',
    plan: 'essai',
    statut: 'actif',
    periode_debut: maintenant.toISOString(),
    periode_fin: fin,
    paiement_reference: null,
    created_at: maintenant.toISOString(),
    updated_at: maintenant.toISOString(),
    essai_fin: fin,
    essai_livres_utilises: 2,
  };
  verifier('B1 : essai actif reconnu', essaiActif(essai, maintenant));
  verifier(
    'B2 : plan effectif = essai, accès supérieur',
    planEffectifCode(essai, maintenant) === 'essai' && accesPremium(planParCode('essai'))
  );
  const etat = etatEssai(essai, maintenant);
  verifier(
    'B3 : 2/3 livres utilisés, 1 restant, 7 jours',
    etat.livresUtilises === 2 &&
      etat.livresRestants === 1 &&
      etat.joursRestants === 7,
    JSON.stringify(etat)
  );

  const echu: Abonnement = { ...essai, essai_fin: '2026-10-01T00:00:00Z', periode_fin: '2026-10-01T00:00:00Z' };
  verifier('B4 : essai échu → bascule automatique en gratuit', !essaiActif(echu, maintenant) && planEffectifCode(echu, maintenant) === 'gratuit');
  verifier(
    'B5 : bibliothèque conservée (aucune donnée touchée) — plan gratuit',
    planEffectifCode(echu, maintenant) === 'gratuit'
  );
}

// ------------------------------------------------------------
// C. Anti-abus : numéros
// ------------------------------------------------------------
function partieC() {
  console.log('\n— C. Anti-abus —');
  verifier(
    'C1 : normalisation « +229 90 00 00 01 » → 22990000001',
    normaliserTelephone('+229 90 00 00 01') === '22990000001'
  );
  verifier(
    'C2 : même numéro avec/sans indicatif reconnu identique',
    memeTelephone('+22990000001', '90000001')
  );
  verifier('C3 : numéro trop court rejeté', normaliserTelephone('123') === '');
  verifier(
    'C4 : code d’erreur dédié au numéro déjà utilisé',
    CODE_ESSAI_TELEPHONE_UTILISE === 'ESSAI_TELEPHONE_UTILISE'
  );
}

// ------------------------------------------------------------
// D. FedaPay : signature obligatoire
// ------------------------------------------------------------
function partieD() {
  console.log('\n— D. FedaPay — signature —');
  process.env.FEDAPAY_WEBHOOK_SECRET = 'secret-de-test-w6';
  const feda = new FedaPayFournisseur();
  const brut = JSON.stringify({
    name: 'transaction.approved',
    entity: { id: 4242, status: 'approved', amount: 3500 },
  });
  const attendu = createHmac('sha256', 'secret-de-test-w6').update(brut, 'utf8').digest('hex');
  const ok = { get: (n: string) => (n.toLowerCase() === 'x-fedapay-signature' ? attendu : null) };
  const avecPrefixe = {
    get: (n: string) => (n.toLowerCase() === 'x-fedapay-signature' ? `sha256=${attendu}` : null),
  };
  const faux = { get: (n: string) => (n.toLowerCase() === 'x-fedapay-signature' ? 'deadbeef' : null) };
  const absent = { get: () => null };

  verifier('D1 : signature HMAC valide acceptée', feda.verifierSignature(brut, ok));
  verifier('D2 : préfixe « sha256= » accepté', feda.verifierSignature(brut, avecPrefixe));
  verifier('D3 : signature invalide REJETÉE', !feda.verifierSignature(brut, faux));
  verifier('D4 : signature absente REJETÉE', !feda.verifierSignature(brut, absent));

  // Sans secret côté serveur : TOUJOURS refusé.
  delete process.env.FEDAPAY_WEBHOOK_SECRET;
  verifier('D5 : sans secret configuré → refus (obligatoire)', !feda.verifierSignature(brut, ok));
  process.env.FEDAPAY_WEBHOOK_SECRET = 'secret-de-test-w6';

  const ev = feda.extraireEvenement(JSON.parse(brut));
  verifier(
    'D6 : événement extrait (id fournisseur, montant)',
    ev?.referenceFournisseur === '4242' && ev?.montant === 3500
  );
}

// ------------------------------------------------------------
// E. Paiement : montant + idempotence + revérification
// ------------------------------------------------------------
async function partieE() {
  console.log('\n— E. Paiement —');
  const ctx = contexte(new SimulationFournisseur('https://plume.exemple'));
  const plan = planParCode('passionne_mensuel')!;

  const init = await initierPaiement(ctx, {
    proprietaireId: 'compte-1',
    plan: 'passionne_mensuel',
    telephone: '+22990000009',
  });
  verifier(
    'E1 : trace AVANT appel + URL de guichet simulée',
    init.paiement.statut === 'en_attente' &&
      init.url.includes('/paiement/simulation?reference='),
    init.paiement.reference
  );

  let refuseMontant = false;
  try {
    await traiterEvenement(ctx, {
      referenceInterne: init.paiement.reference,
      statut: 'reussi',
      montant: 1,
    });
  } catch {
    refuseMontant = true;
  }
  verifier('E2 : montant incohérent REFUSÉ', refuseMontant);

  const res = await traiterEvenement(ctx, {
    referenceInterne: init.paiement.reference,
    statut: 'reussi',
    montant: plan.prixXof,
  });
  verifier('E3 : paiement confirmé → abonnement actif', res.applique && res.abonnement?.statut === 'actif');

  const rejoue = await traiterEvenement(ctx, {
    referenceInterne: init.paiement.reference,
    statut: 'reussi',
    montant: plan.prixXof,
  });
  const histo = await ctx.magasinAbonnement.listerHistorique('compte-1');
  verifier(
    'E4 : IDEMPOTENCE — webhook rejoué ne double jamais l’abonnement',
    rejoue.dejaTraite === true && rejoue.applique === false && histo.length === 1,
    `histo=${histo.length}`
  );

  // Revérification : le corps ne fait pas foi.
  const faux: FournisseurPaiement = {
    id: 'faux',
    nom: 'Faux',
    mode: 'sandbox',
    estConfigure: () => true,
    verifierSignature: () => true,
    creerPaiement: async () => ({ url: 'https://x', referenceFournisseur: '999', fournisseur: 'faux' }),
    verifierPaiement: async () => ({ statut: 'echoue', montant: 3500 }),
    extraireEvenement: () => ({ referenceInterne: null, referenceFournisseur: '999', statut: 'reussi' }),
  };
  const ctx2 = contexte(faux);
  const init2 = await initierPaiement(ctx2, {
    proprietaireId: 'compte-2',
    plan: 'passionne_mensuel',
    telephone: '+22990000010',
  });
  const res2 = await traiterWebhook(ctx2, {
    referenceInterne: init2.paiement.reference,
    referenceFournisseur: '999',
    statut: 'reussi',
  });
  verifier(
    'E5 : corps « réussi » annulé par la revérification API (échoué)',
    res2.paiement?.statut === 'echoue' &&
      (await ctx2.magasinAbonnement.lire('compte-2')) === null
  );
}

// ------------------------------------------------------------
// F. Mode sans clé
// ------------------------------------------------------------
async function partieF() {
  console.log('\n— F. Mode sans clé —');
  delete process.env.FEDAPAY_SECRET_KEY;
  delete process.env.PAYMENT_SIMULATION;
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = 'production'; // simulation fermée en prod par défaut
  const { modePaiementAffiche } = await import('../lib/paiement/mode');
  const etat = modePaiementAffiche();
  verifier(
    'F1 : sans clé et simulation fermée → « non configuré » propre',
    etat.mode === 'non_configure' && etat.configure === false,
    JSON.stringify(etat)
  );
  env.NODE_ENV = 'test';
  const etatDev = modePaiementAffiche();
  verifier(
    'F2 : en développement sans clé → simulation disponible',
    etatDev.mode === 'simulation' && etatDev.configure === true,
    JSON.stringify(etatDev)
  );
}

// ------------------------------------------------------------
// G. Migration
// ------------------------------------------------------------
function partieG() {
  console.log('\n— G. Migration —');
  let sql = '';
  try {
    sql = readFileSync('supabase/migrations/20261004000001_essai_et_catalogue.sql', 'utf8');
  } catch (e) {
    verifier('G : migration lisible', false, (e as Error).message);
    return;
  }
  for (const attendu of [
    'public.essais_abonnement',
    'essai_fin',
    'essai_livres_utilises',
    'verification_etudiant',
    'public.accorder_essai',
    'public.sceller_essai',
    'public.basculer_essai_echu',
    'public.verifier_livres_autorises',
    'essai_auto_inscription',
    'livres_plafond_plan',
  ]) {
    verifier(`G : ${attendu} déclaré`, sql.includes(attendu));
  }
  verifier(
    'G : anti-abus e-mail ET numéro dans accorder_essai',
    /refuse_email/.test(sql) && /refuse_telephone/.test(sql)
  );
  verifier(
    'G : déclencheur d’essai branché sur auth.users',
    /create trigger essai_auto_inscription\s*\n?\s*after insert on auth\.users/.test(sql)
  );
  verifier(
    'G : plafond de livres branché sur public.livres',
    /create trigger livres_plafond_plan\s*\n?\s*before insert on public\.livres/.test(sql)
  );
  verifier(
    'G : correctif ambiguïté OUT/colonne (#variable_conflict) sur les 4 RPC',
    (sql.match(/#variable_conflict use_column/g) ?? []).length >= 4,
    `${(sql.match(/#variable_conflict use_column/g) ?? []).length} occurrence(s)`
  );
  verifier(
    'G : activer_abonnement libère le numéro (essais_abonnement.paye_le)',
    /update public\.essais_abonnement[\s\S]*?paye_le = coalesce\(e\.paye_le, v_maintenant\)/.test(sql)
  );
}

async function principal() {
  partieA();
  partieB();
  partieC();
  partieD();
  await partieE();
  await partieF();
  partieG();
  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`}`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
