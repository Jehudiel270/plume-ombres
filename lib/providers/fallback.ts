// ============================================================
// providers/fallback.ts — Chaîne de secours (fallback) des moteurs.
//
// Essaie les moteurs de traduction DANS L'ORDRE, et bascule
// automatiquement sur le suivant dès que l'un échoue :
//   • erreur réseau (fetch failed, DNS, connexion refusée…)
//   • réponse HTTP non-200
//   • dépassement du délai (timeout) par tentative
//   • quota / limitation (HTTP 429/403, message « quota »)
//   • réponse vide ou illisible
//
// Ordre par défaut : LibreTranslate → Gemini → Google → MyMemory.
// Configurable sans redéploiement :
//   TRANSLATOR_FALLBACK_ORDER='gemini,google,mymemory,libretranslate'
//   TRANSLATOR_FALLBACK_TIMEOUT_MS=20000   (délai par tentative)
//   TRANSLATOR_FALLBACK_LOG=0              (coupe le journal)
//
// Journalisation DISCRÈTE : on ne consigne que l'identifiant du
// moteur, la catégorie d'échec et la durée — JAMAIS le moindre
// fragment du texte du livre (ni entrée, ni traduction, ni corps
// de réponse d'erreur).
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { FournisseurLibreTranslate } from './libretranslate';
import { FournisseurMyMemory } from './mymemory';
import { FournisseurGemini } from './gemini';
import { FournisseurGoogleLibre } from './google';
import type { IdFournisseur } from '@/lib/types';

/** Ordre de secours par défaut (raisonnable, du plus local au plus lointain). */
export const ORDRE_SECOURS_DEFAUT: readonly IdFournisseur[] = [
  'libretranslate',
  'gemini',
  'google',
  'mymemory',
];

const IDS_CONNUS: readonly IdFournisseur[] = [
  'libretranslate',
  'gemini',
  'google',
  'mymemory',
];

const DELAI_SECOURS_DEFAUT_MS = 20000;

/** Noms des variables d'environnement reconnues. */
export const VAR_ORDRE = 'TRANSLATOR_FALLBACK_ORDER';
export const VAR_DELAI = 'TRANSLATOR_FALLBACK_TIMEOUT_MS';
export const VAR_JOURNAL = 'TRANSLATOR_FALLBACK_LOG';

/** Liste exhaustive des fournisseurs disponibles. */
export function tousLesFournisseurs(): FournisseurTraduction[] {
  return [
    new FournisseurLibreTranslate(),
    new FournisseurMyMemory(),
    new FournisseurGemini(),
    new FournisseurGoogleLibre(),
  ];
}

/** Fournisseur demandé par son identifiant. */
export function fournisseurParId(id: string): FournisseurTraduction {
  const fournisseur = tousLesFournisseurs().find((f) => f.id === id);
  if (!fournisseur) {
    throw new Error(`Fournisseur de traduction inconnu : ${id}`);
  }
  return fournisseur;
}

/** Nom d'affichage d'un moteur (sans instancier de client). */
export function nomFournisseurParId(id: IdFournisseur): string {
  switch (id) {
    case 'libretranslate':
      return 'LibreTranslate (local, gratuit)';
    case 'gemini':
      return 'Gemini (Flash, qualité littéraire)';
    case 'google':
      return 'Google libre (endpoint public, expérimental)';
    case 'mymemory':
      return 'MyMemory (API publique, secours)';
  }
}

/**
 * Ordre effectif de la chaîne de secours.
 * Lit TRANSLATOR_FALLBACK_ORDER (identifiants séparés par des
 * virgules) ; ignore les inconnues et les doublons ; retombe sur
 * l'ordre par défaut si la valeur est absente ou inexploitable.
 */
export function ordreSecours(): IdFournisseur[] {
  const brut = process.env[VAR_ORDRE];
  if (!brut || !brut.trim()) return [...ORDRE_SECOURS_DEFAUT];
  const retenus: IdFournisseur[] = [];
  for (const morceau of brut.split(',')) {
    const id = morceau.trim().toLowerCase();
    if (!id) continue;
    if ((IDS_CONNUS as readonly string[]).includes(id)) {
      const valide = id as IdFournisseur;
      if (!retenus.includes(valide)) retenus.push(valide);
    } else {
      journaliser('ordre: identifiant ignoré', { valeur: id });
    }
  }
  return retenus.length > 0 ? retenus : [...ORDRE_SECOURS_DEFAUT];
}

/** Délai maximal par tentative (ms), configurable par variable d'env. */
export function delaiSecoursMs(): number {
  const n = Number(process.env[VAR_DELAI]);
  return Number.isFinite(n) && n > 0 ? n : DELAI_SECOURS_DEFAUT_MS;
}

/** Catégorie d'échec normalisée — sert uniquement au journal. */
export type CategorieEchec =
  | 'reseau'
  | 'timeout'
  | 'quota'
  | 'http'
  | 'reponse_invalide'
  | 'config'
  | 'erreur';

/**
 * Classe un échec SANS jamais en extraire le texte : on ne lit
 * que le nom du type et les codes/mots-clés techniques du message
 * généré par nos propres fournisseurs.
 */
