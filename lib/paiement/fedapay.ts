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

/**
 * User-Agent « navigateur » obligatoire sur l'API live.
 *
 * Depuis fin octobre 2026, `api.fedapay.com` est protégé par Cloudflare :
 * une requête serveur SANS User-Agent navigateur reçoit une page HTML
 * « Just a moment… » avec un 403 — AVANT d'atteindre l'API FedaPay
 * (constaté en production le 11/11 : `[fedapay] HTTP 403` sur toutes les
 * créations de transaction, y compris avec une clé live valide ; le
 * sandbox `sandbox-api.fedapay.com` n'est pas concerné). On envoie donc
 * explicitement un User-Agent de navigateur sur CHAQUE appel, comme le
 * fait le guichet lui-même. Ne jamais retirer cet en-tête.
 */
const EN_TETE_NAVIGATEUR =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

/** Environnement FedaPay courant ('sandbox' par défaut). */
export function fedapayEnv(): 'sandbox' | 'live' {
  return process.env.FEDAPAY_ENV?.trim().toLowerCase() === 'live'
    ? 'live'
    : 'sandbox';
}

/** Clé secrète FedaPay, ou null si absente. */
export function cleFedapay(): string | null {
  // La clé de l'environnement COURANT est prioritaire : elle évite qu'un
  // passage en sandbox n'utilise la clé live (et inversement). Repli sur
  // la clé générique pour les configurations mono-environnement.
  const specifique =
    fedapayEnv() === 'live'
      ? process.env.FEDAPAY_LIVE_SECRET_KEY
      : process.env.FEDAPAY_SANDBOX_SECRET_KEY;
  return (
    specifique?.trim() || process.env.FEDAPAY_SECRET_KEY?.trim() || null
  );
}

/**
 * Vrai si la clé correspond bien à l'environnement demandé.
 *
 * Garde-fou anti-erreur-humaine : une clé `sk_live_` envoyée à l'API
 * sandbox (ou l'inverse) échoue de toute façon en 401, mais surtout une
 * clé live utilisée « pour tester » débite de l'argent réel. On refuse
 * donc explicitement l'incohérence au lieu de la laisser passer.
 */
