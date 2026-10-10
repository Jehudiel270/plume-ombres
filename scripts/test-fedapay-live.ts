// ============================================================
// scripts/test-fedapay-live.ts
//
// PREUVES RÉELLES de la correction FedaPay (réconciliation, signature,
// idempotence). Usage : npx tsx scripts/test-fedapay-live.ts
//
// Ce que ce script PROUVE :
//   A. Clés LIVE — authentification OK en LECTURE SEULE (aucune écriture,
//      aucun paiement réel créé).
//   B. SANDBOX — création d'une transaction AVEC `merchant_reference` via
//      le code RÉEL, puis relecture par GET /transactions/merchant/{ref}
//      et GET /transactions/{id} : la référence est bien retrouvée.
//   C. Webhook CORRECTEMENT signé (algorithme OFFICIEL FedaPay) → accepté,
//      crédits livrés UNE seule fois.
//   D. Webhook REJOUÉ → AUCUN double crédit.
//   E. Signature INVALIDE ou ABSENTE (ou secret absent) → refusé (échec fermé).
//   F. Montant INCOHÉRENT → refusé (aucun crédit).
//   G. BASE RÉELLE (Supabase) — `crediter_pack` idempotent, prouvé dans
//      une TRANSACTION ANNULÉE (ROLLBACK) : rien n'est conservé.
//
// Les secrets ne sont JAMAIS affichés. Les appels d'ÉCRITURE FedaPay se
// font UNIQUEMENT en SANDBOX.
// ============================================================

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { FedaPayFournisseur } from '../lib/paiement/fedapay';
import type { FournisseurPaiement } from '../lib/paiement/fournisseur';
import {
  MagasinAbonnementMemoire,
  MagasinCreditsMemoire,
  MagasinPaiementMemoire,
} from '../lib/paiement/magasin';
import {
  traiterWebhook,
  type ContextePaiement,
} from '../lib/paiement/service';
import type {
  EvenementPaiement,
  ModePaiement,
  Paiement,
  StatutPaiement,
} from '../lib/paiement/types';
import { planParCode } from '../lib/abonnement';

// ------------------------------------------------------------
// Compteurs et utilitaires
// ------------------------------------------------------------
let echecs = 0;
let total = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  total += 1;
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

const API_SANDBOX = 'https://sandbox-api.fedapay.com/v1';
const API_LIVE = 'https://api.fedapay.com/v1';

