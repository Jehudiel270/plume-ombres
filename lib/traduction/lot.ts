// ============================================================
// lib/traduction/lot.ts — Traitement d'un LOT de segments.
//
// Objectif : ne plus payer trois allers-retours Supabase PAR SEGMENT
// (authentification, débit, quota), mais UNE fois par lot, puis
// traduire plusieurs segments en parallèle côté serveur.
//
// Ce module est la SEULE implémentation du traitement d'un lot :
// la route `POST /api/translate/lot` et le worker de persistance
// l'appellent tous les deux (jamais une copie).
//
// Invariants tenus ici :
//  • une authentification par lot (ouvrirSession) ;
//  • un seul comptage de débit par lot ;
//  • une seule réservation de quota, pour la SOMME des caractères
//    réellement tentés (les segments hors seuil ne sont pas réservés) ;
//  • une seule libération, pour la somme des caractères des segments
//    tentés qui ont échoué ;
//  • 8 traductions en parallèle par défaut ;
//  • aucun nom de fournisseur dans un message destiné à l'utilisateur.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import {
  traduireAvecSecours,
  ErreurChaineSecours,
  modePriveStrict,
  type CategorieEchec,
  type OptionsTraduction,
  type ResultatTraductionSecours,
} from '@/lib/providers';
import { construireDirectives } from '@/lib/glossaire';
import type { PaireGlossaire } from '@/lib/types';
import {
  MagasinRateLimitSupabase,
  limiterRequete,
  entetesRateLimit,
  extraireIp,
  optionsRateLimit,
  type ClientRpc,
  type EtatRateLimit,
} from '@/lib/rate-limit';

// ------------------------------------------------------------
// Seuils du contrat d'API
// ------------------------------------------------------------

/** Nombre maximal de segments dans un lot. */
export const MAX_SEGMENTS_LOT = 40;
/** Nombre maximal de caractères (somme des segments) dans un lot. */
export const MAX_CARACTERES_LOT = 20_000;
/** Longueur maximale d'un segment ; au-delà, il part en échec « long ». */
export const MAX_CARACTERES_SEGMENT = 6_000;
/** Appels moteur simultanés côté serveur. */
export const CONCURRENCE_LOT = 8;

/** Budgets de directives (identiques à la route mono-segment). */
const MAX_PAIRES_GLOSSAIRE = 300;
const MAX_DIRECTIVES = 4_000;
const MAX_CONTEXTE = 4_000;

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------

export interface SegmentLot {
  id: string;
  texte: string;
  contexte?: string;
}

/** Motif d'échec d'un segment — vocabulaire du contrat. */
export type RaisonEchecLot = 'long' | 'vide' | 'limite' | 'indisponible' | 'echec';

export interface ResultatSegmentLot {
  id: string;
  traduit: string;
  /** Identifiant technique du moteur réellement utilisé. */
  fournisseur: string;
  essais: number;
}

export interface EchecSegmentLot {
  id: string;
  raison: RaisonEchecLot;
  message: string;
}

export interface ResultatLotSegments {
  resultats: ResultatSegmentLot[];
  echecs: EchecSegmentLot[];
}

/** Fonction de traduction injectable (les tests n'appellent pas le réseau). */
export type TraducteurLot = (
  texte: string,
  options: OptionsTraduction
) => Promise<ResultatTraductionSecours>;

export interface OptionsLotSegments {
  source: string;
  cible: string;
  glossaire?: PaireGlossaire[];
  /** Appels moteur simultanés (1..16 ; 8 par défaut). */
  concurrence?: number;
  /**
   * Libère des caractères de quota déjà réservés.
   * Appelée UNE seule fois, avec la somme des caractères des segments
   * tentés qui ont échoué. Les segments jamais tentés (trop longs,
   * vides) ne sont jamais réservés : ils ne sont donc pas libérés.
   */
  libererCaracteres?: (caracteres: number) => Promise<void>;
  /** Substitut de la chaîne de secours (tests). */
  traduire?: TraducteurLot;
}