export function classerEchec(e: unknown): {
  categorie: CategorieEchec;
  statut?: number;
} {
  if (!(e instanceof Error)) return { categorie: 'erreur' };
  const { name, message } = e;
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /timeout|délai dépassé|aborted/i.test(message)
  ) {
    return { categorie: 'timeout' };
  }
  const statutTrouve = message.match(/(?:répondu|HTTP)\s*(\d{3})/i);
  if (statutTrouve) {
    const statut = Number(statutTrouve[1]);
    return {
      categorie: statut === 429 || statut === 403 ? 'quota' : 'http',
      statut,
    };
  }
  if (/quota|rate limit|trop de requ|limit[ée]/i.test(message)) {
    return { categorie: 'quota' };
  }
  if (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|socket|network|réseau/i.test(
      message
    )
  ) {
    return { categorie: 'reseau' };
  }
  if (/vide|illisible|invalide/i.test(message)) {
    return { categorie: 'reponse_invalide' };
  }
  if (/pas activé|GEMINI_API_KEY|clé/i.test(message)) {
    return { categorie: 'config' };
  }
  return { categorie: 'erreur' };
}

function journalActif(): boolean {
  const v = process.env[VAR_JOURNAL];
  return v !== '0' && v !== 'false' && v !== 'off';
}

/** Journal discret : moteur + catégorie + durée, jamais de texte. */
function journaliser(
  message: string,
  champs: Record<string, string | number>
): void {
  if (!journalActif()) return;
  const detail = Object.entries(champs)
    .map(([cle, valeur]) => `${cle}=${valeur}`)
    .join(' ');
  console.info(`[traduction] ${message} ${detail}`);
}

/** Résultat d'une traduction passée par la chaîne de secours. */
export interface ResultatTraductionSecours {
  traduit: string;
  /** Identifiant du moteur qui a réellement servi. */
  fournisseur: IdFournisseur;
  /** Nom d'affichage du moteur qui a réellement servi. */
  nomFournisseur: string;
  /** Nombre de moteurs essayés avant le succès (≥ 1). */
  essais: number;
  /** Durée de la tentative gagnante (ms). */
  dureeMs: number;
}

/** Échec de TOUS les moteurs de la chaîne. */
export class ErreurChaineSecours extends Error {
  readonly echecs: ReadonlyArray<{ id: IdFournisseur; categorie: CategorieEchec }>;
  constructor(
    echecs: ReadonlyArray<{ id: IdFournisseur; categorie: CategorieEchec }>
  ) {
    super(
      `Tous les moteurs de la chaîne de secours ont échoué (${echecs
        .map((e) => `${e.id}:${e.categorie}`)
        .join(', ')}).`
    );
    this.name = 'ErreurChaineSecours';
    this.echecs = echecs;
  }
}

/** Dernier moteur ayant réellement servi (état local au processus). */
let dernierMoteur: { id: IdFournisseur; nom: string } | null = null;

/**
 * Fonction publique : nom du moteur réellement utilisé lors du
 * dernier appel réussi (null si aucun succès encore). Pour un usage
 * concurrent, préférez le champ `fournisseur` du résultat renvoyé.
 */
export function moteurUtilise(): string | null {
  return dernierMoteur?.nom ?? null;
}

/** Identifiant du dernier moteur ayant réellement servi. */
export function idMoteurUtilise(): IdFournisseur | null {
  return dernierMoteur?.id ?? null;
}

/** Combine le signal appelant avec un délai maximal par tentative. */
function annulerAvecDelai(
  externe: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; nettoyer: () => void } {
  const minuterie = new AbortController();
  const id = setTimeout(() => {
    minuterie.abort(
      new DOMException('Délai de traduction dépassé.', 'TimeoutError')
    );
  }, ms);
  const signal = externe
    ? AbortSignal.any([externe, minuterie.signal])
    : minuterie.signal;
  return { signal, nettoyer: () => clearTimeout(id) };
}

/**
 * Traduit un texte en essayant chaque moteur de la chaîne jusqu'au
 * premier succès. Renvoie la traduction ET le moteur réellement
 * utilisé. Lève ErreurChaineSecours si tous les moteurs échouent.
 */
export async function traduireAvecSecours(
  texte: string,
  options: OptionsTraduction,
  ordre: readonly IdFournisseur[] = ordreSecours()
): Promise<ResultatTraductionSecours> {
  if (ordre.length === 0) {
    throw new Error('Chaîne de secours vide : aucun moteur configuré.');
  }

  const echecs: Array<{ id: IdFournisseur; categorie: CategorieEchec }> = [];

  for (let i = 0; i < ordre.length; i++) {
    const id = ordre[i];
    const fournisseur = fournisseurParId(id);
    const debut = Date.now();
    const { signal, nettoyer } = annulerAvecDelai(options.signal, delaiSecoursMs());

    try {
      const traduit = await fournisseur.traduire(texte, { ...options, signal });
      const dureeMs = Date.now() - debut;
      dernierMoteur = { id, nom: fournisseur.nom };
      journaliser('succès', { moteur: id, essai: i + 1, duree_ms: dureeMs });
      return {
        traduit,
        fournisseur: id,
        nomFournisseur: fournisseur.nom,
        essais: i + 1,
        dureeMs,
      };
    } catch (e) {
      const { categorie, statut } = classerEchec(e);
      echecs.push({ id, categorie });
      if (options.signal?.aborted) {
        journaliser('annulé', { moteur: id });
        throw e;
      }
      journaliser('échec → bascule', {
        moteur: id,
        cause: categorie,
        ...(statut ? { http: statut } : {}),
      });
    } finally {
      nettoyer();
    }
  }

  throw new ErreurChaineSecours(echecs);
}