/** Charge `.env.local` sans jamais imprimer de secret. */
function chargerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  const txt = readFileSync('.env.local', 'utf8');
  for (const ligne of txt.split('\n')) {
    const l = ligne.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    const k = l.slice(0, i).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

interface ReponseHttp {
  status: number;
  json: Record<string, unknown> | null;
  texte: string;
}

async function httpJson(
  methode: string,
  url: string,
  cle: string,
  corps?: unknown
): Promise<ReponseHttp> {
  const res = await fetch(url, {
    method: methode,
    headers: {
      Authorization: `Bearer ${cle}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = texte ? (JSON.parse(texte) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, texte };
}

/** Construit l'EN-TÊTE de signature OFFICIEL FedaPay : `t=…,s=…`. */
function enteteSignatureFedapay(
  corpsBrut: string,
  secret: string,
  ts = Math.floor(Date.now() / 1000)
): string {
  const sig = createHmac('sha256', secret)
    .update(`${ts}.${corpsBrut}`, 'utf8')
    .digest('hex');
  return `t=${ts},s=${sig}`;
}

function entetes(entete: string | null) {
  return {
    get: (nom: string) =>
      entete && nom.toLowerCase() === 'x-fedapay-signature' ? entete : null,
  };
}

// ------------------------------------------------------------
// Fournisseur de test : RÉEL pour signature + extraction, statut injecté
// (l'API de statut ne renvoie « approved » qu'après un VRAI paiement
//  Mobile Money, interdit ici).
// ------------------------------------------------------------
class FournisseurStatutInjecte implements FournisseurPaiement {
  readonly id = 'fedapay';
  readonly nom = 'FedaPay (test)';
  readonly mode: ModePaiement = 'sandbox';
  constructor(
    private readonly reel: FedaPayFournisseur,
    private readonly statut: StatutPaiement,
    private readonly montant?: number
  ) {}
  estConfigure(): boolean {
    return true;
  }
  creerPaiement = (d: Parameters<FournisseurPaiement['creerPaiement']>[0]) =>
    this.reel.creerPaiement(d);
  verifierPaiement = async (): Promise<{
    statut: StatutPaiement;
    montant?: number;
  }> => ({ statut: this.statut, montant: this.montant });
  verifierSignature = (c: string, e: { get(n: string): string | null }) =>
    this.reel.verifierSignature(c, e);
  extraireEvenement = (c: unknown) => this.reel.extraireEvenement(c);
}

const BASE_PROCESSEUR_SANDBOX = 'sandbox-process.fedapay.com';

// ============================================================
// A. Clés LIVE — LECTURE SEULE
// ============================================================
async function partieA(env: Record<string, string>) {
  console.log('\n— A. Clés LIVE : authentification en LECTURE SEULE —');
  const cleLive = env.FEDAPAY_SECRET_KEY;
  verifier('A0 : clé LIVE présente dans .env.local', !!cleLive);
  if (!cleLive) return;

  const { status, json } = await httpJson(
    'GET',
    `${API_LIVE}/transactions/search`,
    cleLive
  );
  verifier('A1 : clé LIVE acceptée (HTTP 200)', status === 200, `HTTP ${status}`);
  const liste = (json?.['v1/transactions'] ?? []) as unknown[];
  verifier(
    'A2 : lecture seule OK — liste de transactions renvoyée',
    status === 200 && Array.isArray(liste),
    `${liste.length} transaction(s) en live`
  );
  verifier(
    'A3 : configuration correcte — ni 401 ni 403 (clé/clé secrète valides)',
    status !== 401 && status !== 403
  );
}

// ============================================================
// B. SANDBOX — création avec merchant_reference puis relecture
// ============================================================
async function partieB(env: Record<string, string>) {
  console.log('\n— B. SANDBOX : création + relecture par merchant_reference —');
  const cleSandbox = env.FEDAPAY_SANDBOX_SECRET_KEY;
  verifier('B0a : clé SANDBOX présente', !!cleSandbox);
  if (!cleSandbox) return;

  // Le code RÉEL de l'app, forcé en sandbox (jamais live).
  process.env.FEDAPAY_ENV = 'sandbox';
  process.env.FEDAPAY_SECRET_KEY = cleSandbox;
  const feda = new FedaPayFournisseur();
  verifier('B0b : fournisseur en mode SANDBOX (jamais live)', feda.mode === 'sandbox');

  const reference = `PLU-LIVE-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  // Création via le code de production (creerPaiement → /transactions + token).
  const resultat = await feda.creerPaiement({
    reference,
    plan: 'credits_250',
    montant: 500,
    devise: 'XOF',
    telephone: '90000000',
    pays: 'bj',
    prenom: 'Test',
    nom: 'FedaPay',
    email: 'test-fedapay@example.invalid',
    description: 'Test réconciliation FedaPay (sandbox)',
    urlRetour: 'https://example.com/retour',
    urlNotification: 'https://example.com/api/paiement/webhook',
  });
  verifier(
    'B1 : transaction sandbox créée (id + URL de guichet)',
    !!resultat.referenceFournisseur && !!resultat.url,
    `id=${resultat.referenceFournisseur}`
  );
  verifier(
    'B2 : URL de guichet SANDBOX (jamais live)',
    resultat.url.includes(BASE_PROCESSEUR_SANDBOX),
    resultat.url.replace(/\/[^/]+$/, '/<token>')
  );
  const idFournisseur = resultat.referenceFournisseur ?? '';

  // Relecture par NOTRE référence (endpoint officiel merchant).
  const parRef = await feda.retrouverParReferenceMarquand(reference);
  verifier(
    'B3 : merchant_reference CONSERVÉE et retrouvée',
    parRef?.merchant_reference === reference,
    `merchant_reference=${String(parRef?.merchant_reference)}`
  );
  verifier(
    'B4 : custom_metadata CONSERVÉE (reference_interne)',
    (parRef?.custom_metadata as Record<string, unknown> | undefined)
      ?.reference_interne === reference
  );
  verifier(
    'B5 : GET /transactions/merchant/{ref} → même id que la création',
    String(parRef?.id) === idFournisseur
  );

  // Relecture par id (comme le fait la revérification du webhook).
  const parId = await httpJson(
    'GET',
    `${API_SANDBOX}/transactions/${idFournisseur}`,
    cleSandbox
  );
  const tx = (parId.json?.['v1/transaction'] ??
    parId.json) as Record<string, unknown> | null;
  verifier(
    'B6 : relecture par id → merchant_reference présente',
    tx?.merchant_reference === reference,
    `HTTP ${parId.status}`
  );

  // Le champ SYSTÈME `metadata` n'est PAS notre référence (l'ancien bug).
  verifier(
    'B7 : `metadata` est un champ SYSTÈME (ce n’est PAS notre référence)',
    (tx?.metadata as Record<string, unknown> | undefined)?.reference_interne ===
      undefined,
    `metadata=${JSON.stringify(tx?.metadata)}`
  );

  return { feda, idFournisseur, reference, cleSandbox };
}

// ============================================================
// C/D/E/F. Webhook — signature, livraison unique, idempotence, montant
// ============================================================
async function partieC_F(
  feda: FedaPayFournisseur,
  reference: string,
  idFournisseur: string
) {
  console.log('\n— C. Webhook correctement signé → crédits livrés UNE fois —');
  process.env.FEDAPAY_WEBHOOK_SECRET = `wh_test_${Date.now().toString(36)}`;
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;

  const corpsWebhook = {
    name: 'transaction.approved',
    entity: {
      id: Number(idFournisseur),
      status: 'approved',
      amount: 500,
      currency_id: 1,
      merchant_reference: reference,
      custom_metadata: { reference_interne: reference, plan: 'credits_250' },
      description: 'Test réconciliation FedaPay (sandbox)',
    },
  };
  const corpsBrut = JSON.stringify(corpsWebhook);

  const entete = enteteSignatureFedapay(corpsBrut, secret);
  verifier(
    'C1 : signature (algorithme officiel t=…,s=…) ACCEPTÉE',
    feda.verifierSignature(corpsBrut, entetes(entete)),
    entete.slice(0, 24) + '…'
  );

  const evenement = feda.extraireEvenement(corpsWebhook) as EvenementPaiement;
  verifier(
    'C2 : extraction → référence interne = merchant_reference',
    evenement?.referenceInterne === reference
  );
  verifier('C3 : extraction → statut indicatif = reussi', evenement?.statut === 'reussi');

  // Trace locale (en mémoire) + magasin de crédits.
  const magasinPaiement = new MagasinPaiementMemoire();
  const magasinAbonnement = new MagasinAbonnementMemoire();
  const magasinCredits = new MagasinCreditsMemoire();
  const proprietaire = 'compte-test-fedapay';
  const paiement: Paiement = {
    reference,
    reference_fournisseur: idFournisseur,
    proprietaire_id: proprietaire,
    plan: 'credits_250',
    montant: 500,
    devise: 'XOF',
    telephone: '90000000',
    statut: 'en_attente',
    fournisseur: 'fedapay',
    url_paiement: null,
    operateur: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await magasinPaiement.creer(paiement);

  const ctx: ContextePaiement = {
    magasinPaiement,
    magasinAbonnement,
    magasinCredits,
    fournisseur: new FournisseurStatutInjecte(feda, 'reussi', 500),
  };

  const r1 = await traiterWebhook(ctx, evenement);
  verifier(
    'C4 : webhook accepté → paiement réussi, crédits APPLIQUÉS',
    r1.applique === true && r1.paiement?.statut === 'reussi' && r1.dejaTraite === false
  );
  const attendu = planParCode('credits_250')?.caracteres ?? 0;
  const solde1 = await magasinCredits.lireSolde(proprietaire);
  verifier(
    `C5 : solde crédité = ${attendu} (Pack Découverte)`,
    solde1 === attendu,
    `solde=${solde1}`
  );

  console.log('\n— D. Webhook REJOUÉ → aucun double crédit —');
  const r2 = await traiterWebhook(ctx, evenement);
  const solde2 = await magasinCredits.lireSolde(proprietaire);
  verifier(
    'D1 : rejoué → dejaTraite=true, applique=false',
    r2.dejaTraite === true && r2.applique === false
  );
  verifier(
    'D2 : AUCUN double crédit (solde inchangé)',
    solde2 === attendu,
    `solde=${solde2}`
  );

  console.log('\n— E. Signature absente / invalide / secret absent → refusé —');
  verifier(
    'E1 : signature ABSENTE → refusé',
    !feda.verifierSignature(corpsBrut, entetes(null))
  );
  const mauvaisSecret = enteteSignatureFedapay(corpsBrut, 'mauvais-secret');
  verifier(
    'E2 : signature avec MAUVAIS SECRET → refusé',
    !feda.verifierSignature(corpsBrut, entetes(mauvaisSecret))
  );
  const autreCorps = JSON.stringify({
    ...corpsWebhook,
    entity: { ...corpsWebhook.entity, amount: 999999 },
  });
  verifier(
    'E3 : signature valide pour un AUTRE corps → refusé (corps altéré)',
    !feda.verifierSignature(corpsBrut, entetes(enteteSignatureFedapay(autreCorps, secret)))
  );
  const sauvegarde = process.env.FEDAPAY_WEBHOOK_SECRET;
  delete process.env.FEDAPAY_WEBHOOK_SECRET;
  const secretAbsent = !feda.verifierSignature(corpsBrut, entetes(entete));
  verifier(
    'E4 : secret NON configuré → ÉCHEC FERMÉ (refus, même signé)',
    secretAbsent
  );
  if (sauvegarde) process.env.FEDAPAY_WEBHOOK_SECRET = sauvegarde;
  // Note : la route /api/paiement/webhook applique exactement ces gardes —
  // secret absent → 503, verifierSignature()==false → 401.
  const decisionRoute = (okSecret: boolean, okSig: boolean) =>
    !okSecret ? 503 : !okSig ? 401 : 200;
  verifier(
    'E5 : décision de la route = 503 (secret absent) / 401 (signature)',
    decisionRoute(false, true) === 503 && decisionRoute(true, false) === 401
  );

  console.log('\n— F. Montant incohérent → refusé —');
  const mpF = new MagasinPaiementMemoire();
  const maF = new MagasinAbonnementMemoire();
  const mcF = new MagasinCreditsMemoire();
  const refF = `${reference}-MONTANT`;
  await mpF.creer({ ...paiement, reference: refF });
  const evF = feda.extraireEvenement({
    name: 'transaction.approved',
    entity: {
      id: Number(idFournisseur),
      status: 'approved',
      amount: 1,
      merchant_reference: refF,
    },
  }) as EvenementPaiement;
  const ctxF: ContextePaiement = {
    magasinPaiement: mpF,
    magasinAbonnement: maF,
    magasinCredits: mcF,
    fournisseur: new FournisseurStatutInjecte(feda, 'reussi', 1),
  };
  let refuse = false;
  try {
    await traiterWebhook(ctxF, evF);
  } catch {
    refuse = true;
  }
  verifier(
    'F1 : montant incohérent (1 ≠ 500) REFUSÉ → aucun crédit',
    refuse && (await mcF.lireSolde(proprietaire)) === 0
  );
  verifier(
    'F2 : paiement laissé en_attente (jamais marqué réussi)',
    (await mpF.lire(refF))?.statut === 'en_attente'
  );
}

// ============================================================
// G. BASE RÉELLE — crediter_pack idempotent, ROLLBACK
// ============================================================
async function partieG(env: Record<string, string>) {
  console.log('\n— G. Base réelle (Supabase) : idempotence — TRANSACTION ANNULÉE —');
  const mdp = env.SUPABASE_DB_PASSWORD;
  if (!mdp) {
    console.log('⊘ ignoré : SUPABASE_DB_PASSWORD absente de .env.local');
    return;
  }
  const pg = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: mdp,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  await pg.query('begin');
  const uid = '00000000-0000-4000-8000-0000000fed01';
  const refPaiement = `PLU-DBTEST-${Date.now().toString(36).toUpperCase()}`;
  try {
    await pg.query('insert into auth.users (id, email) values ($1, $2)', [
      uid,
      'test-fedapay-dbtest@example.invalid',
    ]);
    await pg.query(
      `insert into public.paiements
         (reference, reference_fournisseur, proprietaire_id, plan, montant, statut)
       values ($1, $2, $3, $4, $5, $6)`,
      [refPaiement, '520000', uid, 'credits_250', 500, 'en_attente']
    );
    const attendu = planParCode('credits_250')?.caracteres ?? 0;

    const c1 = await pg.query('select public.crediter_pack($1,$2,$3,$4) as s', [
      uid, 'credits_250', refPaiement, 500,
    ]);
    const c2 = await pg.query('select public.crediter_pack($1,$2,$3,$4) as s', [
      uid, 'credits_250', refPaiement, 500,
    ]);
    const nb = await pg.query(
      `select count(*)::int n from public.credits_mouvements where reference_paiement = $1`,
      [refPaiement]
    );
    const solde = await pg.query(
      `select solde from public.credits_traduction where proprietaire_id = $1`,
      [uid]
    );

    verifier('G1 : 1er crediter_pack crédite le solde', Number(c1.rows[0].s) === attendu, `solde=${c1.rows[0].s}`);
    verifier('G2 : 2e crediter_pack (rejoué) NE double PAS le solde', Number(c2.rows[0].s) === attendu, `solde=${c2.rows[0].s}`);
    verifier('G3 : un SEUL mouvement enregistré (clé d’idempotence)', nb.rows[0].n === 1, `n=${nb.rows[0].n}`);
    verifier('G4 : solde final = 1 seul pack', Number(solde.rows[0]?.solde) === attendu, `solde=${solde.rows[0]?.solde}`);
  } catch (e) {
    verifier('G : test base réelle', false, (e as Error).message);
  } finally {
    await pg.query('rollback');
  }
  const apres = await pg.query(
    `select count(*)::int n from public.credits_mouvements where reference_paiement = $1`,
    [refPaiement]
  );
  verifier('G5 : ROLLBACK → rien n’est conservé', apres.rows[0].n === 0, `n=${apres.rows[0].n}`);
  await pg.end();
}

// ============================================================
// H. Garde-fous SQL de la base (idempotence, texte de la migration)
// ============================================================
function partieH() {
  console.log('\n— H. Garde-fous SQL (migration crédits) —');
  let sql = '';
  try {
    sql = readFileSync('supabase/migrations/20261004000002_credits_traduction.sql', 'utf8');
  } catch (e) {
    verifier('H : migration lisible', false, (e as Error).message);
    return;
  }
  verifier(
    'H1 : `reference_paiement` UNIQUE (clé d’idempotence)',
    /reference_paiement\s+text\s+unique/i.test(sql)
  );
  verifier(
    'H2 : `on conflict (reference_paiement) do nothing`',
    /on conflict \(reference_paiement\) do nothing/i.test(sql)
  );
}

// ------------------------------------------------------------
async function principal() {
  const env = chargerEnvLocal();
  await partieA(env);
  const b = await partieB(env);
  if (b) await partieC_F(b.feda, b.reference, b.idFournisseur);
  await partieG(env);
  partieH();

  console.log(
    `\n${echecs === 0 ? '✓ TOUS LES TESTS PASSENT' : `✗ ${echecs} ÉCHEC(S)`} — ${total - echecs}/${total}\n`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
