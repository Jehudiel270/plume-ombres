// ============================================================
// lib/paiement/fedapay.ts — Fournisseur FedaPay (P0.9).
//
// Bénin / zone UEMOA : Mobile Money + cartes.
//
// Clés UNIQUEMENT côté serveur, via variables d'environnement :
//   FEDAPAY_SECRET_KEY      (sk_sandbox_… ou sk_live_…)
//   FEDAPAY_ENV             'sandbox' (défaut) | 'live'
//   FEDAPAY_WEBHOOK_SECRET  secret de signature du webhook
//   FEDAPAY_API_URL         (facultatif) surcharge l'URL d'API
//
// IMPORTANT : sandbox et live sont deux jeux de données SÉPARÉS.
// Une transaction créée en sandbox n'existe PAS en live (et
// inversement) : l'environnement est déduit de FEDAPAY_ENV, jamais
// mélangé.
//
// Le flux suit l'API FedaPay v1 : POST /transactions, puis
// POST /transactions/{id}/token, puis redirection vers la page de
// paiement https://(sandbox-)process.fedapay.com/{token}. Vérifier
// la signature HMAC du webhook PUIS revérifier le statut via
// GET /transactions/{id} : c'est la responsabilité du service.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  DemandePaiement,
  EvenementPaiement,
  ModePaiement,
  ResultatPaiement,
  StatutPaiement,
  VerificationPaiement,
} from './types';

const API_SANDBOX = 'https://sandbox-api.fedapay.com/v1';
const API_LIVE = 'https://api.fedapay.com/v1';
const PROCESS_SANDBOX = 'https://sandbox-process.fedapay.com';
const PROCESS_LIVE = 'https://process.fedapay.com';

/** Environnement FedaPay courant ('sandbox' par défaut). */
export function fedapayEnv(): 'sandbox' | 'live' {
  return process.env.FEDAPAY_ENV?.trim().toLowerCase() === 'live'
    ? 'live'
    : 'sandbox';
}

/** Clé secrète FedaPay, ou null si absente. */
export function cleFedapay(): string | null {
  return process.env.FEDAPAY_SECRET_KEY?.trim() || null;
}

/** Vrai si FedaPay est configuré (clé présente). */
export function fedapayConfigure(): boolean {
  return !!cleFedapay();
}

/**
 * Normalise un statut FedaPay vers nos trois valeurs.
 * approved→reussi ; declined/canceled/failed/refunded/expired→echoue ;
 * le reste (pending, created, sent, transferred…)→en_attente.
 */
export function normaliserStatutFedapay(brut: unknown): StatutPaiement {
  const v = String(brut ?? '').trim().toLowerCase();
  if (['approved', 'success', 'successful', 'paid', 'completed'].includes(v)) {
    return 'reussi';
  }
  if (
    [
      'declined',
      'canceled',
      'cancelled',
      'failed',
      'refunded',
      'expired',
      'reversed',
    ].includes(v)
  ) {
    return 'echoue';
  }
  return 'en_attente';
}

