// ============================================================
// lib/quota.ts — Quota mensuel de traduction par compte (P0.2).
//
// On mesure les CARACTÈRES SOUMIS À TRADUCTION (longueur du texte
// envoyé au fournisseur) : c'est la charge réellement facturée par
// les moteurs, et cela permet de VÉRIFIER AVANT d'appeler le moteur.
// L'usage est persisté par compte et par mois civil dans
// public.usage_mensuel (via la fonction public.reserver_quota) :
// durable, atomique (réservation avant traduction, libération en cas
// d'échec) et partagé entre instances serverless.
//
// lireUsageQuota() expose (utilisé, limite, période) pour l'affichage
// futur côté UI.
// ============================================================

import type { ClientRpc } from './rate-limit';

/** Code d'erreur machine dédié au dépassement de quota. */
export const CODE_QUOTA_DEPASSE = 'QUOTA_DEPASSE';

export interface PeriodeQuota {
  /** Premier jour du mois (YYYY-MM-DD). */
  debut: string;
  /** Dernier jour du mois (YYYY-MM-DD). */
  fin: string;
}

export interface UsageQuota {
  /** Caractères déjà consommés sur la période. */
  utilise: number;
  /** Plafond mensuel (caractères). */
  limite: number;
  periode: PeriodeQuota;
}

export interface ReservationQuota extends UsageQuota {
  autorise: boolean;
  /** Renseigné seulement en cas de refus. */
  code?: string;
  message?: string;
}

/** Magasin d'usage — implémentations mémoire et Supabase. */
export interface MagasinQuota {
  lire(proprietaireId: string, periodeCle: string): Promise<number>;
  reserver(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number,
    limite: number
  ): Promise<{ autorise: boolean; utilise: number; limite: number }>;
  liberer(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number
  ): Promise<void>;
}

