// ============================================================
// providers/sante.ts — Contrôle de santé RÉEL de la chaîne.
//
// Chaque moteur est testé par un APPEL RÉEL et COURT (une phrase
// fixe « hello world », jamais le texte d'un livre) avec un délai
// maximal borné. Le résultat est MIS EN CACHE (TTL configurable)
// pour ne pas gaspiller de quota ni marteler les services.
//
// Confidentialité : les sondes n'envoient JAMAIS le contenu du
// livre — seulement une chaîne constante. En mode privé strict,
// les moteurs tiers ne sont même pas sollicités : ils sont marqués
// `desactive`, et seul l'auto-hébergé est réellement testé.
//
// Variables :
//   TRANSLATOR_SANTE_TTL_MS      (défaut 300000 = 5 min)
//   TRANSLATOR_SANTE_TIMEOUT_MS  (défaut 4000)
//
// L'exposition de ces détails (noms de moteurs) est réservée à
// l'ESPACE ADMIN : l'interface utilisateur ne nomme jamais un
// fournisseur (promesse produit « texte privé »).
// ============================================================

import {
  classerEchec,
  fournisseurEstPrive,
  modePriveStrict,
  nomFournisseurParId,
  ordreSecours,
  type CategorieEchec,
} from './fallback';
import { urlLibretranslate } from './libretranslate';
import { cleGemini, modelesGemini } from './gemini';
import type { IdFournisseur } from '@/lib/types';
import { resoudreClesGemini } from '@/lib/cles-api';

/** Phrase de sonde FIXE : aucun contenu utilisateur n'est envoyé. */
const SONDE = 'hello world';
const SONDE_SOURCE = 'en';
const SONDE_CIBLE = 'fr';

export type EtatMoteur = 'ok' | 'indisponible' | 'non_configure' | 'desactive';

export interface SanteMoteur {
  id: IdFournisseur;
  /** Nom d'affichage (admin uniquement). */
  nom: string;
  /** Vrai si le texte reste sur notre infrastructure auto-hébergée. */
  prive: boolean;
  etat: EtatMoteur;
  /** Latence de la sonde réussie (ms), sinon null. */
  latenceMs: number | null;
  /** Catégorie d'échec normalisée (jamais de texte). */
  cause: CategorieEchec | null;
}

export interface SanteChaine {
  horodatage: string;
  /** Vrai si le mode privé strict est actif. */
  priveStrict: boolean;
  /** Ordre effectif des moteurs (privé strict ⇒ auto-hébergé seul). */
  ordre: IdFournisseur[];
  /**
   * Moteur qui servira au prochain appel : le premier moteur `ok`
   * dans l'ordre effectif. `null` si aucun n'est disponible.
   */
  moteurActif: {
    id: IdFournisseur;
    nom: string;
    prive: boolean;
  } | null;
  moteurs: SanteMoteur[];
  /** TTL du cache (ms). */
  cacheMs: number;
}

const TTL_DEFAUT_MS = 5 * 60 * 1000;
const TIMEOUT_DEFAUT_MS = 4000;