/** Comparaison de chaînes à temps constant (anti-timing). */
function egalConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class FedaPayFournisseur {
  readonly id = 'fedapay';
  readonly nom = 'FedaPay';

  get mode(): ModePaiement {
    return fedapayEnv(); // 'sandbox' | 'live'
  }

  estConfigure(): boolean {
    return fedapayConfigure();
  }

  private apiBase(): string {
    const surcharge = process.env.FEDAPAY_API_URL?.trim();
    if (surcharge) return surcharge.replace(/\/$/, '');
    return this.mode === 'live' ? API_LIVE : API_SANDBOX;
  }

  private processBase(): string {
    const surcharge = process.env.FEDAPAY_PROCESS_URL?.trim();
    if (surcharge) return surcharge.replace(/\/$/, '');
    return this.mode === 'live' ? PROCESS_LIVE : PROCESS_SANDBOX;
  }

  private async appel(
    chemin: string,
    init: { method: string; body?: unknown }
  ): Promise<Record<string, unknown>> {
    const cle = cleFedapay();
    if (!cle) throw new Error('[fedapay] FEDAPAY_SECRET_KEY manquante.');
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 20_000);
    try {
      const reponse = await fetch(`${this.apiBase()}${chemin}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${cle}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controleur.signal,
      });
      const texte = await reponse.text();
      let donnees: Record<string, unknown> = {};
      try {
        donnees = texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
      } catch {
        donnees = { brut: texte };
      }
      if (!reponse.ok) {
        const message =
          typeof donnees.message === 'string'
            ? donnees.message
            : `HTTP ${reponse.status}`;
        throw new Error(`[fedapay] ${message}`);
      }
      return donnees;
    } finally {
      clearTimeout(delai);
    }
  }

  /** Extrait l'objet transaction d'une réponse FedaPay (v1/transaction). */
  private static transaction(donnees: Record<string, unknown>): Record<string, unknown> {
    const t =
      (donnees['v1/transaction'] as Record<string, unknown> | undefined) ??
      (donnees.transaction as Record<string, unknown> | undefined) ??
      donnees;
    return t;
  }

  async creerPaiement(demande: DemandePaiement): Promise<ResultatPaiement> {
    const corps: Record<string, unknown> = {
      description: demande.description,
      amount: demande.montant,
      currency: { iso: demande.devise },
      callback_url: demande.urlRetour,
      metadata: { reference_interne: demande.reference },
      customer: {
        ...(demande.prenom ? { firstname: demande.prenom } : {}),
        ...(demande.nom ? { lastname: demande.nom } : {}),
        ...(demande.email ? { email: demande.email } : {}),
        phone_number: {
          number: demande.telephone,
          ...(demande.pays ? { country: demande.pays } : {}),
        },
      },
    };

    const creation = FedaPayFournisseur.transaction(
      await this.appel('/transactions', { method: 'POST', body: corps })
    );
    const id = creation.id;
    if (id === undefined || id === null) {
      throw new Error('[fedapay] transaction créée sans identifiant.');
    }

    // Génère le jeton de paiement à partir de la transaction.
    const jet = await this.appel(
      `/transactions/${encodeURIComponent(String(id))}/token`,
      { method: 'POST' }
    );
    const jeton =
      ((jet['v1/token'] as Record<string, unknown> | undefined)?.token as string) ??
      (jet.token as string) ??
      (creation.token as string);
    if (!jeton) {
      throw new Error('[fedapay] aucune URL de paiement (jeton absent).');
    }

    return {
      url: `${this.processBase()}/${jeton}`,
      referenceFournisseur: String(id),
      fournisseur: this.id,
    };
  }

  async verifierPaiement(reference: string): Promise<VerificationPaiement> {
    const donnees = await this.appel(
      `/transactions/${encodeURIComponent(reference)}`,
      { method: 'GET' }
    );
    const tx = FedaPayFournisseur.transaction(donnees);
    return {
      statut: normaliserStatutFedapay(tx.status),
      montant: typeof tx.amount === 'number' ? tx.amount : undefined,
      brut: tx,
    };
  }

  /**
   * Vérifie la signature HMAC-SHA256 du webhook. FedaPay signe le
   * corps BRUT avec le secret d'endpoint (FEDAPAY_WEBHOOK_SECRET) et
   * l'expose dans l'en-tête X-FEDAPAY-SIGNATURE.
   */
  verifierSignature(chargeBrute: string, entetes: { get(nom: string): string | null }): boolean {
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET?.trim();
    if (!secret) return false;
    const fourni =
      entetes.get('x-fedapay-signature') ??
      entetes.get('X-FEDAPAY-SIGNATURE') ??
      entetes.get('x-signature');
    if (!fourni) return false;
    const attendu = createHmac('sha256', secret).update(chargeBrute, 'utf8').digest('hex');
    const fourniNettoye = fourni.replace(/^sha256=/i, '').trim();
    return egalConstant(fourniNettoye, attendu);
  }

  /**
   * Extrait référence interne + référence fournisseur du corps.
   * FedaPay envoie { name: 'transaction.approved', entity: {…} }.
   * On NE conclut PAS le statut ici : il doit être RE-VÉRIFIÉ via
   * verifierPaiement() (le service s'en charge).
   */
  extraireEvenement(corps: unknown): EvenementPaiement | null {
    if (!corps || typeof corps !== 'object') return null;
    const c = corps as Record<string, unknown>;
    const entite = (c.entity ?? c.transaction ?? c) as Record<string, unknown>;
    const idFournisseur =
      entite.id !== undefined && entite.id !== null
        ? String(entite.id)
        : typeof c.reference === 'string'
          ? c.reference
          : null;
    const meta = (entite.metadata ?? {}) as Record<string, unknown>;
    const referenceInterne =
      typeof meta.reference_interne === 'string'
        ? meta.reference_interne
        : typeof entite.reference === 'string'
          ? entite.reference
          : null;
    if (!idFournisseur && !referenceInterne) return null;
    // Statut INDICATIF seulement (le corps n'est jamais la source de vérité).
    const statutIndicatif = normaliserStatutFedapay(
      entite.status ?? c.status ?? c.name
    );
    return {
      referenceInterne,
      referenceFournisseur: idFournisseur,
      statut: statutIndicatif,
      montant: typeof entite.amount === 'number' ? entite.amount : undefined,
      brut: corps,
    };
  }
}
