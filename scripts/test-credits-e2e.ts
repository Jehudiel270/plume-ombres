// ============================================================
// scripts/test-credits-e2e.ts — Preuve RÉELLE du pay-as-you-go (P0.9+).
//
//   npx tsx scripts/test-credits-e2e.ts            → parties A + B
//   npx tsx scripts/test-credits-e2e.ts --avec-db  → idem (B est la partie base)
//
// PARTIE A — tunnel complet EN MÉMOIRE (aucune clé, aucun réseau) :
//   achat d'un pack → webhook de succès → solde crédité → rejeu
//   idempotent → échec sans effet → montant incohérent refusé.
//
// PARTIE B — MÊME PARCOURS CONTRE LA VRAIE BASE Supabase, avec un VRAI
//   jeton de session (compte de test créé par l'API d'authentification,
//   supprimé à la fin) :
//     1. achat initié (ligne `paiements` réellement écrite) ;
//     2. webhook de succès → solde crédité (RPC public.crediter_pack) ;
//     3. webhook REJOUÉ → aucun double crédit (contrainte UNIQUE) ;
//     4. échec → solde rigoureusement inchangé ;
//     5. quota du plan épuisé → les CRÉDITS prennent le relais
//        (public.reserver_quota), puis RESTITUTION en cas d'échec de
//        traduction (public.liberer_quota) → solde rendu À L'IDENTIQUE ;
//     6. au-delà des crédits → réservation REFUSÉE, solde intact.
//
// Le compte de test et TOUTES ses lignes sont supprimés à la fin
// (bloc finally) : la base de production n'est pas polluée.
// ============================================================

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

import { caracteresPack, planParCode } from '../lib/abonnement';
import { periodeMois } from '../lib/quota';
import { SimulationFournisseur } from '../lib/paiement/simulation';
import {
  MagasinAbonnementMemoire,
  MagasinAbonnementSupabase,
  MagasinCreditsMemoire,
  MagasinCreditsSupabase,
  MagasinPaiementMemoire,
  MagasinPaiementSupabase,
} from '../lib/paiement/magasin';
import {
  initierPaiement,
  traiterWebhook,
  type ContextePaiement,
} from '../lib/paiement/service';

// ------------------------------------------------------------
// Harnais minimal
// ------------------------------------------------------------
let echecs = 0;
let total = 0;