export function cleCoherente(
  mode: ModePaiement,
  cle: string | null
): boolean {
  if (!cle) return false;
  if (mode === 'simulation') return false;
  const live = cle.startsWith('sk_live_');
  const sandbox = cle.startsWith('sk_sandbox_') || cle.startsWith('sk_sandb');
  if (!live && !sandbox) return true; // format inconnu : on ne bloque pas
  return mode === 'live' ? live : sandbox;
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

/**
 * Analyse l'en-tête `X-FEDAPAY-SIGNATURE`.
 *
 * Format OFFICIEL (cf. bibliothèque `fedapay/lib/Webhook.ts`) :
 *   `t=<horodatage_unix>,s=<hmac_hex>[,s=<hmac_hex>…]`
 * Le HMAC-SHA256 porte sur la chaîne `"<horodatage>.<corps_brut>"`.
 *
 * On tolère aussi l'ancien format d'un HMAC hex nu (aucun `t=`/`s=`).
 */
export function analyserEnteteSignature(entete: string): {
  horodatage: number | null;
  signatures: string[];
} {
  const brut = (entete ?? '').trim();
  const t = /(?:^|,)\s*t=(\d+)/.exec(brut);
  const signatures = [...brut.matchAll(/(?:^|,)\s*s=([^,\s]+)/g)].map((m) => m[1]);
  return {
    horodatage: t ? Number(t[1]) : null,
    signatures,
  };
}

/**
 * Extrait notre référence interne d'une entité transaction FedaPay.
 * Ordre de recherche :
 *   1. `merchant_reference` — le champ OFFICIEL (notre identifiant) ;
 *   2. `custom_metadata.reference_interne` — notre copie de secours ;
 *   3. `metadata.reference_interne` — ANCIEN format, conservé pour les
 *      transactions historiques (au cas où FedaPay le renverrait).
 * ⚠ On ne retombe JAMAIS sur `entite.reference` (= référence FedaPay,
 *   PAS la nôtre) : c'est ce qui provoquait les faux « Paiement inconnu ».
 */
export function extraireReferenceInterne(
  entite: Record<string, unknown>
): string | null {
  const mr = entite.merchant_reference;
  if (typeof mr === 'string' && mr.trim()) return mr.trim();
  const cm = (entite.custom_metadata ?? {}) as Record<string, unknown>;
  if (typeof cm.reference_interne === 'string' && cm.reference_interne.trim()) {
    return cm.reference_interne.trim();
  }
  const md = (entite.metadata ?? {}) as Record<string, unknown>;
  if (typeof md.reference_interne === 'string' && md.reference_interne.trim()) {
    return md.reference_interne.trim();
  }
  return null;
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
    if (!cleCoherente(this.mode, cle)) {
      throw new Error(
        `[fedapay] Configuration incohérente : l'environnement est « ${this.mode} » ` +
          'mais la clé fournie appartient à l’autre environnement. ' +
          'Renseignez FEDAPAY_LIVE_SECRET_KEY (mode live) ou ' +
          'FEDAPAY_SANDBOX_SECRET_KEY (mode sandbox) — aucun appel n’est ' +
          'envoyé, pour ne jamais débiter en réel par erreur.'
      );
    }
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 20_000);
    try {
      const reponse = await fetch(`${this.apiBase()}${chemin}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${cle}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Cloudflare (API live) défie le trafic sans UA navigateur.
          'User-Agent': EN_TETE_NAVIGATEUR,
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
        if (typeof donnees.message === 'string') {
          throw new Error(`[fedapay] ${donnees.message}`);
        }
        // Réponse NON JSON (pare-feu / challenge / passerelle) : on joint
        // un extrait du corps pour diagnostiquer d'un coup d'œil dans les
        // logs — ex. « Just a moment… » = blocage Cloudflare, et non une
        // erreur de clé ni de compte.
        const extrait = texte.replace(/\s+/g, ' ').trim().slice(0, 160);
        throw new Error(
          `[fedapay] HTTP ${reponse.status} sans corps JSON` +
            (extrait ? ` — réponse : « ${extrait} »` : '')
        );
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
      // RÉCONCILIATION (P0.9+) — champs OFFICIELS FedaPay.
      //
      //   * merchant_reference : NOTRE identifiant UNIQUE et STABLE de
      //     paiement (la référence interne PLU-…). Il est CONSERVÉ par
      //     FedaPay, RENVOYÉ tel quel dans le webhook, et interrogeable
      //     via GET /transactions/merchant/{reference}. C'est LUI qui
      //     permet de retrouver le paiement à la réception du webhook.
      //   * custom_metadata : la même info en secours (non sensible).
      //
      // ⚠ NE PAS utiliser le champ `metadata` : c'est un champ SYSTÈME
      //   FedaPay (il porte p.ex. `expire_schedule_jobid`) — nos valeurs
      //   y sont ÉCRASÉES et ne reviennent JAMAIS dans le webhook, d'où
      //   le fameux « Paiement inconnu » et les crédits jamais livrés.
      merchant_reference: demande.reference,
      custom_metadata: {
        reference_interne: demande.reference,
        plan: demande.plan,
        fournisseur: this.id,
      },
      customer: {
        ...(demande.prenom ? { firstname: demande.prenom } : {}),
        ...(demande.nom ? { lastname: demande.nom } : {}),
        ...(demande.email ? { email: demande.email } : {}),
        // Le numéro n'est joint que pour Mobile Money : une carte bancaire
        // se paie sans téléphone (FedaPay n'exige pas ce champ).
        ...(demande.telephone
          ? {
              phone_number: {
                number: demande.telephone,
                ...(demande.pays ? { country: demande.pays } : {}),
              },
            }
          : {}),
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
   * corps BRUT avec le secret d'endpoint et l'expose dans l'en-tête
   * `X-FEDAPAY-SIGNATURE`.
   *
   * Le secret `FEDAPAY_WEBHOOK_SECRET` est RÉCUPÉRÉ par Carrel dans le
   * tableau de bord FedaPay : « Développeurs » → onglet « Webhooks » →
   * ouvrir l'endpoint qui pointe vers `…/api/paiement/webhook` → bouton
   * « Copier la clé » (valeur `wh_live_…` en production, `wh_sandbox_…`
   * en test — CE SONT DEUX SECRETS DIFFÉRENTS). Une fois renseigné dans
   * `.env.local` (et dans les variables de l'hébergeur), les webhooks
   * sont signés et cette vérification passe.
   *
   * ÉCHEC FERMÉ : renvoie `false` si le secret OU l'en-tête manquent,
   * ou si la signature ne correspond pas. Comparaison à TEMPS CONSTANT.
   */
  verifierSignature(
    chargeBrute: string,
    entetes: { get(nom: string): string | null }
  ): boolean {
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET?.trim();
    if (!secret) return false; // échec fermé : pas de secret → refus.
    const fourni =
      entetes.get('x-fedapay-signature') ??
      entetes.get('X-FEDAPAY-SIGNATURE') ??
      entetes.get('x-signature');
    if (!fourni) return false; // échec fermé : pas d'en-tête → refus.

    const { horodatage, signatures } = analyserEnteteSignature(fourni);

    // Format OFFICIEL : HMAC sur "<horodatage>.<corps brut>".
    if (horodatage !== null && signatures.length > 0) {
      const attendu = createHmac('sha256', secret)
        .update(`${horodatage}.${chargeBrute}`, 'utf8')
        .digest('hex');
      return signatures.some((s) => egalConstant(s, attendu));
    }

    // Compatibilité : ancien envoi d'un HMAC hex nu sur le corps.
    const nu = fourni.replace(/^sha256=/i, '').trim();
    const attenduNu = createHmac('sha256', secret)
      .update(chargeBrute, 'utf8')
      .digest('hex');
    return egalConstant(nu, attenduNu);
  }

  /** Vrai si le secret de signature du webhook est configuré côté serveur. */
  webhookConfigure(): boolean {
    return !!process.env.FEDAPAY_WEBHOOK_SECRET?.trim();
  }

  /**
   * Relit une transaction par NOTRE référence (`merchant_reference`) via
   * `GET /transactions/merchant/{reference}`. Sert à la réconciliation et
   * aux tests (relecture par référence). Renvoie null si introuvable.
   */
  async retrouverParReferenceMarquand(
    reference: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const donnees = await this.appel(
        `/transactions/merchant/${encodeURIComponent(reference)}`,
        { method: 'GET' }
      );
      const tx = FedaPayFournisseur.transaction(donnees);
      return tx && Object.keys(tx).length > 0 ? tx : null;
    } catch {
      return null;
    }
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
    // Référence interne : merchant_reference d'abord (plus jamais de faux
    // « Paiement inconnu »), puis custom_metadata, puis ancien metadata.
    const referenceInterne = extraireReferenceInterne(entite);
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