export function ttlSanteMs(): number {
  const n = Number(process.env.TRANSLATOR_SANTE_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? n : TTL_DEFAUT_MS;
}

export function timeoutSanteMs(): number {
  const n = Number(process.env.TRANSLATOR_SANTE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : TIMEOUT_DEFAUT_MS;
}

interface EntreeCache {
  resultat: Omit<SanteMoteur, 'id' | 'nom' | 'prive'>;
  expire: number;
}

/** Cache process-local (par moteur) : clé = identifiant. */
const cache = new Map<IdFournisseur, EntreeCache>();

/** Vide le cache (tests / forçage manuel). */
export function viderCacheSante(): void {
  cache.clear();
}

async function fetchAvecDelai(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const controleur = new AbortController();
  const id = setTimeout(
    () => controleur.abort(new DOMException('Sonde expirée.', 'TimeoutError')),
    ms
  );
  try {
    return await fetch(url, { ...init, signal: controleur.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Sonde LibreTranslate : un appel /translate minimal. */
async function sonderLibreTranslate(): Promise<{
  latenceMs: number | null;
  cause: CategorieEchec | null;
}> {
  const debut = Date.now();
  try {
    const entetes: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const cle = process.env.LIBRETRANSLATE_API_KEY;
    if (cle) entetes.Authorization = 'Bearer ' + cle;
    const r = await fetchAvecDelai(
      `${urlLibretranslate()}/translate`,
      {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({
          q: SONDE,
          source: SONDE_SOURCE,
          target: SONDE_CIBLE,
          format: 'text',
        }),
      },
      timeoutSanteMs()
    );
    if (!r.ok) return { latenceMs: null, cause: 'http' };
    const d = (await r.json()) as { translatedText?: string };
    if (!d.translatedText || !d.translatedText.trim()) {
      return { latenceMs: null, cause: 'reponse_invalide' };
    }
    return { latenceMs: Date.now() - debut, cause: null };
  } catch (e) {
    return { latenceMs: null, cause: classerEchec(e).categorie };
  }
}

/** Sonde Gemini : nécessite une clé, sinon non configuré. La clé
 *  vient de la variable d'environnement, ou à défaut de la PREMIÈRE
 *  clé du réservoir « Clés API » (lisible seulement si le rôle
 *  service est configuré côté serveur). */
async function sonderGemini(): Promise<{
  latenceMs: number | null;
  cause: CategorieEchec | null;
  nonConfigure?: boolean;
}> {
  const cle = cleGemini() || (await resoudreClesGemini({ niveau: null })).cles[0]?.valeur || '';
  if (!cle) return { latenceMs: null, cause: null, nonConfigure: true };
  const debut = Date.now();
  let derniere: CategorieEchec = 'erreur';
  // Un alias de modèle fermé aux nouveaux comptes (404) ou saturé
  // (503) ne doit pas faire conclure à tort que Gemini est indisponible :
  // la sonde essaie la même liste de modèles que le fournisseur.
  for (const modele of modelesGemini()) {
    try {
      const r = await fetchAvecDelai(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: SONDE }] }],
            generationConfig: { maxOutputTokens: 16 },
          }),
        },
        timeoutSanteMs()
      );
      if (!r.ok) {
        derniere = 'http';
        continue;
      }
      const d = (await r.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!t || !t.trim()) {
        derniere = 'reponse_invalide';
        continue;
      }
      return { latenceMs: Date.now() - debut, cause: null };
    } catch (e) {
      derniere = classerEchec(e).categorie;
    }
  }
  return { latenceMs: null, cause: derniere };
}

/** Sonde Google non officiel : un appel GET minimal. */
async function sonderGoogle(): Promise<{
  latenceMs: number | null;
  cause: CategorieEchec | null;
}> {
  const debut = Date.now();
  const params = new URLSearchParams({
    client: 'gtx',
    sl: SONDE_SOURCE,
    tl: SONDE_CIBLE,
    dt: 't',
    q: SONDE,
  });
  try {
    const r = await fetchAvecDelai(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      { method: 'GET' },
      timeoutSanteMs()
    );
    if (!r.ok) return { latenceMs: null, cause: 'http' };
    const d = (await r.json()) as unknown;
    const lignes = (d as Array<Array<Array<string>>>)[0];
    const traduit = Array.isArray(lignes)
      ? lignes.map((l) => (Array.isArray(l) ? l[0] ?? '' : '')).join('')
      : '';
    if (!traduit.trim()) return { latenceMs: null, cause: 'reponse_invalide' };
    return { latenceMs: Date.now() - debut, cause: null };
  } catch (e) {
    return { latenceMs: null, cause: classerEchec(e).categorie };
  }
}

