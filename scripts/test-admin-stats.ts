// ============================================================
// scripts/test-admin-stats.ts — Test exécutable des AJOUTS du panneau admin
// (vague W8/W9) : agrégations, anomalies, CSV, normalisateurs.
//   Usage : npx tsx scripts/test-admin-stats.ts
// Aucune dépendance réseau : on exerce le VRAI code de lib/admin-stats.ts
// avec des charges utiles figées (le contrat des RPC).
// ============================================================

import {
  normaliserPlans,
  nomPlan,
  normaliserCourriels,
  normaliserPaiements,
  normaliserStatsAbonnements,
  normaliserActions,
  detecterAnomalies,
  comptesEnAnomalie,
  echapperCsv,
  versCsv,
  formaterMontant,
  formaterNombre,
  abonnementActif,
  type CompteAdmin,
  type StatsAbonnementsAdmin,
} from '../lib/admin-stats';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ------------------------------------------------------------
// 1. Catalogue des plans
// ------------------------------------------------------------
const plans = normaliserPlans([
  { code: 'essai', nom: 'Essai gratuit — 7 jours' },
  { code: 'lecteur_mensuel', nom: 'Lecteur — mensuel' },
  { code: 'ordure', nom: 42 },
  null,
]);
verifier(
  'plans : lignes valides conservées, entrées illisibles écartées',
  plans.length === 3 && plans[2].nom === 'ordure'
);
verifier('nomPlan : code connu → nom du catalogue', nomPlan('essai', plans) === 'Essai gratuit — 7 jours');
verifier('nomPlan : code inconnu → le code', nomPlan('xyz', plans) === 'xyz');
verifier('nomPlan : vide → tiret', nomPlan(null, plans) === '—');

// ------------------------------------------------------------
// 2. Courriels
// ------------------------------------------------------------
const courriels = normaliserCourriels([
  { id: 'a', courriel: 'a@x.test' },
  { id: 'b' },
  { courriel: 'orphelin@x.test' },
]);
verifier('courriels : seule la paire (id, courriel) est retenue', courriels.a === 'a@x.test' && Object.keys(courriels).length === 1);

// ------------------------------------------------------------
// 3. Agrégats abonnements / crédits / paiements
// ------------------------------------------------------------
const charge = {
  abonnements_total: 10,
  abonnements_actifs: 7,
  abonnements_expires_non_resilies: 2,
  par_plan: [
    { plan: 'essai', nom: 'Essai gratuit', actifs: 4, expires: 1, autres: 0, total: 5 },
    { plan: 'lecteur_mensuel', nom: 'Lecteur', actifs: 3, expires: 1, autres: 1, total: 5 },
  ],
  par_statut: [{ statut: 'actif', total: 8 }, { statut: 'resilie', total: 2 }],
  abonnements_par_mois: [{ periode: '2026-09', total: 6 }, { periode: '2026-10', total: 4 }],
  credits: {
    comptes_avec_solde: 3,
    solde_total: 1250000,
    vendus_total: 4000000,
    consommes_total: 250000,
    montant_vendu: 9000,
    packs_vendus: 5,
    par_pack: [{ pack: 'credits_250', nom: 'Pack Découverte', quantite: 3, caracteres: 750000, montant: 1500 }],
  },
  paiements: {
    total: 12,
    montant_reussi: 42000,
    dernier: '2026-10-06T10:00:00.000Z',
    par_statut: [{ statut: 'reussi', total: 9, montant: 42000 }, { statut: 'echoue', total: 3, montant: 9000 }],
    par_fournisseur: [{ fournisseur: 'fedapay', total: 12 }],
  },
};
const agr: StatsAbonnementsAdmin | null = normaliserStatsAbonnements(charge);
verifier('agrégats : objet non nul', agr !== null);
verifier('agrégats : totaux abonnements', agr!.abonnementsTotal === 10 && agr!.abonnementsActifs === 7 && agr!.abonnementsExpiresNonResilies === 2);
verifier('agrégats : répartition par plan conservée', agr!.parPlan.length === 2 && agr!.parPlan[0].actifs === 4);
verifier('agrégats : crédits (vendus/consommés/solde)', agr!.credits.vendusTotal === 4000000 && agr!.credits.consommesTotal === 250000 && agr!.credits.soldeTotal === 1250000);
verifier('agrégats : paiements par statut (montants)', agr!.paiements.parStatut[0].montant === 42000);
verifier('agrégats : JSON hostile toléré', normaliserStatsAbonnements({ par_plan: 'nope', credits: 3 })!.parPlan.length === 0);