function verifier(nom: string, condition: boolean, detail = '') {
  total += 1;
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ------------------------------------------------------------
// Lecture des variables locales (jamais imprimées)
// ------------------------------------------------------------
function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu
    .split('\n')
    .find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable dans .env.local`);
  return ligne
    .split('=')
    .slice(1)
    .join('=')
    .trim()
    .replace(/^["']|["']$/g, '');
}

const URL_SUPABASE = lireEnvLocal('NEXT_PUBLIC_SUPABASE_URL');
const CLE_ANON = lireEnvLocal('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const MOT_DE_PASSE_TEST = `E2E-${randomUUID().slice(0, 8)}-Aa1!`;
const PREFIXE_REF = `E2E-${Date.now().toString(36).toUpperCase()}`;
const PERIODE = periodeMois().cle; // 1er du mois courant

const emailTest = (suffixe: string) =>
  `test-credits-e2e-${PREFIXE_REF.toLowerCase()}-${suffixe}@plume-ombres.invalid`;

// ============================================================
// PARTIE A — tunnel en mémoire
// ============================================================
function contexteMemoire(): ContextePaiement {
  return {
    magasinPaiement: new MagasinPaiementMemoire(),
    magasinAbonnement: new MagasinAbonnementMemoire(),
    magasinCredits: new MagasinCreditsMemoire(),
    fournisseur: new SimulationFournisseur('https://plume.exemple'),
    baseUrl: 'https://plume.exemple',
  };
}

async function partieA() {
  console.log('\n— A. Tunnel complet EN MÉMOIRE —');
  const ctx = contexteMemoire();
  const credits = ctx.magasinCredits as MagasinCreditsMemoire;
  const compte = 'compte-credits';
  const pack = planParCode('credits_250')!;
  const attendu = caracteresPack(pack);

  // A1 — initiation : trace AVANT l'appel au fournisseur.
  const init = await initierPaiement(ctx, {
    proprietaireId: compte,
    plan: pack.code,
    telephone: '22990012345',
  });
  const trace = await ctx.magasinPaiement.lire(init.paiement.reference);
  verifier(
    'A1 : achat de pack initié, trace écrite en « en_attente »',
    init.paiement.statut === 'en_attente' &&
      init.paiement.plan === 'credits_250' &&
      trace !== null,
    `${init.paiement.plan}/${init.paiement.statut}`
  );
  verifier(
    'A2 : solde AVANT tout webhook = 0 (jamais crédité à l’initiation)',
    (await credits.lireSolde(compte)) === 0
  );

  // A3 — webhook de succès → crédit.
  const res = await traiterWebhook(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack.prixXof,
  });
  const solde1 = await credits.lireSolde(compte);
  verifier(
    'A3 : webhook de succès → paiement réussi ET solde crédité',
    res.paiement?.statut === 'reussi' && res.applique === true && solde1 === attendu,
    `statut=${res.paiement?.statut} solde=${solde1}/${attendu}`
  );
  verifier(
    'A4 : un pack N’OUVRE PAS d’abonnement (aucun droit récurrent)',
    (await ctx.magasinAbonnement.lire(compte)) === null
  );

  // A5 — rejeu du webhook : idempotence.
  const rejoue = await traiterWebhook(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack.prixXof,
  });
  verifier(
    'A5 : webhook REJOUÉ → « déjà traité », solde strictement inchangé',
    rejoue.dejaTraite === true &&
      rejoue.applique === false &&
      (await credits.lireSolde(compte)) === attendu,
    `solde=${await credits.lireSolde(compte)}`
  );

  // A6 — deuxième pack : cumul.
  const pack2 = planParCode('credits_600')!;
  const init2 = await initierPaiement(ctx, {
    proprietaireId: compte,
    plan: pack2.code,
    telephone: '22990012345',
  });
  await traiterWebhook(ctx, {
    referenceInterne: init2.paiement.reference,
    referenceFournisseur: init2.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack2.prixXof,
  });
  const cumul = attendu + caracteresPack(pack2);
  verifier(
    'A6 : deux packs → soldes CUMULÉS',
    (await credits.lireSolde(compte)) === cumul,
    `solde=${await credits.lireSolde(compte)} attendu=${cumul}`
  );

  // A7 — échec : aucun crédit.
  const init3 = await initierPaiement(ctx, {
    proprietaireId: compte,
    plan: 'credits_1800',
    telephone: '22990012345',
  });
  const echec = await traiterWebhook(ctx, {
    referenceInterne: init3.paiement.reference,
    statut: 'echoue',
  });
  verifier(
    'A7 : paiement ÉCHOUÉ → solde intact',
    echec.paiement?.statut === 'echoue' &&
      (await credits.lireSolde(compte)) === cumul,
    `solde=${await credits.lireSolde(compte)}`
  );

  // A8 — montant incohérent : refus.
  const init4 = await initierPaiement(ctx, {
    proprietaireId: compte,
    plan: 'credits_4000',
    telephone: '22990012345',
  });
  let refus = false;
  try {
    await traiterWebhook(ctx, {
      referenceInterne: init4.paiement.reference,
      statut: 'reussi',
      montant: 1,
    });
  } catch {
    refus = true;
  }
  verifier(
    'A8 : montant incohérent REFUSÉ, solde intact',
    refus && (await credits.lireSolde(compte)) === cumul,
    `solde=${await credits.lireSolde(compte)}`
  );

  // A9 — garde-fou : un tunnel sans magasin de crédits doit ÉCHOUER
  // franchement plutôt que de valider un pack sans créditer.
  const ctxIncomplet: ContextePaiement = {
    ...contexteMemoire(),
    magasinCredits: undefined,
  };
  const init5 = await initierPaiement(ctxIncomplet, {
    proprietaireId: 'compte-incomplet',
    plan: 'credits_250',
    telephone: '22990012345',
  });
  let aLeve = false;
  try {
    await traiterWebhook(ctxIncomplet, {
      referenceInterne: init5.paiement.reference,
      statut: 'reussi',
      montant: 500,
    });
  } catch (e) {
    aLeve = /magasin de crédits absent/i.test((e as Error).message);
  }
  verifier(
    'A9 : tunnel incomplet (sans magasin de crédits) → erreur explicite',
    aLeve
  );
}

// ============================================================
// PARTIE B — vraie base, vraie session
// ============================================================
interface CompteTest {
  id: string;
  email: string;
  acces: string; // jeton d'accès
  refresh: string;
}

/** Crée un compte de test par l'API d'authentification Supabase. */
async function creerCompteTest(suffixe = 'principal'): Promise<CompteTest> {
  const email = emailTest(`${suffixe}-${randomUUID().slice(0, 6)}`);
  const reponse = await fetch(`${URL_SUPABASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: CLE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MOT_DE_PASSE_TEST }),
  });
  if (!reponse.ok) {
    throw new Error(`Création du compte de test refusée (HTTP ${reponse.status})`);
  }
  const corps = (await reponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string };
  };
  if (!corps.access_token || !corps.user?.id) {
    throw new Error(
      'Compte créé mais sans session : la confirmation e-mail est activée ' +
        'sur ce projet, le test HTTP de bout en bout ne peut pas s’exécuter.'
    );
  }
  return {
    id: corps.user.id,
    email,
    acces: corps.access_token,
    refresh: corps.refresh_token ?? '',
  };
}