/** Sonde MyMemory : un appel GET minimal. */
async function sonderMyMemory(): Promise<{
  latenceMs: number | null;
  cause: CategorieEchec | null;
}> {
  const debut = Date.now();
  const params = new URLSearchParams({
    q: SONDE,
    langpair: `${SONDE_SOURCE}|${SONDE_CIBLE}`,
    ...(process.env.MYMEMORY_EMAIL ? { de: process.env.MYMEMORY_EMAIL } : {}),
  });
  try {
    const r = await fetchAvecDelai(
      `https://api.mymemory.translated.net/get?${params.toString()}`,
      { method: 'GET' },
      timeoutSanteMs()
    );
    if (!r.ok) return { latenceMs: null, cause: 'http' };
    const d = (await r.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    const traduit = d.responseData?.translatedText;
    if (Number(d.responseStatus) !== 200 || !traduit || !traduit.trim()) {
      return { latenceMs: null, cause: 'reponse_invalide' };
    }
    return { latenceMs: Date.now() - debut, cause: null };
  } catch (e) {
    return { latenceMs: null, cause: classerEchec(e).categorie };
  }
}

function sonder(id: IdFournisseur): Promise<{
  latenceMs: number | null;
  cause: CategorieEchec | null;
  nonConfigure?: boolean;
}> {
  switch (id) {
    case 'libretranslate':
      return sonderLibreTranslate();
    case 'gemini':
      return sonderGemini();
    case 'google':
      return sonderGoogle();
    case 'mymemory':
      return sonderMyMemory();
  }
}

/**
 * Vérifie un moteur (sonde réelle, mise en cache).
 * `forcer` ignore le cache (utile pour un diagnostic manuel).
 */
export async function verifierMoteur(
  id: IdFournisseur,
  forcer = false
): Promise<SanteMoteur> {
  const prive = fournisseurEstPrive(id);
  const base = { id, nom: nomFournisseurParId(id), prive } as const;

  // Mode privé strict : les moteurs tiers ne sont pas sollicités.
  if (modePriveStrict() && !prive) {
    return { ...base, etat: 'desactive', latenceMs: null, cause: null };
  }

  const ttl = ttlSanteMs();
  if (!forcer && ttl > 0) {
    const c = cache.get(id);
    if (c && c.expire > Date.now()) {
      return { ...base, ...c.resultat };
    }
  }

  const { latenceMs, cause, nonConfigure } = await sonder(id);
  const resultat: Omit<SanteMoteur, 'id' | 'nom' | 'prive'> =
    nonConfigure
      ? { etat: 'non_configure', latenceMs: null, cause: null }
      : cause === null
        ? { etat: 'ok', latenceMs, cause: null }
        : { etat: 'indisponible', latenceMs: null, cause };

  cache.set(id, { resultat, expire: Date.now() + ttl });
  return { ...base, ...resultat };
}

/**
 * Santé COMPLÈTE de la chaîne, dans l'ordre effectif. Chaque moteur
 * est sondé (ou servi par le cache) ; le moteur « actif » est le
 * premier disponible dans l'ordre.
 */
export async function verifierChaine(forcer = false): Promise<SanteChaine> {
  const ordre = ordreSecours();
  const moteurs = await Promise.all(ordre.map((id) => verifierMoteur(id, forcer)));
  const premierOk = moteurs.find((m) => m.etat === 'ok') ?? null;

  return {
    horodatage: new Date().toISOString(),
    priveStrict: modePriveStrict(),
    ordre: [...ordre],
    moteurActif: premierOk
      ? { id: premierOk.id, nom: premierOk.nom, prive: premierOk.prive }
      : null,
    moteurs,
    cacheMs: ttlSanteMs(),
  };
}

/**
 * Réponse MINIMALE de disponibilité, pensée pour le monitoring :
 * parcourt l'ordre effectif et s'ARRÊTE au premier moteur qui répond.
 * Cas normal : seul le moteur privé est sondé (coût quasi nul) — les
 * moteurs tiers ne sont sollicités que si le privé est indisponible,
 * ce qui évite de consommer inutilement le quota gratuit de Gemini.
 */
export async function verifierDisponibilite(): Promise<{
  disponible: boolean;
  horodatage: string;
}> {
  const ordre = ordreSecours();
  for (const id of ordre) {
    const m = await verifierMoteur(id);
    if (m.etat === 'ok') {
      return { disponible: true, horodatage: new Date().toISOString() };
    }
  }
  return { disponible: false, horodatage: new Date().toISOString() };
}

/**
 * Bandeau de confidentialité SANS nom de fournisseur — destiné aux
 * pages utilisateur (l'utilisateur ne doit jamais voir quel moteur
 * traduit son texte).
 */
export function libelleConfidentialite(priveStrict = modePriveStrict()): string {
  return priveStrict
    ? 'Mode privé strict : votre texte est traité uniquement sur notre serveur, jamais transmis à un tiers.'
    : 'Votre texte est traité de façon sécurisée. Aucun moteur tiers n’est nommé ici.';
}
