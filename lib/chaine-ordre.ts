// ============================================================
// lib/chaine-ordre.ts — Ordre de la chaîne de traduction PERSISTÉ.
//
// L'admin réordonne la chaîne de secours (LibreTranslate → Gemini →
// Google → MyMemory) sans redéploiement. L'ordre est stocké dans la
// table public.chaine_traduction_ordre (voir migration
// 20261006000001_chaine_traduction_ordre.sql) et lu ici avec un
// CACHE COURT process-local (TTL configurable, défaut 60 s).
//
// PRIORITÉ DE RÉSOLUTION (dans lib/providers/fallback.ordreSecours) :
//   1. MODE PRIVÉ STRICT (TRANSLATOR_PRIVE_STRICT) — verrou CENTRAL,
//      prioritaire sur TOUT, y compris l'ordre persisté ;
//   2. ordre PERSISTÉ en base (cette lib) ;
//   3. variable d'environnement TRANSLATOR_FALLBACK_ORDER ;
//   4. ordre par défaut.
//
// La lecture passe par la fonction SQL public.lire_ordre_chaine()
// (SECURITY DEFINER, accordée à anon/authenticated/service_role) afin
// qu'un worker de traduction SANS session puisse lire l'ordre. Les
// noms de moteurs ne sont jamais exposés à l'interface UTILISATEUR
// (règle produit) : cette lib n'est consommée que côté serveur.
//
// L'ÉCRITURE passe par public.definir_ordre_chaine(text[]) — réservée
// aux administrateurs (ou à un exécutant SQL direct / service_role).
// La clé anon NE PEUT PAS écrire : la fonction n'est pas accordée à
// anon (voir ecrireOrdrePersistant, qui échoue proprement dans ce cas).
//
// Confidentialité : cette table ne contient QUE des identifiants de
// moteurs — jamais le moindre fragment du texte d'un livre.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IdFournisseur } from '@/lib/types';

/** Nom de la table de persistance de l'ordre (globale, sans propriétaire). */
export const TABLE_ORDRE = 'chaine_traduction_ordre';
/** RPC de lecture de l'ordre (SECURITY DEFINER, lecture seule). */
export const RPC_LIRE_ORDRE = 'lire_ordre_chaine';
/** RPC d'écriture de l'ordre (SECURITY DEFINER, réservée aux admins). */
export const RPC_DEFINIR_ORDRE = 'definir_ordre_chaine';
/** Variable d'environnement du TTL du cache (ms). */
export const VAR_ORDRE_TTL = 'TRANSLATOR_ORDRE_TTL_MS';

/**
 * Miroir de IDS_CONNUS (lib/providers/fallback.ts). Dupliqué
 * volontairement : chaine-ordre est importé PAR fallback, l'importer
 * en retour créerait un cycle. Tenir les deux listes synchronisées.
 */
export const IDS_CHAINE: readonly IdFournisseur[] = [
  'libretranslate',
  'gemini',
  'google',
  'mymemory',
];

const TTL_DEFAUT_MS = 60_000;

/** TTL du cache de l'ordre (ms). 0 = pas de cache (toujours relire). */
export function ttlOrdreMs(): number {
  const n = Number(process.env[VAR_ORDRE_TTL]);
  return Number.isFinite(n) && n >= 0 ? n : TTL_DEFAUT_MS;
}

/**
 * Normalise une liste brute (base, env, requête HTTP) en identifiants
 * CONNUS, sans doublon, dans l'ordre reçu. Fonction PURE — testable
 * sans réseau. `connus` permet à l'appelant d'imposer sa propre liste
 * blanche (par défaut : IDS_CHAINE).
 */
export function normaliserOrdre(
  brut: Iterable<unknown>,
  connus: readonly IdFournisseur[] = IDS_CHAINE
): IdFournisseur[] {
  const retenus: IdFournisseur[] = [];
  for (const morceau of brut) {
    const id = String(morceau ?? '').trim().toLowerCase();
    if (!id) continue;
    if (!(connus as readonly string[]).includes(id)) continue;
    const valide = id as IdFournisseur;
    if (!retenus.includes(valide)) retenus.push(valide);
  }
  return retenus;
}

// ------------------------------------------------------------
// Cache process-local (court) : « stale-while-revalidate ».
// Un cache NÉGATIF (ordre []) évite de marteler la base lorsqu'aucun
// ordre n'est encore enregistré : on ne relit qu'après le TTL.
// ------------------------------------------------------------

interface EntreeCache {
  /** Ordre persisté ; tableau VIDE = « aucun ordre enregistré ». */
  ordre: IdFournisseur[];
  expire: number;
}

let cache: EntreeCache | null = null;
/** Horodatage de la dernière TENTATIVE de lecture (anti-martèlement). */
let dernierEssai = 0;
let chargement: Promise<IdFournisseur[] | null> | null = null;

/**
 * Ordre persisté EN CACHE s'il est FRAIS (et non vide), sinon null.
 * Synchrone : point d'entrée utilisé par ordreSecours() (qui doit
 * rester synchrone). Ne déclenche AUCUN accès réseau.
 */
export function ordrePersistantSync(): IdFournisseur[] | null {
  if (cache && cache.expire > Date.now() && cache.ordre.length > 0) {
    return [...cache.ordre];
  }
  return null;
}