/** Client Supabase agissant AU NOM du compte de test (jeton réel). */
function clientCompte(compte: CompteTest): SupabaseClient {
  return createClient(URL_SUPABASE, CLE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${compte.acces}` } },
  });
}

/** Limite de plan EFFECTIVE, telle que la voit public.reserver_quota. */
async function lireLimitePlan(
  client: SupabaseClient,
  proprietaire: string
): Promise<number> {
  const { data, error } = await client.rpc('reserver_quota', {
    p_proprietaire: proprietaire,
    p_periode: PERIODE,
    p_caracteres: 0,
    p_limite: 0,
  });
  if (error) throw new Error(`reserver_quota (limite) : ${error.message}`);
  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { limite: number }
    | undefined;
  return Number(ligne?.limite ?? 0);
}

function contexteReel(client: SupabaseClient): ContextePaiement {
  return {
    magasinPaiement: new MagasinPaiementSupabase(client),
    magasinAbonnement: new MagasinAbonnementSupabase(client),
    magasinCredits: new MagasinCreditsSupabase(client),
    fournisseur: new SimulationFournisseur('https://plume.exemple'),
    baseUrl: 'https://plume.exemple',
  };
}

async function partieB(compte: CompteTest, client: SupabaseClient) {
  console.log('\n— B. PARCOURS RÉEL contre la base Supabase (compte de test) —');
  console.log(`   compte : ${compte.email.replace(/[^@]+/, '***')} (id ${compte.id.slice(0, 8)}…)`);

  const ctx = contexteReel(client);
  const credits = ctx.magasinCredits as MagasinCreditsSupabase;

  // B1 — solde de départ.
  const solde0 = await credits.lireSolde(compte.id);
  verifier('B1 : solde de départ lu dans la base (0)', solde0 === 0, String(solde0));

  // État de départ de l'abonnement : un compte NEUF reçoit un plan
  // d'essai (7 jours) par déclencheur d'inscription. On le capture pour
  // prouver qu'un achat de pack ne le touche PAS.
  const abonnementAvant = await ctx.magasinAbonnement.lire(compte.id);
  const limitePlan = await lireLimitePlan(client, compte.id);
  console.log(
    `   plan de départ : ${abonnementAvant?.plan ?? 'aucun'} (${abonnementAvant?.statut ?? '-'})` +
      ` · limite de plan effective : ${limitePlan.toLocaleString('fr-FR')} caractères`
  );

  // B2 — initiation : la ligne `paiements` est réellement écrite.
  const pack = planParCode('credits_250')!;
  const init = await initierPaiement(ctx, {
    proprietaireId: compte.id,
    plan: pack.code,
    telephone: '+22990012345',
    email: compte.email,
  });
  const enBase = await ctx.magasinPaiement.lire(init.paiement.reference);
  verifier(
    'B2 : ligne `paiements` écrite en base, statut « en_attente », plan du pack',
    enBase !== null && enBase.statut === 'en_attente' && enBase.plan === 'credits_250',
    `${enBase?.statut}/${enBase?.plan}`
  );

  // B3 — webhook de succès → crédit réel (RPC crediter_pack).
  const res = await traiterWebhook(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack.prixXof,
  });
  const attendu = caracteresPack(pack);
  const solde1 = await credits.lireSolde(compte.id);
  verifier(
    'B3 : webhook de succès → solde CRÉDITÉ EN BASE',
    res.paiement?.statut === 'reussi' && res.applique === true && solde1 === attendu,
    `statut=${res.paiement?.statut} solde=${solde1}/${attendu}`
  );

  // B4 — le journal porte la référence du paiement (traçabilité).
  const { data: mouvements } = await client
    .from('credits_mouvements')
    .select('*')
    .eq('reference_paiement', init.paiement.reference);
  const mouvement = (mouvements ?? [])[0] as Record<string, unknown> | undefined;
  verifier(
    'B4 : mouvement journalisé (pack, caractères, montant, référence)',
    Boolean(mouvement) &&
      Number(mouvement?.caracteres) === attendu &&
      Number(mouvement?.montant) === pack.prixXof &&
      String(mouvement?.pack_code) === 'credits_250',
    JSON.stringify(mouvement ?? {})
  );

  // B5 — REJEU du webhook : la contrainte UNIQUE doit empêcher tout doublon.
  const rejoue = await traiterWebhook(ctx, {
    referenceInterne: init.paiement.reference,
    referenceFournisseur: init.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack.prixXof,
  });
  const soldeApresRejeu = await credits.lireSolde(compte.id);
  verifier(
    'B5 : webhook REJOUÉ → « déjà traité », AUCUN double crédit en base',
    rejoue.dejaTraite === true &&
      rejoue.applique === false &&
      soldeApresRejeu === attendu,
    `solde=${soldeApresRejeu} attendu=${attendu}`
  );

  // B5bis — l'idempotence tient aussi au niveau SQL : on rappelle la RPC
  // directement avec la MÊME référence, comme le ferait un webhook tardif.
  const { data: rappel, error: errRappel } = await client.rpc('crediter_pack', {
    p_proprietaire: compte.id,
    p_pack: 'credits_250',
    p_reference_paiement: init.paiement.reference,
    p_montant: pack.prixXof,
  });
  verifier(
    'B5bis : RPC crediter_pack rappelée avec la même référence → solde inchangé',
    !errRappel && Number(rappel) === attendu,
    `rpc=${rappel} err=${errRappel?.message ?? '-'}`
  );

  // B6 — le pack n'a pas TOUCHÉ l'abonnement du compte.
  const abonnementApres = await ctx.magasinAbonnement.lire(compte.id);
  verifier(
    'B6 : un achat de pack laisse l’abonnement du compte STRICTEMENT inchangé',
    JSON.stringify(abonnementApres) === JSON.stringify(abonnementAvant) &&
      !['credits_250', 'credits_600', 'credits_1800', 'credits_4000'].includes(
        abonnementApres?.plan ?? ''
      ),
    JSON.stringify(abonnementApres ?? {})
  );

  // B7 — deuxième pack, cumul réel.
  const pack2 = planParCode('credits_600')!;
  const init2 = await initierPaiement(ctx, {
    proprietaireId: compte.id,
    plan: pack2.code,
    telephone: '+22990012345',
  });
  await traiterWebhook(ctx, {
    referenceInterne: init2.paiement.reference,
    referenceFournisseur: init2.paiement.reference_fournisseur,
    statut: 'reussi',
    montant: pack2.prixXof,
  });
  const cumul = attendu + caracteresPack(pack2);
  verifier(
    'B7 : deux packs achetés → solde CUMULÉ en base',
    (await credits.lireSolde(compte.id)) === cumul,
    `solde=${await credits.lireSolde(compte.id)} attendu=${cumul}`
  );

  // B8 — échec réel : solde rigoureusement inchangé.
  const init3 = await initierPaiement(ctx, {
    proprietaireId: compte.id,
    plan: 'credits_1800',
    telephone: '+22990012345',
  });
  const echec = await traiterWebhook(ctx, {
    referenceInterne: init3.paiement.reference,
    statut: 'echoue',
  });
  verifier(
    'B8 : paiement ÉCHOUÉ → solde inchangé et paiement marqué « echoue »',
    echec.paiement?.statut === 'echoue' &&
      (await credits.lireSolde(compte.id)) === cumul,
    `statut=${echec.paiement?.statut} solde=${await credits.lireSolde(compte.id)}`
  );

  // B9 — CONSOMMATION : le quota du PLAN passe en premier, les crédits
  //     ne servent qu'au-delà. On remplit donc d'abord exactement le
  //     quota du plan (les crédits doivent rester INTACTS), puis on
  //     dépasse pour vérifier que le reliquat est bien pris sur eux.
  const r0 = await client.rpc('reserver_quota', {
    p_proprietaire: compte.id,
    p_periode: PERIODE,
    p_caracteres: limitePlan,
    p_limite: 0,
  });
  const ligne0 = (Array.isArray(r0.data) ? r0.data[0] : r0.data) as
    | { autorise: boolean }
    | undefined;
  const soldeApresPlan = await credits.lireSolde(compte.id);
  verifier(
    'B9a : quota du plan consommé en PREMIER → crédits intacts',
    !r0.error && ligne0?.autorise === true && soldeApresPlan === cumul,
    `err=${r0.error?.message ?? '-'} solde=${soldeApresPlan} attendu=${cumul}`
  );

  const aPayer = 300_000;
  const r1 = await client.rpc('reserver_quota', {
    p_proprietaire: compte.id,
    p_periode: PERIODE,
    p_caracteres: aPayer,
    p_limite: 0,
  });
  const ligne1 = (Array.isArray(r1.data) ? r1.data[0] : r1.data) as
    | { autorise: boolean; utilise: number; limite: number }
    | undefined;
  const soldeApresConso = await credits.lireSolde(compte.id);
  verifier(
    'B9b : au-delà du plan, les CRÉDITS sont réellement débités',
    !r1.error &&
      ligne1?.autorise === true &&
      soldeApresConso === cumul - aPayer,
    `autorise=${ligne1?.autorise} solde=${soldeApresConso} attendu=${cumul - aPayer}`
  );

  // B10 — RESTITUTION : une traduction qui échoue rend les crédits.
  const { error: errLiberer } = await client.rpc('liberer_quota', {
    p_proprietaire: compte.id,
    p_periode: PERIODE,
    p_caracteres: aPayer,
  });
  const soldeRendu = await credits.lireSolde(compte.id);
  verifier(
    'B10 : échec de traduction → crédits RESTITUÉS au solde exact',
    !errLiberer && soldeRendu === cumul,
    `err=${errLiberer?.message ?? '-'} solde=${soldeRendu} attendu=${cumul}`
  );

  // B11 — REFUS : au-delà des crédits disponibles, aucune réservation.
  const { data: r2 } = await client.rpc('reserver_quota', {
    p_proprietaire: compte.id,
    p_periode: PERIODE,
    p_caracteres: cumul + 5_000_000,
    p_limite: 0,
  });
  const ligne2 = (Array.isArray(r2) ? r2[0] : r2) as
    | { autorise: boolean }
    | undefined;
  verifier(
    'B11 : demande au-delà des crédits → REFUSÉE, solde intact',
    ligne2?.autorise === false &&
      (await credits.lireSolde(compte.id)) === cumul,
    `autorise=${ligne2?.autorise} solde=${await credits.lireSolde(compte.id)}`
  );

  // B12 — cloisonnement : un autre compte ne voit pas ces crédits.
  const autre = await creerCompteTest('cloisonnement');
  try {
    const clientAutre = clientCompte(autre);
    const { data: soldeAutre } = await clientAutre.rpc('solde_credits', {
      p_proprietaire: autre.id,
    });
    verifier(
      'B12 : un autre compte voit un solde à 0 (cloisonnement RLS/RPC)',
      Number(soldeAutre ?? 0) === 0,
      `solde=${soldeAutre}`
    );
    // Et il ne peut pas lire les paiements du premier compte.
    const { data: paiementsAutre } = await clientAutre
      .from('paiements')
      .select('reference');
    verifier(
      'B13 : un autre compte ne LIT pas les paiements d’autrui (RLS)',
      (paiementsAutre ?? []).length === 0,
      `${(paiementsAutre ?? []).length} ligne(s)`
    );
    await supprimerComptesTest([autre.id]);
  } catch (e) {
    await supprimerComptesTest([autre.id]);
    throw e;
  }
}

// ------------------------------------------------------------
// Nettoyage : suppression des comptes de test (cascade sur toutes
// leurs lignes : paiements, crédits, mouvements, usage, abonnement).
// ------------------------------------------------------------
async function supprimerComptesTest(ids: string[]) {
  const client = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    if (ids.length > 0) {
      await client.query('delete from auth.users where id = any($1::uuid[])', [ids]);
    }
    // Filet de sécurité : tout compte de test laissé par une exécution
    // précédente (motifs strictement réservés aux tests).
    const restants = await client.query(
      `delete from auth.users
        where email like 'test-credits-e2e-%@plume-ombres.invalid'
           or email like 'probe-noop-%@plume-ombres.invalid'
        returning id`
    );
    if (restants.rowCount) {
      console.log(`   nettoyage : ${restants.rowCount} compte(s) de test résiduel(s) supprimé(s)`);
    }
  } finally {
    await client.end();
  }
}

// ============================================================
async function principal() {
  console.log('Preuve pay-as-you-go — Plume d\'Ombres (P0.9+)');
  console.log('==============================================');

  await partieA();

  let compte: CompteTest | null = null;
  let client: SupabaseClient | null = null;
  try {
    compte = await creerCompteTest();
    client = clientCompte(compte);
    await partieB(compte, client);
  } catch (e) {
    echecs += 1;
    console.error(`\n✗ Partie B interrompue : ${(e as Error).message}`);
  } finally {
    try {
      await supprimerComptesTest(compte ? [compte.id] : []);
      console.log('\n   comptes de test supprimés (base nettoyée)');
    } catch (e) {
      console.error(`   ⚠ nettoyage impossible : ${(e as Error).message}`);
    }
  }

  console.log(
    `\n${echecs === 0 ? '✓' : '✗'} ${total - echecs}/${total} contrôles réussis` +
      (echecs ? ` — ${echecs} ÉCHEC(S)` : '')
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
