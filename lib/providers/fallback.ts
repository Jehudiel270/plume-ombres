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
//   TRANSLATOR_FALLBACK_ESSAIS=1           (tentatives par moteur, borné)
//   TRANSLATOR_FALLBACK_LOG=0              (coupe le journal)
//
// MODE « PRIVÉ STRICT » (TRANSLATOR_PRIVE_STRICT=1) : seule la file
// AUTO-HÉBERGÉE (LibreTranslate) est autorisée. Ce verrou est appliqué
// AU CŒUR de la chaîne (ordreSecours + traduireAvecSecours) et non
// dans les appelants : une route API comme une tâche d'arrière-plan
// (script, worker) ne peut donc PAS le contourner.
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
import { attendre } from './fragments';
import { appliquerGlossaire } from '@/lib/glossaire';
import type { IdFournisseur } from '@/lib/types';
// Ordre de la chaîne PERSISTÉ en base (admin, sans redéploiement).
// Import à sens unique (chaine-ordre n'importe pas fallback) : pas de cycle.
import {
  ordrePersistantSync,
  rafraichirOrdrePersistant,
} from '@/lib/chaine-ordre';

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
/** Verrou « privé strict » : n'autorise que les moteurs auto-hébergés. */
export const VAR_PRIVE_STRICT = 'TRANSLATOR_PRIVE_STRICT';
/** Nombre maximal de tentatives PAR moteur (borné). */
export const VAR_ESSAIS = 'TRANSLATOR_FALLBACK_ESSAIS';
/** Plafond dur des tentatives par moteur (anti-boucle). */
export const MAX_ESSAIS_PAR_MOTEUR = 3;

/**
 * Seuls moteurs qui garantissent la CONFIDENTIALITÉ du texte :
 * une instance auto-hébergée, sur laquelle nous sommes seuls
 * maîtres des données. Liste blanche du mode privé strict.
 */
export const IDS_PRIVES: readonly IdFournisseur[] = ['libretranslate'];

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
 * Vrai si le moteur traite le texte en DEHORS de notre infrastructure
 * auto-hébergée — donc si le contenu quitte notre contrôle.
 */
export function fournisseurEstPrive(id: IdFournisseur): boolean {
  return IDS_PRIVES.includes(id);
}

/**
 * Libellé HONNÊTE du moteur : indique explicitement où va le texte.
 * Sert à l'affichage utilisateur (promesse produit : texte privé).
 */
export function descriptionMoteur(id: IdFournisseur): string {
  switch (id) {
    case 'libretranslate':
      return 'LibreTranslate (auto-hébergé — texte privé, jamais transmis à un tiers)';
    case 'gemini':
      return 'Gemini (Google — le texte est transmis à Google)';
    case 'google':
      return 'Google non officiel (sans contrat — le texte est transmis à Google)';
    case 'mymemory':
      return 'MyMemory (service public — le texte est transmis à MyMemory)';
  }
}

/**
 * MODE PRIVÉ STRICT — actif si TRANSLATOR_PRIVE_STRICT vaut
 * 1 / true / on / oui (insensible à la casse). Quand il est actif,
 * AUCUN moteur tiers n'est autorisé : seule la file auto-hébergée.
 */
export function modePriveStrict(): boolean {
  const v = process.env[VAR_PRIVE_STRICT]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'oui';
}

/** Moteurs autorisés : file privée seule en mode privé strict. */
export function moteursAutorises(): readonly IdFournisseur[] {
  return modePriveStrict() ? IDS_PRIVES : IDS_CONNUS;
}

/**
 * Ordre effectif de la chaîne de secours.
 *
 * PRIORITÉ :
 *   1. MODE PRIVÉ STRICT (verrou central) : file auto-hébergée seule ;
 *   2. ORDRE PERSISTÉ EN BASE (lib/chaine-ordre) : réglable par
 *      l'admin depuis l'interface, sans redéploiement ;
 *   3. TRANSLATOR_FALLBACK_ORDER (identifiants séparés par des
 *      virgules) ; ignore les inconnues et les doublons ;
 *   4. ordre par défaut.
 *
 * GARDE-FOU CENTRAL : en mode privé strict, l'ordre est FORCÉ à la
 * seule file auto-hébergée — quel que soit l'ordre persisté ou
 * TRANSLATOR_FALLBACK_ORDER. Un appelant (route, script, worker) ne
 * peut pas le contourner : le mode privé prime sur TOUT.
 *
 * L'ordre persisté est lu depuis un cache process-local court. S'il
 * est absent/périmé, un rafraîchissement d'arrière-plan est déclenché
 * (non bloquant) et la résolution retombe, pour cet appel, sur l'env
 * puis le défaut.
 */