/** Messages destinés à l'utilisateur : aucun nom de fournisseur. */
/** Formate un entier à la française : 20000 → « 20 000 ». */
function formaterEntier(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

const MESSAGE_LONG = `Segment trop long : ${formaterEntier(
  MAX_CARACTERES_SEGMENT
)} caractères au maximum par segment.`;
const MESSAGE_VIDE = 'Segment vide : rien à traduire.';
const MESSAGE_LIMITE =
  'Service de traduction momentanément saturé. Réessayez dans un instant.';
const MESSAGE_INDISPONIBLE =
  'Traduction momentanément indisponible pour ce segment. Réessayez plus tard.';
const MESSAGE_ECHEC = 'Ce segment n’a pas pu être traduit. Réessayez plus tard.';

// ------------------------------------------------------------
// Validation d'un lot (pure, sans réseau)
// ------------------------------------------------------------

export interface LotValide {
  ok: true;
  source: string;
  cible: string;
  segments: SegmentLot[];
  glossaire: PaireGlossaire[];
  /** Caractères à réserver : somme des segments réellement tentés. */
  caracteresRetenus: number;
  /** Identifiants des segments hors seuil de longueur. */
  idsTropLongs: string[];
}

export interface LotRefuse {
  ok: false;
  /** Code HTTP à renvoyer (400 pour toutes les règles de forme). */
  statut: number;
  erreur: string;
}

export type AnalyseLot = LotValide | LotRefuse;

function chaine(valeur: unknown): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

/**
 * Valide la forme d'un corps de requête de lot : champs obligatoires,
 * lot non vide, ≤ 40 segments, ≤ 20 000 caractères au total.
 *
 * Ne rejette PAS un segment trop long : il est signalé (idsTropLongs)
 * et sortira dans `echecs` avec la raison « long », sans consommer de
 * quota.
 */
export function analyserLot(corps: unknown): AnalyseLot {
  if (corps === null || typeof corps !== 'object') {
    return { ok: false, statut: 400, erreur: 'Corps de requête invalide.' };
  }
  const objet = corps as Record<string, unknown>;

  const source = chaine(objet.source)?.trim() ?? '';
  const cible = chaine(objet.cible)?.trim() ?? '';
  if (!source || !cible) {
    return {
      ok: false,
      statut: 400,
      erreur: 'Paramètres manquants (source, cible).',
    };
  }

  const brut = objet.segments;
  if (!Array.isArray(brut) || brut.length === 0) {
    return { ok: false, statut: 400, erreur: 'Lot vide : aucun segment à traduire.' };
  }
  if (brut.length > MAX_SEGMENTS_LOT) {
    return {
      ok: false,
      statut: 400,
      erreur: `Lot trop grand : ${formaterEntier(MAX_SEGMENTS_LOT)} segments au maximum.`,
    };
  }

  const segments: SegmentLot[] = [];
  for (const element of brut) {
    if (element === null || typeof element !== 'object') {
      return {
        ok: false,
        statut: 400,
        erreur: 'Lot invalide : chaque segment doit avoir un identifiant et un texte.',
      };
    }
    const ligne = element as Record<string, unknown>;
    const id = chaine(ligne.id)?.trim() ?? '';
    const texte = chaine(ligne.texte);
    if (!id || texte === null) {
      return {
        ok: false,
        statut: 400,
        erreur: 'Lot invalide : chaque segment doit avoir un identifiant et un texte.',
      };
    }
    const contexte = chaine(ligne.contexte) ?? undefined;
    segments.push({
      id,
      texte: texte.trim(),
      ...(contexte && contexte.trim() ? { contexte: contexte.trim().slice(0, MAX_CONTEXTE) } : {}),
    });
  }

  const total = segments.reduce((somme, s) => somme + s.texte.length, 0);
  if (total > MAX_CARACTERES_LOT) {
    return {
      ok: false,
      statut: 400,
      erreur: `Lot trop long : ${formaterEntier(
        MAX_CARACTERES_LOT
      )} caractères au maximum par lot.`,
    };
  }

  const idsTropLongs = segments
    .filter((s) => s.texte.length > MAX_CARACTERES_SEGMENT)
    .map((s) => s.id);
  const caracteresRetenus = segments
    .filter((s) => s.texte.length > 0 && s.texte.length <= MAX_CARACTERES_SEGMENT)
    .reduce((somme, s) => somme + s.texte.length, 0);

  return {
    ok: true,
    source,
    cible,
    segments,
    glossaire: normaliserGlossaire(objet.glossaire),
    caracteresRetenus,
    idsTropLongs,
  };
}

/** Glossaire tolérant : paires non vides uniquement, bornées. */
export function normaliserGlossaire(valeur: unknown): PaireGlossaire[] {
  if (!Array.isArray(valeur)) return [];
  const paires: PaireGlossaire[] = [];
  for (const element of valeur) {
    if (element === null || typeof element !== 'object') continue;
    const ligne = element as Record<string, unknown>;
    const source = chaine(ligne.source)?.trim() ?? '';
    const traduction = chaine(ligne.traduction)?.trim() ?? '';
    if (!source || !traduction) continue;
    paires.push({ source, traduction });
    if (paires.length >= MAX_PAIRES_GLOSSAIRE) break;
  }
  return paires;
}

// ------------------------------------------------------------
// Session : authentification + débit (une fois par lot)
// ------------------------------------------------------------

/** Requête minimale attendue (compatible NextRequest, substituable en test). */
export interface RequeteLot {
  headers: { get(nom: string): string | null };
  cookies: { getAll(): Array<{ name: string; value: string }> };
}

export interface SessionLot {
  /** Compte authentifié, ou null. */
  userId: string | null;
  /** Client adapté aux magasins débit/quota. */
  clientRpc: ClientRpc;
  /** État du débit (null si le magasin a échoué : on laisse passer). */
  debit: EtatRateLimit | null;
  /** En-têtes de débit à joindre à la réponse. */
  entetesDebit: Record<string, string>;
  /** Adresse IP extraite (journalisation / clé de débit anonyme). */
  ip: string;
}

/**
 * Ouvre la session d'un lot : UNE authentification (cookie ou jeton
 * Bearer) puis UN SEUL comptage de débit. Aucune RPC de quota ici :
 * la réservation est faite par l'appelant, une seule fois, quand il
 * connaît la somme des caractères du lot.
 */
export async function ouvrirSession(request: RequeteLot): Promise<SessionLot> {
  const ip = extraireIp(request);
  const porteur = request.headers.get('authorization');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {
          /* lecture seule : pas de session à créer ici */
        },
      },
    }
  );

  const {
    data: { user },
  } = porteur?.startsWith('Bearer ')
    ? await supabase.auth.getUser(porteur.slice('Bearer '.length))
    : await supabase.auth.getUser();

  const clientRpc: ClientRpc = {
    rpc: (nom, args) => supabase.rpc(nom, args),
  };

  let debit: EtatRateLimit | null = null;
  try {
    debit = await limiterRequete(
      new MagasinRateLimitSupabase(clientRpc),
      { userId: user?.id ?? null, ip },
      optionsRateLimit()
    );
  } catch (erreur) {
    // Panne du magasin de débit : on laisse passer (disponibilité),
    // l'authentification restant la barrière d'accès.
    console.warn(
      '[rate-limit] magasin indisponible, lot laissé passer :',
      erreur instanceof Error ? erreur.message : erreur
    );
  }

  return {
    userId: user?.id ?? null,
    clientRpc,
    debit,
    entetesDebit: debit ? entetesRateLimit(debit) : {},
    ip,
  };
}