/** Vide le cache (tests / forçage manuel). */
export function viderCacheOrdre(): void {
  cache = null;
  dernierEssai = 0;
  chargement = null;
}

/** Place un ordre connu en cache (après une écriture réussie, par ex.). */
export function enregistrerCacheOrdre(ordre: readonly IdFournisseur[]): void {
  cache = { ordre: [...ordre], expire: Date.now() + ttlOrdreMs() };
  dernierEssai = Date.now();
}

/** Vrai si une tentative de lecture a eu lieu récemment (dans le TTL). */
function essaiRecent(): boolean {
  return Date.now() - dernierEssai < ttlOrdreMs();
}

/** Client Supabase serveur (clé anon) dédié à la lecture de l'ordre. */
function clientOrdre(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Charge l'ordre persisté depuis la base (RPC lire_ordre_chaine) et
 * remplit le cache. `null` signifie « aucun ordre persisté » ou
 * « lecture impossible » — l'appelant retombe alors sur l'env / le
 * défaut (voir ordreSecours). Ne lève jamais : toute erreur est
 * journalisée en avertissement et transformée en `null`.
 *
 * @param forcer  ignorer le cache ET la fenêtre anti-martèlement
 *                (utile pour l'admin après écriture).
 * @param connus  liste blanche d'identifiants.
 */
export async function chargerOrdrePersistant(
  forcer = false,
  connus: readonly IdFournisseur[] = IDS_CHAINE
): Promise<IdFournisseur[] | null> {
  if (!forcer) {
    // Cache frais (positif OU négatif) : on répond sans toucher au réseau.
    if (cache && cache.expire > Date.now()) {
      return cache.ordre.length > 0 ? [...cache.ordre] : null;
    }
    // Tentative récente : on ne martèle pas la base.
    if (essaiRecent()) {
      return cache && cache.ordre.length > 0 ? [...cache.ordre] : null;
    }
  }
  // Déduplication : un seul chargement en vol à la fois.
  if (chargement) return chargement;

  dernierEssai = Date.now();
  chargement = (async (): Promise<IdFournisseur[] | null> => {
    try {
      const client = clientOrdre();
      if (!client) return null; // base non configurée : repli env/défaut
      const { data, error } = await client.rpc(RPC_LIRE_ORDRE);
      if (error) {
        console.warn('[chaine-ordre] lecture impossible :', error.message);
        cache = { ordre: [], expire: Date.now() + ttlOrdreMs() };
        return null;
      }
      const ordre = normaliserOrdre(
        Array.isArray(data) ? (data as unknown[]) : [],
        connus
      );
      // Cache POSITIF ou NÉGATIF, valable le TTL.
      cache = { ordre, expire: Date.now() + ttlOrdreMs() };
      return ordre.length > 0 ? ordre : null;
    } catch (e) {
      console.warn(
        '[chaine-ordre] lecture en échec :',
        e instanceof Error ? e.message : e
      );
      cache = { ordre: [], expire: Date.now() + ttlOrdreMs() };
      return null;
    } finally {
      chargement = null;
    }
  })();

  return chargement;
}

/**
 * Rafraîchissement d'ARRIÈRE-PLAN, non bloquant : si le cache n'est
 * pas frais ET qu'aucune tentative n'a eu lieu récemment, déclenche un
 * chargement sans l'attendre. Appelé par ordreSecours() — la première
 * lecture (cache froid) renvoie l'env / le défaut, puis le cache est
 * chaud (positif ou négatif) pour les lectures suivantes.
 */
export function rafraichirOrdrePersistant(
  connus: readonly IdFournisseur[] = IDS_CHAINE
): void {
  if (cache && cache.expire > Date.now()) return; // déjà frais
  if (essaiRecent()) return; // tentative récente : ne pas marteler
  void chargerOrdrePersistant(true, connus).catch(() => undefined);
}

/**
 * Écrit l'ordre persisté (RPC definir_ordre_chaine), puis met le
 * cache à jour immédiatement. Lève si l'ordre est vide/invalide, si
 * la base n'est pas configurée, ou si la RPC refuse (non admin).
 *
 * @param ordre   liste d'identifiants (normalisée avant envoi).
 * @param client  client Supabase PORTANT LA SESSION (route admin :
 *                creerClientServeur). Sans client fourni, un client
 *                anon est utilisé — la RPC n'étant pas accordée à
 *                anon, l'écriture échouera (échappatoire impossible).
 */
export async function ecrireOrdrePersistant(
  ordre: Iterable<unknown>,
  client?: SupabaseClient,
  connus: readonly IdFournisseur[] = IDS_CHAINE
): Promise<IdFournisseur[]> {
  const normalise = normaliserOrdre(ordre, connus);
  if (normalise.length === 0) {
    throw new Error('Ordre vide ou invalide : aucun moteur reconnu.');
  }
  const util = client ?? clientOrdre();
  if (!util) {
    throw new Error('Base non configurée (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY absentes).');
  }
  const { data, error } = await util.rpc(RPC_DEFINIR_ORDRE, {
    p_ordre: normalise,
  });
  if (error) {
    throw new Error(`Ordre non enregistré : ${error.message}`);
  }
  enregistrerCacheOrdre(normalise);
  const retour = normaliserOrdre(
    Array.isArray(data) ? (data as unknown[]) : normalise,
    connus
  );
  return retour.length > 0 ? retour : normalise;
}
