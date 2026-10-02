// ============================================================
// lib/rate-limit.ts — Limitation de débit serveur (P0.3).
//
// Objectif : freiner les appels à /api/translate, aujourd'hui
// illimités. La clé est le COMPTE authentifié quand il existe,
// sinon l'ADRESSE IP de l'appelant (visiteurs anonymes).
//
// Fenêtre GLISSANTE : on horodate chaque appel autorisé et on
// recompte ceux des `fenetreS` dernières secondes. Le stockage par
// défaut est Supabase (table public.rate_limit_hits + fonction
// public.consommer_rate_limit, voir la migration) : un cache
// mémoire NE SUFFIT PAS en production (fonctions serverless
// Next.js/Netlify : mémoire non partagée entre instances, réinitialisée
// à chaque démarrage à froid → un attaquant contournerait la limite
// en touchant plusieurs instances). Le magasin mémoire reste fourni
// pour les tests unitaires déterministes.
//
// Le module ne dépend PAS de @supabase/ssr : il parle à n'importe
// quel client exposant .rpc(nom, args).
// ============================================================

/** Interface minimale d'un client Supabase (ou substitut de test). */
export interface AppelRpc {
  (nom: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}
export interface ClientRpc {
  rpc: AppelRpc;
}

/** Résultat d'une consommation de jeton de débit. */
export interface EtatRateLimit {
  autorise: boolean;
  /** Plafond autorisé sur la fenêtre. */
  limite: number;
  /** Requêtes encore disponibles (0 si refusé). */
  restant: number;
  /** Fin de la fenêtre courante (epoch, secondes). */
  reset: number;
  /** Clé utilisée (« user:<uuid> » ou « ip:<adresse> »). */
  cle: string;
}

/** Magasin de comptage — implémentations mémoire et Supabase. */
export interface MagasinRateLimit {
  consommer(
    cle: string,
    fenetreS: number,
    limite: number
  ): Promise<Omit<EtatRateLimit, 'cle'>>;
}

export interface OptionsRateLimit {
  fenetreS: number;
  limiteCompte: number;
  limiteIp: number;
}

function entierEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  const valeur = brut === undefined ? NaN : Number.parseInt(brut, 10);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : defaut;
}

/** Options lues dans l'environnement (défauts sûrs). */
export function optionsRateLimit(): OptionsRateLimit {
  return {
    fenetreS: entierEnv('RATE_LIMIT_FENETRE_S', 60),
    limiteCompte: entierEnv('RATE_LIMIT_COMPTE_MAX', 120),
    limiteIp: entierEnv('RATE_LIMIT_IP_MAX', 30),
  };
}

/** Clé de comptage : compte authentifié prioritaire, sinon IP. */
export function cleRateLimit(ctx: {
  userId?: string | null;
  ip?: string | null;
}): string {
  if (ctx.userId) return `user:${ctx.userId}`;
  return `ip:${ctx.ip && ctx.ip.trim() ? ctx.ip.trim() : 'inconnue'}`;
}

/** Extrait l'IP cliente des en-têtes de proxy usuels. */
export function extraireIp(request: {
  headers: { get(nom: string): string | null };
}): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const premier = xff.split(',')[0]?.trim();
    if (premier) return premier;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-nf-client-connection-ip') ??
    'inconnue'
  );
}

/** Limite courante selon la nature de l'appelant. */
export function limitePour(
  ctx: { userId?: string | null },
  options: OptionsRateLimit
): number {
  return ctx.userId ? options.limiteCompte : options.limiteIp;
}

// ------------------------------------------------------------
// Magasin mémoire (fenêtre glissante par journal d'horodatages).
// ------------------------------------------------------------
export class MagasinRateLimitMemoire implements MagasinRateLimit {
  private readonly hits = new Map<string, number[]>();
  private readonly horloge: () => number;

  /** `horloge` injectable : les tests avancent le temps sans attendre. */
  constructor(horloge: () => number = () => Date.now()) {
    this.horloge = horloge;
  }

  async consommer(
    cle: string,
    fenetreS: number,
    limite: number
  ): Promise<Omit<EtatRateLimit, 'cle'>> {
    const maintenant = this.horloge();
    const debut = maintenant - fenetreS * 1000;
    const journal = (this.hits.get(cle) ?? []).filter((t) => t >= debut);

    if (limite <= 0 || journal.length >= limite) {
      this.hits.set(cle, journal);
      const reset = journal.length
        ? Math.ceil((journal[0] + fenetreS * 1000) / 1000)
        : Math.ceil((maintenant + fenetreS * 1000) / 1000);
      return { autorise: false, limite: Math.max(limite, 0), restant: 0, reset };
    }

    journal.push(maintenant);
    this.hits.set(cle, journal);
    return {
      autorise: true,
      limite,
      restant: Math.max(limite - journal.length, 0),
      reset: Math.ceil((journal[0] + fenetreS * 1000) / 1000),
    };
  }
}

// ------------------------------------------------------------
// Magasin Supabase (durable, partagé entre instances serverless).
// ------------------------------------------------------------
export class MagasinRateLimitSupabase implements MagasinRateLimit {
  private readonly client: ClientRpc;
  constructor(client: ClientRpc) {
    this.client = client;
  }

  async consommer(
    cle: string,
    fenetreS: number,
    limite: number
  ): Promise<Omit<EtatRateLimit, 'cle'>> {
    const { data, error } = await this.client.rpc('consommer_rate_limit', {
      p_cle: cle,
      p_fenetre_s: fenetreS,
      p_limite: limite,
    });
    if (error) throw new Error(`rate-limit (Supabase) : ${error.message}`);
    const ligne = (Array.isArray(data) ? data[0] : data) as
      | { autorise: boolean; limite: number; restant: number; reset_epoch: number }
      | undefined;
    if (!ligne) throw new Error('rate-limit (Supabase) : réponse vide');
    return {
      autorise: Boolean(ligne.autorise),
      limite: Number(ligne.limite),
      restant: Number(ligne.restant),
      reset: Number(ligne.reset_epoch),
    };
  }
}

/** Consomme un jeton pour l'appelant et renvoie son état. */
export async function limiterRequete(
  magasin: MagasinRateLimit,
  ctx: { userId?: string | null; ip?: string | null },
  options: OptionsRateLimit = optionsRateLimit()
): Promise<EtatRateLimit> {
  const cle = cleRateLimit(ctx);
  const limite = limitePour(ctx, options);
  const etat = await magasin.consommer(cle, options.fenetreS, limite);
  return { ...etat, cle };
}

/** En-têtes standard de limitation (IETF draft-ietf-httpapi-ratelimit). */
export function entetesRateLimit(
  etat: EtatRateLimit,
  maintenantMs: number = Date.now()
): Record<string, string> {
  const entetes: Record<string, string> = {
    'X-RateLimit-Limit': String(etat.limite),
    'X-RateLimit-Remaining': String(etat.restant),
    'X-RateLimit-Reset': String(etat.reset),
  };
  if (!etat.autorise) {
    const attente = Math.max(etat.reset - Math.floor(maintenantMs / 1000), 1);
    entetes['Retry-After'] = String(attente);
  }
  return entetes;
}

/** Code d'erreur machine dédié au dépassement de débit. */
export const CODE_RATE_LIMIT_DEPASSE = 'RATE_LIMIT_DEPASSE';