// ------------------------------------------------------------
// 4. Journal des paiements
// ------------------------------------------------------------
const paiements = normaliserPaiements([
  { reference: 'PLU-1', pseudo: 'Miaou', plan: 'essai', montant: 1000, devise: 'XOF', statut: 'reussi', fournisseur: 'fedapay', operateur: 'orange', reference_fournisseur: 'fp_1', cree_le: '2026-10-06T10:00:00Z' },
  { reference: 'PLU-2', montant: '500' },
  { pseudo: 'sans reference' },
]);
verifier('paiements : 2 lignes valides', paiements.length === 2);
verifier('paiements : montant texte → nombre', paiements[1].montant === 500);
verifier('paiements : valeurs par défaut prudentes', paiements[1].statut === 'en_attente' && paiements[1].pseudo === 'lecteur');

// ------------------------------------------------------------
// 5. Journal des actions admin
// ------------------------------------------------------------
const actions = normaliserActions([
  { id: 7, admin_id: 'adm', cible_id: 'usr', action: 'attribuer', duree: '1 mois', periode_fin: '2026-11-06T00:00:00Z', motif: 'support', cree_le: '2026-10-06T09:00:00Z' },
  { id: '8', admin_id: 'adm', cible_id: 'usr2', action: 'revoquer' },
  { cible_id: 'orphelin' },
]);
verifier('actions : identifiants numériques et textuels acceptés', actions.length === 2 && actions[1].id === 8);
verifier('actions : champs optionnels null', actions[1].duree === null && actions[1].periodeFin === null);

// ------------------------------------------------------------
// 6. Anomalies
// ------------------------------------------------------------
const base: CompteAdmin = {
  id: 'u1', pseudo: 'p', role: 'utilisateur', creeLe: null,
  abonnementStatut: null, abonnementPlan: null, abonnementFin: null,
};
const maintenant = new Date('2026-10-06T12:00:00Z');
const expire = { ...base, abonnementStatut: 'actif', abonnementPlan: 'essai', abonnementFin: '2026-10-01T00:00:00Z' };
const sansFin = { ...base, abonnementStatut: 'actif', abonnementPlan: 'essai', abonnementFin: null };
const planMort = { ...base, abonnementStatut: 'resilie', abonnementPlan: 'formule_disparue', abonnementFin: null };
const sain = { ...base, abonnementStatut: 'actif', abonnementPlan: 'essai', abonnementFin: '2026-12-01T00:00:00Z' };

verifier('anomalie : abonnement expiré mais « actif »', detecterAnomalies(expire, plans, maintenant).includes('abonnement_expire_non_resilie'));
verifier('anomalie : actif sans date de fin', detecterAnomalies(sansFin, plans, maintenant).includes('abonnement_sans_fin'));
verifier('anomalie : plan hors catalogue', detecterAnomalies(planMort, plans, maintenant).includes('plan_inconnu'));
verifier('anomalie : compte sain → aucune', detecterAnomalies(sain, plans, maintenant).length === 0);
verifier('anomalie : liste filtrée', comptesEnAnomalie([expire, sain, sansFin], plans, maintenant).length === 2);
verifier('abonnementActif : expiration passée → faux', abonnementActif(expire, maintenant) === false && abonnementActif(sain, maintenant) === true);

// ------------------------------------------------------------
// 7. CSV
// ------------------------------------------------------------
verifier('csv : séparateur présent dans la cellule → guillemets', echapperCsv('a;b') === '"a;b"');
verifier('csv : guillemet doublé', echapperCsv('il a "dit"') === '"il a ""dit"""');
verifier('csv : saut de ligne protégé', echapperCsv('l1\nl2') === '"l1\nl2"');
verifier('csv : cellule simple non modifiée', echapperCsv('simple') === 'simple' && echapperCsv(null) === '');

const csv = versCsv(
  [{ cle: 'pseudo', libelle: 'Pseudo' }, { cle: 'role', libelle: 'Rôle' }],
  [{ pseudo: 'Miaou', role: 'admin' }, { pseudo: 'a;b', role: 'utilisateur' }]
);
const lignesCsv = csv.split('\r\n');
verifier('csv : en-tête + 2 lignes, CRLF', lignesCsv.length === 3);
verifier('csv : en-tête exact', lignesCsv[0] === 'Pseudo;Rôle');
verifier('csv : échappement dans le corps', lignesCsv[2] === '"a;b";utilisateur');

// ------------------------------------------------------------
// 8. Formatage
// ------------------------------------------------------------
verifier('montant : XOF → F CFA', formaterMontant(1250000) === `${formaterNombre(1250000)} F CFA`);
verifier('montant : devise autre littérale', formaterMontant(100, 'EUR') === '100 EUR');

console.log(`\n${echecs === 0 ? 'TOUT PASSE' : `${echecs} ÉCHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