function deuxChiffres(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Période = mois civil en UTC.
 * `cle` sert de date de référence (1er du mois) ; `debut`/`fin` sont
 * exposés pour l'affichage.
 */
export function periodeMois(maintenant: Date = new Date()): PeriodeQuota & {
  cle: string;
} {
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth();
  const debut = new Date(Date.UTC(annee, mois, 1));
  const fin = new Date(Date.UTC(annee, mois + 1, 0)); // dernier jour du mois
  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${deuxChiffres(d.getUTCMonth() + 1)}-${deuxChiffres(
      d.getUTCDate()
    )}`;
  return { cle: iso(debut), debut: iso(debut), fin: iso(fin) };
}

/** Plafond mensuel, lisible depuis l'environnement. */
export function quotaMensuel(): number {
  const brut = process.env.QUOTA_MENSUEL_CARACTERES;
  const valeur = brut === undefined ? NaN : Number.parseInt(brut, 10);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : 500_000;
}

function messageQuotaDepasse(usage: UsageQuota): string {
  return (
    `Quota mensuel de traduction dépassé : ${usage.utilise}/${usage.limite} ` +
    `caractères utilisés sur la période du ${usage.periode.debut} au ` +
    `${usage.periode.fin}. Le quota se recharge le mois prochain — et un ` +
    'pack de crédits prépayés permet de continuer tout de suite, sans ' +
    'abonnement.'
  );
}

/** Renvoie (utilisé, limite, période) — pour l'affichage futur. */
export async function lireUsageQuota(
  magasin: MagasinQuota,
  proprietaireId: string,
  maintenant: Date = new Date(),
  limite: number = quotaMensuel()
): Promise<UsageQuota> {
  const periode = periodeMois(maintenant);
  const utilise = await magasin.lire(proprietaireId, periode.cle);
  return { utilise, limite, periode: { debut: periode.debut, fin: periode.fin } };
}

/**
 * Réserve `caracteres` sur le quota du compte. Atomique : si la
 * réservation échoue, aucun caractère n'est décompté.
 */
export async function reserverQuota(
  magasin: MagasinQuota,
  proprietaireId: string,
  caracteres: number,
  maintenant: Date = new Date(),
  limite: number = quotaMensuel()
): Promise<ReservationQuota> {
  const periode = periodeMois(maintenant);
  const resultat = await magasin.reserver(
    proprietaireId,
    periode.cle,
    caracteres,
    limite
  );
  const usage: UsageQuota = {
    utilise: resultat.utilise,
    limite: resultat.limite,
    periode: { debut: periode.debut, fin: periode.fin },
  };
  if (!resultat.autorise) {
    return {
      autorise: false,
      ...usage,
      code: CODE_QUOTA_DEPASSE,
      message: messageQuotaDepasse(usage),
    };
  }
  return { autorise: true, ...usage };
}

/** Libère des caractères réservés (traduction échouée). */
export async function libererQuota(
  magasin: MagasinQuota,
  proprietaireId: string,
  caracteres: number,
  maintenant: Date = new Date()
): Promise<void> {
  const periode = periodeMois(maintenant);
  await magasin.liberer(proprietaireId, periode.cle, caracteres);
}

// ------------------------------------------------------------
// Magasin mémoire (tests unitaires).
// ------------------------------------------------------------
export class MagasinQuotaMemoire implements MagasinQuota {
  private readonly usages = new Map<string, number>();

  private cle(proprietaireId: string, periodeCle: string): string {
    return `${proprietaireId}@${periodeCle}`;
  }

  async lire(proprietaireId: string, periodeCle: string): Promise<number> {
    return this.usages.get(this.cle(proprietaireId, periodeCle)) ?? 0;
  }

  async reserver(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number,
    limite: number
  ): Promise<{ autorise: boolean; utilise: number; limite: number }> {
    const k = this.cle(proprietaireId, periodeCle);
    const utilise = this.usages.get(k) ?? 0;
    const demande = Math.max(caracteres, 0);
    if (utilise + demande > limite) {
      return { autorise: false, utilise, limite };
    }
    const apres = utilise + demande;
    this.usages.set(k, apres);
    return { autorise: true, utilise: apres, limite };
  }

  async liberer(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number
  ): Promise<void> {
    const k = this.cle(proprietaireId, periodeCle);
    const utilise = this.usages.get(k) ?? 0;
    this.usages.set(k, Math.max(utilise - Math.max(caracteres, 0), 0));
  }
}

// ------------------------------------------------------------
// Magasin Supabase (durable, atomique via public.reserver_quota).
// ------------------------------------------------------------
export class MagasinQuotaSupabase implements MagasinQuota {
  private readonly client: ClientRpc;
  constructor(client: ClientRpc) {
    this.client = client;
  }

  async lire(proprietaireId: string, periodeCle: string): Promise<number> {
    const { data, error } = await this.client.rpc('lire_usage_quota', {
      p_proprietaire: proprietaireId,
      p_periode: periodeCle,
    });
    if (error) throw new Error(`quota (Supabase) : ${error.message}`);
    return Number(data ?? 0);
  }

  async reserver(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number,
    limite: number
  ): Promise<{ autorise: boolean; utilise: number; limite: number }> {
    const { data, error } = await this.client.rpc('reserver_quota', {
      p_proprietaire: proprietaireId,
      p_periode: periodeCle,
      p_caracteres: caracteres,
      p_limite: limite,
    });
    if (error) throw new Error(`quota (Supabase) : ${error.message}`);
    const ligne = (Array.isArray(data) ? data[0] : data) as
      | { autorise: boolean; utilise: number; limite: number }
      | undefined;
    if (!ligne) throw new Error('quota (Supabase) : réponse vide');
    return {
      autorise: Boolean(ligne.autorise),
      utilise: Number(ligne.utilise),
      limite: Number(ligne.limite),
    };
  }

  async liberer(
    proprietaireId: string,
    periodeCle: string,
    caracteres: number
  ): Promise<void> {
    const { error } = await this.client.rpc('liberer_quota', {
      p_proprietaire: proprietaireId,
      p_periode: periodeCle,
      p_caracteres: caracteres,
    });
    if (error) throw new Error(`quota (Supabase) : ${error.message}`);
  }
}
