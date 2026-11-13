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
import { estPing, statutHttpErreurWebhook } from '@/lib/paiement/politique-webhook';
import { clientServiceRole, utilisateurRequete } from '@/lib/paiement/serveur';
import { notifierPaiement } from '@/lib/paiement/alertes';
import { journaliserWebhook } from '@/lib/paiement/journal-webhook';

export const runtime = 'nodejs';

/**
 * Nom d'événement brut pour le journal (FedaPay envoie
 * { name: 'transaction.approved', … }). Lecture superficielle, en
 * bonne foi : ce champ n'est qu'INDICATIF, jamais décisionnaire.
 */
function nomEvenementBrut(corps: unknown): string | null {
  if (typeof corps !== 'object' || corps === null) return null;
  for (const cle of ['name', 'type', 'event']) {
    const valeur = (corps as Record<string, unknown>)[cle];
    if (typeof valeur === 'string' && valeur.trim()) return valeur.slice(0, 120);
  }
  return null;
}

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

  // Ping de vérification d'endpoint FedaPay (bouton « Tester » du
  // tableau de bord) : rien à traiter, mais il FAUT répondre 2xx, sinon
  // FedaPay compte un échec sur l'endpoint. Traité AVANT l'authentification
  // (il ne porte aucune donnée et ne déclenche aucune écriture).
  if (estPing(corps)) {
    return NextResponse.json({ ok: true, ping: true });
  }

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
    // 1. Signature HMAC — ÉCHEC FERMÉ : aucun traitement sans signature
    //    VALIDE. Un secret MANQUANT est une mauvaise configuration (503) ;
    //    une signature absente ou fausse est une requête illégitime (401).
    //    Dans les deux cas, AUCUN crédit n'est livré.
    //
    //    FEDAPAY_WEBHOOK_SECRET se récupère dans le tableau de bord FedaPay
    //    (« Développeurs » → « Webhooks » → ouvrir l'endpoint
    //    `…/api/paiement/webhook` → « Copier la clé », valeur `wh_live_…`).
    if (!process.env.FEDAPAY_WEBHOOK_SECRET?.trim()) {
      return NextResponse.json(
        {
          erreur:
            'Webhook FedaPay non configuré : FEDAPAY_WEBHOOK_SECRET est ' +
            'absent (tableau de bord FedaPay → Webhooks → endpoint → ' +
            '« Copier la clé »).',
        },
        { status: 503 }
      );
    }
    if (!fournisseur.verifierSignature(chargeBrute, entetes)) {
      // Journalisé SILENCIEUSEMENT : voir ces tentatives est justement
      // l'objet du journal (clé de signature fausse ou requête hostile).
      const evApprox = fournisseur.extraireEvenement(corps);
      await journaliserWebhook(client, {
        fournisseur: 'fedapay',
        evenement: nomEvenementBrut(corps),
        reference: evApprox?.referenceInterne ?? null,
        statutHttp: 401,
        traite: false,
        dejaTraite: false,
        erreur: 'Signature de webhook invalide ou absente (X-FEDAPAY-SIGNATURE).',
      });
      return NextResponse.json(
        {
          erreur:
            'Signature de webhook invalide ou absente ' +
            '(en-tête X-FEDAPAY-SIGNATURE).',
        },
        { status: 401 }
      );
    }
  }

  // 2. Normalisation de l'événement (statut INDICATIF en réel).
  const evenement = fournisseur.extraireEvenement(corps);
  if (!evenement) {
    if (!simulation) {
      await journaliserWebhook(client, {
        fournisseur: 'fedapay',
        evenement: nomEvenementBrut(corps),
        reference: null,
        statutHttp: 400,
        traite: false,
        dejaTraite: false,
        erreur: 'Notification de paiement invalide (événement illisible).',
      });
    }
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
    // 4. Alerter l'acheteur et les administrateurs abonnés (réussi /
    //    échoué). Une erreur ici ne doit jamais faire échouer le
    //    paiement : FedaPay rejouerait l'événement pour rien.
    try {
      await notifierPaiement(
        client,
        evenement.referenceInterne,
        resultat.paiement?.statut
      );
    } catch (erreur) {
      console.warn(
        '[alertes] notification de paiement non écrite :',
        erreur instanceof Error ? erreur.message : erreur
      );
    }

    // 5. Journal de la livraison (mode réel uniquement ; en
    //    simulation, l'écriture serait bloquée par la RLS). Silencieux.
    if (!simulation) {
      await journaliserWebhook(client, {
        fournisseur: 'fedapay',
        evenement: nomEvenementBrut(corps),
        reference: evenement.referenceInterne,
        statutHttp: 200,
        traite: true,
        dejaTraite: resultat.dejaTraite === true,
        erreur: null,
      });
    }

    return NextResponse.json({
      ok: true,
      statut: resultat.paiement?.statut ?? 'inconnu',
      applique: resultat.applique,
      dejaTraite: resultat.dejaTraite,
      statutAbonnement: resultat.statutAbonnement,
    });
  } catch (erreur) {
    const message =
      erreur instanceof Error ? erreur.message : 'Traitement impossible.';
    const statut = statutHttpErreurWebhook(message);
    // 6. Livraison en échec : tracée (500 = transitoire → FedaPay
    //    DOIT retenter, et la retente apparaîtra aussi au journal).
    if (!simulation) {
      await journaliserWebhook(client, {
        fournisseur: 'fedapay',
        evenement: nomEvenementBrut(corps),
        reference: evenement.referenceInterne,
        statutHttp: statut,
        traite: false,
        dejaTraite: false,
        erreur: message,
      });
    }
    // 400 = définitif (réessayer ne sert à rien) ; 500 = transitoire
    // (API ou base momentanément indisponible) → FedaPay DOIT réessayer,
    // sinon le paiement n'est jamais crédité.
    return NextResponse.json({ erreur: message }, { status: statut });
  }
}
