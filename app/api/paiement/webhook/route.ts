// ============================================================
// app/api/paiement/webhook/route.ts — Notification de paiement (P0.9).
//
// Mode réel (FedaPay) :
//   1. vérifier la signature HMAC du corps BRUT
//      (FEDAPAY_WEBHOOK_SECRET) ;
//   2. RE-VÉRIFIER le statut auprès de l'API FedaPay ;
//   3. seulement alors, activer l'abonnement (idempotent).
//   → nécessite SUPABASE_SERVICE_ROLE_KEY (appel serveur-à-serveur).
//
// Mode simulation (dev/test) : appelé par la page locale
// /paiement/simulation, authentifié par la session du compte.
// La simulation est refusée en production sauf PAYMENT_SIMULATION=true.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { fournisseurActif, type FournisseurPaiement } from '@/lib/paiement/fournisseur';
import { SimulationFournisseur, simulationAutorisee } from '@/lib/paiement/simulation';
import type { EntetesWebhook } from '@/lib/paiement/types';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { traiterWebhook } from '@/lib/paiement/service';
import { clientServiceRole, utilisateurRequete } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Corps BRUT (indispensable pour le HMAC).
  const chargeBrute = await request.text();
  let corps: unknown;
  try {
    corps = chargeBrute ? JSON.parse(chargeBrute) : {};
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const entetes = request.headers as unknown as EntetesWebhook;

  let fournisseur: FournisseurPaiement;
  try {
    fournisseur = fournisseurActif();
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Indisponible.' },
      { status: 503 }
    );
  }

  const simulation = fournisseur.mode === 'simulation';

  // -------- Client d'écriture --------
  let client;
  if (simulation) {
    if (!simulationAutorisee()) {
      return NextResponse.json(
        { erreur: 'Paiement simulé désactivé dans cet environnement.' },
        { status: 403 }
      );
    }
    const { supabase, user } = await utilisateurRequete(request);
    if (!user) {
      return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
    }
    client = supabase;
    fournisseur = new SimulationFournisseur();
  } else {
    client = clientServiceRole();
    if (!client) {
      return NextResponse.json(
        {
          erreur:
            'Webhook indisponible : SUPABASE_SERVICE_ROLE_KEY manquante.',
        },
        { status: 503 }
      );
    }
    // 1. Signature HMAC.
    if (!fournisseur.verifierSignature(chargeBrute, entetes)) {
      return NextResponse.json(
        { erreur: 'Signature de webhook invalide.' },
        { status: 401 }
      );
    }
  }

  // 2. Normalisation de l'événement (statut INDICATIF en réel).
  const evenement = fournisseur.extraireEvenement(corps);
  if (!evenement) {
    return NextResponse.json(
      { erreur: 'Notification de paiement invalide.' },
      { status: 400 }
    );
  }

  try {
    // 3. traiterWebhook : RE-VÉRIFIE auprès de l'API avant d'activer
    //    (simulation exceptée, canal interne authentifié).
    const resultat = await traiterWebhook(
      {
        magasinPaiement: new MagasinPaiementSupabase(client),
        magasinAbonnement: new MagasinAbonnementSupabase(client),
        // Indispensable pour les PACKS DE CRÉDITS : sans lui, un paiement
        // de pack échoue (« Tunnel incomplet ») au lieu de créditer.
        magasinCredits: new MagasinCreditsSupabase(client),
        fournisseur,
      },
      evenement
    );
    return NextResponse.json({
      ok: true,
      statut: resultat.paiement?.statut ?? 'inconnu',
      applique: resultat.applique,
      dejaTraite: resultat.dejaTraite,
      statutAbonnement: resultat.statutAbonnement,
    });
  } catch (erreur) {
    return NextResponse.json(
      {
        erreur:
          erreur instanceof Error ? erreur.message : 'Traitement impossible.',
      },
      { status: 400 }
    );
  }
}
