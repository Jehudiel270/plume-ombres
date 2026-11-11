// ============================================================
// scripts/preuve-tunnel-live.ts — PREUVE du tunnel FedaPay en LIVE.
//
// Exécute le VRAI code (lib/paiement/fedapay.ts) contre l'API LIVE :
//   A. environnement = live, clé lue côté serveur ;
//   B. POST /transactions + POST /transactions/{id}/token via
//      FedaPayFournisseur.creerPaiement (merchant_reference incluse) ;
//   C. l'URL process.fedapay.com/{token} répond 200 (page de paiement
//      réellement servie) ;
//   D. relecture du statut par GET /transactions/{id}.
//
// AUCUN paiement n'est effectué : la transaction reste non payée et
// expire d'elle-même. Le montant est le plus bas du catalogue (500 XOF).
//
// Usage : npx tsx scripts/preuve-tunnel-live.ts
// ============================================================

import { readFileSync } from 'node:fs';
import { FedaPayFournisseur, fedapayEnv } from '../lib/paiement/fedapay';

function chargerEnvLocal(): void {
  const txt = readFileSync('.env.local', 'utf8');
  for (const ligne of txt.split(/\r?\n/)) {
    const l = ligne.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    const k = l.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    if (process.env[k]) continue; // l'environnement explicite gagne
    process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

function ligne(ok: boolean, nom: string, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${nom}${detail ? ` — ${detail}` : ''}`);
}

async function principal(): Promise<void> {
  chargerEnvLocal();
  process.env.FEDAPAY_ENV = 'live';
  delete process.env.FEDAPAY_API_URL;
  delete process.env.FEDAPAY_PROCESS_URL;

  ligne(fedapayEnv() === 'live', 'environnement', fedapayEnv());
  const cle = process.env.FEDAPAY_SECRET_KEY?.trim() ?? '';
  ligne(cle.startsWith('sk_live_'), 'clé live présente', `${cle.slice(0, 8)}… (${cle.length} car.)`);

  const fournisseur = new FedaPayFournisseur();
  const reference = `PLU-PREUVE-${Date.now().toString(36).toUpperCase()}`;
  const montant = 500;

  console.log(`\n— Création d'une transaction live de ${montant} XOF (référence ${reference}) —`);
  const resultat = await fournisseur.creerPaiement({
    reference,
    plan: 'credits_250',
    montant,
    devise: 'XOF',
    telephone: '+22990000000',
    moyen: 'mobile_money',
    pays: 'bj',
    prenom: 'Preuve',
    nom: 'Technique',
    description: 'Preuve technique — transaction non payée',
    urlRetour: 'https://plumedombres.kodelyza.com/paiement/succes',
    urlNotification: 'https://plumedombres.kodelyza.com/api/paiement/webhook',
  });
  ligne(
    resultat.url.startsWith('https://process.fedapay.com/'),
    'URL de paiement process.fedapay.com',
    resultat.url.replace(/(\/[A-Za-z0-9_-]{12})[A-Za-z0-9_-]+/, '$1…')
  );
  const id = resultat.referenceFournisseur;
  ligne(!!id, 'identifiant transaction', id ?? 'absent');
  if (!id) throw new Error('transaction créée sans identifiant');

  const page = await fetch(resultat.url, { redirect: 'manual' });
  ligne(page.status === 200, 'page de paiement servie', `HTTP ${page.status}`);

  const verif = await fournisseur.verifierPaiement(id);
  ligne(true, 'relecture du statut par API', `${verif.statut} · ${verif.montant ?? '?'} XOF`);

  const parRef = await fournisseur.retrouverParReferenceMarquand(reference);
  ligne(
    parRef !== null && String(parRef.merchant_reference) === reference,
    'réconciliation par merchant_reference',
    parRef ? `id ${String(parRef.id)}` : 'introuvable'
  );

  console.log('\nTransaction laissée volontairement NON PAYÉE (aucun débit).');
}

principal().catch((e: unknown) => {
  console.error('ÉCHEC :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