// ------------------------------------------------------------
// Exécution parallèle bornée
// ------------------------------------------------------------

/**
 * Exécute `tache` sur chaque élément avec au plus `concurrence`
 * exécutions simultanées. L'ordre des résultats suit celui des
 * éléments (jamais celui d'arrivée).
 */
export async function enParalleleBorne<T, R>(
  elements: readonly T[],
  concurrence: number,
  tache: (element: T, index: number) => Promise<R>
): Promise<R[]> {
  const resultats = new Array<R>(elements.length);
  const largeur = Math.max(1, Math.min(Math.floor(concurrence) || 1, elements.length || 1));
  let prochain = 0;
  const ouvriers = Array.from({ length: largeur }, async () => {
    for (;;) {
      const index = prochain;
      prochain += 1;
      if (index >= elements.length) return;
      resultats[index] = await tache(elements[index], index);
    }
  });
  await Promise.all(ouvriers);
  return resultats;
}

// ------------------------------------------------------------
// Traduction d'un lot
// ------------------------------------------------------------

/** Traducteur par défaut : la chaîne de secours réelle. */
function traduireParDefaut(
  texte: string,
  options: OptionsTraduction
): Promise<ResultatTraductionSecours> {
  return traduireAvecSecours(texte, options);
}

/** Raison d'échec d'un segment, déduite des catégories de la chaîne. */
function raisonDepuisEchecs(
  echecs: ReadonlyArray<{ categorie: CategorieEchec }>
): RaisonEchecLot {
  if (echecs.length > 0 && echecs.every((e) => e.categorie === 'quota')) return 'limite';
  return 'indisponible';
}