export function ordreSecours(): IdFournisseur[] {
  if (modePriveStrict()) {
    journaliser('mode privé strict : ordre forcé (auto-hébergé)', {
      ordre: IDS_PRIVES.join(','),
    });
    return [...IDS_PRIVES];
  }

  // 2. Ordre persistant (base) EN PRIORITÉ sur la variable d'env.
  const persistant = ordrePersistantSync();
  if (persistant && persistant.length > 0) {
    return persistant;
  }
  // Cache froid/périmé : rechargement en arrière-plan (jamais bloquant).
  rafraichirOrdrePersistant();

  // 3. Repli sur la variable d'environnement.
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

/**
 * Nombre de tentatives PAR moteur, borné à MAX_ESSAIS_PAR_MOTEUR.
 * Défaut 1 (bascule immédiate sur le moteur suivant) — aucune
 * boucle infinie possible.
 */
export function essaisSecours(): number {
  const n = Number(process.env[VAR_ESSAIS]);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), MAX_ESSAIS_PAR_MOTEUR);
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
  /** Libellé honnête (indique où va le texte). */
  description: string;
  /** Vrai si le moteur retenu est auto-hébergé (texte privé). */
  prive: boolean;
  /** Vrai si le mode privé strict était actif pour cet appel. */
  priveStrict: boolean;
  /** Nombre de moteurs essayés avant le succès (≥ 1). */
  essais: number;
  /** Nombre total de tentatives réseau consommées (≥ essais). */
  tentatives: number;
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
let dernierMoteur: { id: IdFournisseur; nom: string; prive: boolean } | null =
  null;

/** Vrai si le dernier moteur ayant servi était auto-hébergé (privé). */
export function dernierMoteurPrive(): boolean {
  return dernierMoteur?.prive ?? false;
}

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
 *
 * Garanties :
 *  • ORDONNÉ : les moteurs sont essayés dans l'ordre effectif ;
 *  • BORNÉ : `essaisSecours()` tentatives par moteur (≤ 3) et un
 *    délai maximal par tentative — jamais de boucle ni de blocage ;
 *  • PRIVÉ STRICT : en mode privé, l'ordre est réduit à la file
 *    auto-hébergée, ici même (impossible à contourner par l'appelant) ;
 *  • GLOSSAIRE : les paires imposées sont appliquées au résultat,
 *    quel que soit le moteur retenu ;
 *  • SANS PERTE : une exception n'est propagée que si TOUTE la
 *    chaîne a échoué (ErreurChaineSecours) — l'appelant peut alors
 *    réessayer le segment sans avoir corrompu d'état.
 */
export async function traduireAvecSecours(
  texte: string,
  options: OptionsTraduction,
  ordre: readonly IdFournisseur[] = ordreSecours()
): Promise<ResultatTraductionSecours> {
  const priveStrict = modePriveStrict();
  // Verrou central : en mode privé strict, on ne garde que la file
  // auto-hébergée, MÊME si un appelant a fourni un ordre élargi.
  const ordreEffectif = priveStrict
    ? ordre.filter((id) => fournisseurEstPrive(id))
    : ordre;

  if (ordreEffectif.length === 0) {
    throw new Error(
      priveStrict
        ? 'Mode privé strict : aucun moteur auto-hébergé disponible.'
        : 'Chaîne de secours vide : aucun moteur configuré.'
    );
  }

  const echecs: Array<{ id: IdFournisseur; categorie: CategorieEchec }> = [];
  const maxEssais = essaisSecours();
  let tentativesTotal = 0;

  for (let i = 0; i < ordreEffectif.length; i++) {
    const id = ordreEffectif[i];
    const fournisseur = fournisseurParId(id);

    for (let essai = 0; essai < maxEssais; essai++) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Annulé.', 'AbortError');
      }
      if (essai > 0) await attendre(300 * essai);
      tentativesTotal += 1;
      const debut = Date.now();
      const { signal, nettoyer } = annulerAvecDelai(
        options.signal,
        delaiSecoursMs()
      );

      try {
        const brut = await fournisseur.traduire(texte, { ...options, signal });
        let traduit = brut;
        if (options.glossaire && options.glossaire.length > 0) {
          traduit = appliquerGlossaire(brut, options.glossaire).texte;
        }
        if (typeof traduit !== 'string' || traduit.trim() === '') {
          throw new Error('Le moteur a renvoyé une traduction vide.');
        }
        const dureeMs = Date.now() - debut;
        const prive = fournisseurEstPrive(id);
        dernierMoteur = { id, nom: fournisseur.nom, prive };
        journaliser('succès', {
          moteur: id,
          essai: i + 1,
          tentative: essai + 1,
          prive: prive ? 1 : 0,
          duree_ms: dureeMs,
        });
        return {
          traduit,
          fournisseur: id,
          nomFournisseur: fournisseur.nom,
          description: descriptionMoteur(id),
          prive,
          priveStrict,
          essais: i + 1,
          tentatives: tentativesTotal,
          dureeMs,
        };
      } catch (e) {
        const { categorie, statut } = classerEchec(e);
        if (options.signal?.aborted) {
          journaliser('annulé', { moteur: id });
          throw e;
        }
        journaliser('échec tentative', {
          moteur: id,
          cause: categorie,
          tentative: essai + 1,
          ...(statut ? { http: statut } : {}),
        });
        // Dernier essai de ce moteur épuisé : on enregistre l'échec
        // du moteur et on bascule sur le suivant.
        if (essai === maxEssais - 1) echecs.push({ id, categorie });
      } finally {
        nettoyer();
      }
    }
  }

  throw new ErreurChaineSecours(echecs);
}