function messageDepuisRaison(raison: RaisonEchecLot): string {
  switch (raison) {
    case 'long':
      return MESSAGE_LONG;
    case 'vide':
      return MESSAGE_VIDE;
    case 'limite':
      return MESSAGE_LIMITE;
    case 'indisponible':
      return modePriveStrict()
        ? 'Le moteur privé est momentanément indisponible. Réessayez plus tard.'
        : MESSAGE_INDISPONIBLE;
    default:
      return MESSAGE_ECHEC;
  }
}

/**
 * Traduit un lot de segments : une réservation de quota en amont
 * (faite par l'appelant), `concurrence` traductions simultanées, puis
 * UNE libération pour la somme des caractères des segments tentés qui
 * ont échoué.
 *
 * Ne lève jamais pour un segment : tout échec sort dans `echecs`.
 */
export async function traiterLotSegments(
  segments: SegmentLot[],
  options: OptionsLotSegments
): Promise<ResultatLotSegments> {
  const concurrence = Math.max(
    1,
    Math.min(Math.floor(options.concurrence ?? CONCURRENCE_LOT), 16)
  );
  const traduire = options.traduire ?? traduireParDefaut;
  const glossaire = options.glossaire ?? [];

  const issues = await enParalleleBorne(segments, concurrence, async (segment) => {
    const texte = segment.texte.trim();
    if (texte.length === 0) {
      return { type: 'echec' as const, id: segment.id, raison: 'vide' as const, caracteres: 0 };
    }
    if (texte.length > MAX_CARACTERES_SEGMENT) {
      return { type: 'echec' as const, id: segment.id, raison: 'long' as const, caracteres: 0 };
    }

    const optionsMoteur: OptionsTraduction = { source: options.source, cible: options.cible };
    if (glossaire.length > 0) optionsMoteur.glossaire = glossaire;
    const bloc = construireDirectives({
      entrees: glossaire,
      contexte: segment.contexte ?? '',
    }).directives;
    const directives = bloc.slice(0, MAX_DIRECTIVES);
    if (directives) optionsMoteur.directives = directives;

    try {
      const resultat = await traduire(texte, optionsMoteur);
      if (typeof resultat.traduit !== 'string' || resultat.traduit.trim() === '') {
        return {
          type: 'echec' as const,
          id: segment.id,
          raison: 'echec' as const,
          caracteres: texte.length,
        };
      }
      return {
        type: 'succes' as const,
        resultat: {
          id: segment.id,
          traduit: resultat.traduit,
          fournisseur: resultat.fournisseur,
          essais: resultat.essais,
        },
      };
    } catch (erreur) {
      const raison =
        erreur instanceof ErreurChaineSecours
          ? raisonDepuisEchecs(erreur.echecs)
          : 'echec';
      console.warn(
        '[traduction/lot] segment en échec',
        JSON.stringify({ id: segment.id, raison })
      );
      return {
        type: 'echec' as const,
        id: segment.id,
        raison,
        caracteres: texte.length,
      };
    }
  });

  const resultats: ResultatSegmentLot[] = [];
  const echecs: EchecSegmentLot[] = [];
  let caracteresEchoues = 0;

  for (const issue of issues) {
    if (issue.type === 'succes') {
      resultats.push(issue.resultat);
    } else {
      caracteresEchoues += issue.caracteres;
      echecs.push({
        id: issue.id,
        raison: issue.raison,
        message: messageDepuisRaison(issue.raison),
      });
    }
  }

  if (caracteresEchoues > 0 && options.libererCaracteres) {
    try {
      await options.libererCaracteres(caracteresEchoues);
    } catch (erreur) {
      // La traduction est déjà faite/perdue : ne pas masquer le résultat
      // par une panne du magasin de quota. On signale, on continue.
      console.warn(
        '[quota] libération du lot impossible :',
        erreur instanceof Error ? erreur.message : erreur
      );
    }
  }

  return { resultats, echecs };
}

/**
 * Statut global d'un lot :
 *  • `ok` — tous les segments ont été traduits ;
 *  • `indisponible` — aucun segment traduit et tous les échecs viennent
 *    du service (moteur, saturation), pas des règles de forme ;
 *  • `partiel` — tout le reste (mélange succès/échecs, ou segments
 *    refusés par les seuils).
 */
export function statutLot(resultat: ResultatLotSegments): 'ok' | 'partiel' | 'indisponible' {
  if (resultat.echecs.length === 0) return 'ok';
  const serviceIndisponible =
    resultat.resultats.length === 0 &&
    resultat.echecs.every((e) => e.raison === 'indisponible' || e.raison === 'limite');
  return serviceIndisponible ? 'indisponible' : 'partiel';
}
