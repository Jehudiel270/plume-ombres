// ============================================================
// glossaire.ts — Cohérence de traduction (P1.1).
//
// Deux mécanismes complémentaires :
//
//  1. GLOSSAIRE PERSISTANT par livre : source → traduction IMPOSÉE,
//     insensible à la casse. Persisté dans les tables `glossaires`
//     et `glossaire_entrees` (voir supabase/migrations). Les noms
//     propres récurrents sont détectés automatiquement et proposés
//     à l'utilisateur comme candidats — jamais imposés d'office.
//
//  2. CONTEXTE GLISSANT : un rappel court (termes déjà fixés +
//     fin des segments précédents du même chapitre) est joint à la
//     requête du moteur pour stabiliser le style. Un BUDGET de
//     caractères strict empêche l'explosion du nombre de tokens.
//
// Les fonctions pures (normalisation, application, détection,
// budget) sont testables sans réseau ; les fonctions `supabase*`
// ne font que la persistance.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CandidatGlossaire,
  CategorieGlossaire,
  ContexteGlissant,
  EntreeGlossaire,
  Glossaire,
  PaireGlossaire,
} from '@/lib/types';
import { paginer } from '@/lib/pagination';

// ------------------------------------------------------------
// Budgets (contrainte « ne pas exploser les tokens »)
// ------------------------------------------------------------

/** Budget global du bloc de directives joint à chaque requête (caractères). */
export const BUDGET_DIRECTIVES_CARACTERES = 1600;
/** Budget du seul rappel de contexte glissant (caractères). */
export const BUDGET_CONTEXTE_CARACTERES = 900;
/** Nombre maximal d'entrées de glossaire envoyées au moteur. */
export const MAX_ENTREES_PROMPT = 60;
/** Nombre maximal de segments précédents rappelés. */
export const MAX_SEGMENTS_CONTEXTE = 3;
/** Troncature d'un segment rappelé (caractères). */
export const MAX_CARACTERES_SEGMENT = 160;
/** Estimation grossière : 1 token ≈ 4 caractères (latin). */
export const CARACTERES_PAR_TOKEN = 4;

/** Nombre maximal de candidats renvoyés par la détection. */
export const MAX_CANDIDATS = 20;
/** Occurrences minimales pour qu'une forme capitalisée soit un candidat. */
export const MIN_OCCURRENCES_CANDIDAT = 2;

// ------------------------------------------------------------
// Normalisation / budget
// ------------------------------------------------------------

/**
 * Clé d'unicité d'une source de glossaire : insensible à la casse,
 * espaces réduits, accents conservés (deux graphies accentuées
 * différentes restent distinctes). C'est cette clé qui rend la
 * correspondance insensible à la casse.
 */
export function normaliserSource(source: string): string {
  return source.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

/** Estimation de tokens (≈ caractères / 4), arrondie au supérieur. */
export function estimerTokens(texte: string): number {
  return Math.ceil(texte.length / CARACTERES_PAR_TOKEN);
}

// ------------------------------------------------------------
// Application du glossaire (traduction imposée)
// ------------------------------------------------------------

/** Échappe une source et tolère tout espacement interne (retours de ligne). */
function motifSource(source: string): RegExp {
  const echappe = source
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  // Délimiteurs Unicode : évite de remplacer « Darcy » dans « Darcya ».
  return new RegExp(`(?<![\\p{L}\\p{N}])${echappe}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * Impose le glossaire dans un texte déjà traduit : toute occurrence
 * d'une source (insensible à la casse, mot entier) est remplacée par
 * sa traduction imposée. Filet de sécurité pour les moteurs sans
 * prompt (Google, MyMemory, LibreTranslate) — et correctif final
 * pour les moteurs à prompt qui auraient dévié.
 *
 * Idempotent : une seconde application ne change plus rien dès lors
 * que la traduction imposée ne contient pas la source.
 */
export function appliquerGlossaire(
  texte: string,
  entrees: readonly PaireGlossaire[]
): { texte: string; remplacements: number } {
  if (!texte || entrees.length === 0) return { texte, remplacements: 0 };

  // Sources les plus longues d'abord : « Elizabeth Bennet » avant « Bennet ».
  const triees = [...entrees]
    .filter((e) => e.source.trim() && e.traduction.trim())
    .filter((e) => normaliserSource(e.source) !== normaliserSource(e.traduction))
    .sort((a, b) => b.source.length - a.source.length);

  let resultat = texte;
  let remplacements = 0;
  for (const entree of triees) {
    const motif = motifSource(entree.source);
    resultat = resultat.replace(motif, () => {
      remplacements += 1;
      return entree.traduction;
    });
  }
  return { texte: resultat, remplacements };
}

// ------------------------------------------------------------
// Détection automatique de candidats (noms propres récurrents)
// ------------------------------------------------------------

/** Mots-outils fréquents en tête de phrase : jamais des noms propres. */
const MOTS_OUTILS = new Set<string>(
  [
    'a', 'an', 'the', 'and', 'but', 'or', 'if', 'of', 'to', 'in', 'on', 'at', 'by', 'for',
    'with', 'as', 'is', 'was', 'were', 'be', 'been', 'am', 'are', 'it', 'its', 'he', 'she',
    'they', 'we', 'you', 'i', 'his', 'her', 'their', 'our', 'my', 'your', 'this', 'that',
    'these', 'those', 'there', 'here', 'who', 'what', 'when', 'where', 'why', 'how', 'not',
    'no', 'yes', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'could',
    'should', 'can', 'may', 'might', 'must', 'so', 'then', 'than', 'too', 'very', 'just',
    'only', 'even', 'still', 'yet', 'now', 'one', 'two', 'three', 'chapter', 'part',
    'de', 'la', 'le', 'les', 'un', 'une', 'des', 'du', 'et', 'ou', 'mais', 'si', 'ni',
    'il', 'elle', 'ils', 'elles', 'je', 'tu', 'nous', 'vous', 'on', 'ce', 'cet', 'cette',
    'ces', 'son', 'sa', 'ses', 'leur', 'leurs', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
    'notre', 'votre', 'dans', 'sur', 'sous', 'avec', 'pour', 'par', 'pas', 'plus', 'moins',
    'est', 'sont', 'etait', 'était', 'avoir', 'etre', 'être', 'que', 'qui', 'quoi', 'dont',
    'au', 'aux', 'en', 'se', 'ne', 'y', 'lui', 'quel', 'quelle', 'comme', 'aussi', 'bien',
  ].map((m) => m.toLocaleLowerCase('fr'))
);

/** Compte les occurrences d'une forme (mot entier) et celles en minuscule. */
function compterOccurrences(
  texte: string,
  forme: string
): { total: number; minuscules: number } {
  const trouvees = texte.match(motifSource(forme)) ?? [];
  let minuscules = 0;
  for (const t of trouvees) {
    const premiere = t[0];
    if (premiere !== premiere.toLocaleUpperCase('fr')) minuscules += 1;
  }
  return { total: trouvees.length, minuscules };
}

export interface OptionsCandidats {
  /** Sources déjà connues (normalisées ou non) — exclues des candidats. */
  dejaConnus?: Iterable<string>;
  minOccurrences?: number;
  maxCandidats?: number;
}

/**
 * Détecte les noms propres RÉCURRENTS d'un texte (ou d'une liste de
 * textes) et les propose comme candidats de glossaire.
 *
 * Heuristique volontairement conservatrice (proposer > imposer) :
 *  - suites de mots capitalisés (1 mot ou plus : « Darcy »,
 *    « Elizabeth Bennet ») ;
 *  - vues au moins `minOccurrences` fois ;
 *  - un mot seul n'est retenu que s'il n'apparaît JAMAIS en minuscule
 *    (sinon c'est une majuscule de début de phrase) ;
 *  - ni mot-outil, ni trop court, ni déjà présent dans le glossaire.
 */
export function detecterCandidatsGlossaire(
  textes: string | readonly string[],
  options: OptionsCandidats = {}
): CandidatGlossaire[] {
  const texte = Array.isArray(textes) ? textes.join('\n') : (textes as string);
  if (!texte.trim()) return [];

  const minOccurrences = options.minOccurrences ?? MIN_OCCURRENCES_CANDIDAT;
  const maxCandidats = options.maxCandidats ?? MAX_CANDIDATS;
  const connus = new Set<string>();
  for (const c of options.dejaConnus ?? []) connus.add(normaliserSource(c));

  // Suites de mots capitalisés (au moins un), délimitées par du non-lettre.
  const motif =
    /(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’\-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’\-]+)*/gu;

  const vus = new Map<string, { source: string; occurrences: number; exemple: string }>();
  for (const trouve of texte.match(motif) ?? []) {
    const forme = trouve.trim();
    const cle = normaliserSource(forme);
    const dejaLa = vus.get(cle);
    if (dejaLa) {
      dejaLa.occurrences += 1;
    } else {
      vus.set(cle, { source: forme, occurrences: 1, exemple: '' });
    }
  }

  const candidats: CandidatGlossaire[] = [];
  for (const [cle, infos] of vus) {
    if (connus.has(cle)) continue;
    const multiMot = /\s/.test(infos.source);
    const taille = infos.source.replace(/[^\p{L}]/gu, '').length;
    if (taille < 3) continue;
    if (!multiMot && MOTS_OUTILS.has(cle)) continue;
    if (multiMot && infos.source.split(/\s+/).every((m) => MOTS_OUTILS.has(normaliserSource(m)))) {
      continue;
    }

    const { total, minuscules } = compterOccurrences(texte, infos.source);
    if (total < minOccurrences) continue;
    // Mot seul toujours capitalisé → nom propre probable. Mot vu aussi
    // en minuscule → simple majuscule de début de phrase, on écarte.
    if (!multiMot && minuscules > 0) continue;

    const score = total + (multiMot ? 3 : 0) + (minuscules === 0 ? 2 : 0);
    const index = texte.indexOf(infos.source);
    const exemple = texte
      .slice(Math.max(0, index - 25), index + infos.source.length + 25)
      .replace(/\s+/g, ' ')
      .trim();
    candidats.push({ source: infos.source, occurrences: total, score, exemple });
  }

  return candidats.sort((a, b) => b.score - a.score).slice(0, maxCandidats);
}

// ------------------------------------------------------------
// Contexte glissant (budgeté)
// ------------------------------------------------------------

/** Un segment déjà traité, utilisé comme rappel de contexte. */
export interface SegmentContexte {
  source: string;
  traduit?: string | null;
}

export interface OptionsContexteGlissant {
  /** Termes déjà fixés (glossaire actif) à rappeler au moteur. */
  entrees?: readonly PaireGlossaire[];
  /** Segments précédents du même chapitre, dans l'ordre. */
  segments?: readonly SegmentContexte[];
  maxEntrees?: number;
  maxSegments?: number;
  maxCaracteresSegment?: number;
  budgetCaracteres?: number;
}

function tronquerFin(texte: string, max: number): string {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre.length <= max) return propre;
  return propre.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

/**
 * Construit un rappel de contexte COURT et BUDGÉTÉ : les termes déjà
 * fixés (pour ne pas les retraduire autrement) puis la fin des
 * segments précédents du même chapitre (pour stabiliser le style).
 * La coupe se fait d'abord sur les segments, puis sur les entrées.
 */
export function construireContexteGlissant(
  options: OptionsContexteGlissant = {}
): ContexteGlissant {
  const maxEntrees = options.maxEntrees ?? MAX_ENTREES_PROMPT;
  const maxSegments = options.maxSegments ?? MAX_SEGMENTS_CONTEXTE;
  const maxCar = options.maxCaracteresSegment ?? MAX_CARACTERES_SEGMENT;
  const budget = options.budgetCaracteres ?? BUDGET_CONTEXTE_CARACTERES;

  const entrees = (options.entrees ?? []).filter(
    (e) => e.source.trim() && e.traduction.trim()
  );
  const segments = (options.segments ?? []).filter((s) => (s.traduit ?? s.source ?? '').trim());

  let tronque = false;

  // --- Rappel de contexte : les derniers segments traduits ---
  let blocContexte = '';
  const retenus = segments.slice(-maxSegments);
  for (const seg of retenus) {
    const extrait = tronquerFin(seg.traduit?.trim() || seg.source.trim(), maxCar);
    const candidat = `${blocContexte ? ' ' : ''}« ${extrait} »`;
    if ((blocContexte + candidat).length > budget) {
      tronque = true;
      break;
    }
    blocContexte += candidat;
  }

  // --- Termes déjà fixés (prioritaires : ils doivent passer) ---
  const paires: string[] = [];
  for (const e of entrees.slice(0, maxEntrees)) {
    const paire = `${e.source} = ${e.traduction}`;
    if (paires.join(' ; ').length + paire.length + 3 > budget) {
      tronque = true;
      break;
    }
    paires.push(paire);
  }

  const morceaux: string[] = [];
  if (paires.length > 0) morceaux.push(`Termes déjà fixés : ${paires.join(' ; ')}.`);
  if (blocContexte) morceaux.push(`Passages précédents : ${blocContexte}`);

  let extrait = morceaux.join('\n');
  if (extrait.length > budget) {
    extrait = extrait.slice(0, budget).trimEnd();
    tronque = true;
  }

  return {
    extrait,
    caracteres: extrait.length,
    tokensEstimes: estimerTokens(extrait),
    tronque,
  };
}

// ------------------------------------------------------------
// Directives envoyées au moteur (assemblage + budget strict)
// ------------------------------------------------------------

export interface OptionsDirectives {
  entrees?: readonly PaireGlossaire[];
  contexte?: string;
  budgetCaracteres?: number;
}

export interface DirectivesConstruites {
  directives: string;
  caracteres: number;
  tokensEstimes: number;
  tronque: boolean;
  nbEntrees: number;
}

/**
 * Assemble le bloc de directives (glossaire imposé + contexte
 * glissant) transmis au moteur, en respectant un budget STRICT de
 * caractères. Le glossaire est conservé en priorité ; le contexte
 * est coupé en premier s'il faut de la place.
 */
export function construireDirectives(
  options: OptionsDirectives = {}
): DirectivesConstruites {
  const budget = options.budgetCaracteres ?? BUDGET_DIRECTIVES_CARACTERES;
  const entrees = (options.entrees ?? []).filter(
    (e) => e.source.trim() && e.traduction.trim()
  );
  const contexte = (options.contexte ?? '').trim();

  let tronque = false;
  const entete =
    'Glossaire imposé (respecte EXACTEMENT ces traductions, insensible à la casse) :';
  const consigne =
    'Conserve ces noms et termes identiques d’un segment à l’autre. Ne traduis pas les noms propres absents de cette liste.';
  const budgetLignes = Math.max(0, budget - entete.length - consigne.length - 2);

  const lignes: string[] = [];
  let utilise = 0;
  let nbEntrees = 0;
  for (const e of entrees) {
    const ligne = `${e.source} = ${e.traduction}`;
    const cout = ligne.length + (lignes.length > 0 ? 2 : 0);
    if (utilise + cout > budgetLignes) {
      tronque = true;
      break;
    }
    lignes.push(ligne);
    utilise += cout;
    nbEntrees += 1;
  }

  let directives =
    lignes.length > 0 ? `${entete}\n${lignes.join(' ; ')}\n${consigne}` : '';

  if (contexte) {
    const reste = budget - directives.length - (directives ? 2 : 0);
    if (reste > 0) {
      const bloc = contexte.length <= reste ? contexte : contexte.slice(0, reste).trimEnd();
      if (bloc.length < contexte.length) tronque = true;
      directives = directives ? `${directives}\n\n${bloc}` : bloc;
    } else {
      tronque = true;
    }
  }

  if (directives.length > budget) {
    directives = directives.slice(0, budget);
    tronque = true;
  }

  return {
    directives,
    caracteres: directives.length,
    tokensEstimes: estimerTokens(directives),
    tronque,
    nbEntrees,
  };
}

/**
 * Compose l'instruction système d'un moteur à prompt en y ajoutant,
 * si présents, les directives du glossaire et le contexte glissant.
 */
export function composerInstructionSysteme(
  base: string,
  options: { directives?: string }
): string {
  const directives = options.directives?.trim();
  return directives ? `${base}\n\n${directives}` : base;
}

// ------------------------------------------------------------
// Persistance Supabase (un glossaire par livre)
// ------------------------------------------------------------

function paires(entrees: readonly EntreeGlossaire[]): PaireGlossaire[] {
  return entrees
    .filter((e) => e.source.trim() && e.traduction.trim())
    .map((e) => ({ source: e.source, traduction: e.traduction }));
}

/** Entrées du glossaire d'un livre (vide si aucun glossaire). */
export async function chargerGlossaire(
  supabase: SupabaseClient,
  livreId: string
): Promise<EntreeGlossaire[]> {
  const { data: glossaire } = await supabase
    .from('glossaires')
    .select('id')
    .eq('livre_id', livreId)
    .maybeSingle();
  if (!glossaire) return [];
  const entrees = await paginer<EntreeGlossaire>((debut, fin) =>
    supabase
      .from('glossaire_entrees')
      .select('*')
      .eq('glossaire_id', glossaire.id)
      .order('id', { ascending: true })
      .range(debut, fin)
  );
  return entrees;
}

/** Entrées prêtes pour le moteur (chargement tolérant aux erreurs). */
export async function chargerPairesGlossaire(
  supabase: SupabaseClient,
  livreId: string
): Promise<PaireGlossaire[]> {
  try {
    return paires(await chargerGlossaire(supabase, livreId));
  } catch {
    // Le glossaire est un bonus : son absence ne doit jamais bloquer
    // une traduction. On poursuit sans lui.
    return [];
  }
}

/** Crée le glossaire du livre s'il n'existe pas déjà (idempotent). */
export async function assurerGlossaire(
  supabase: SupabaseClient,
  livre: { id: string; langue_source: string; langue_cible: string }
): Promise<Glossaire> {
  const { data, error } = await supabase
    .from('glossaires')
    .upsert(
      {
        livre_id: livre.id,
        langue_source: livre.langue_source,
        langue_cible: livre.langue_cible,
      },
      { onConflict: 'livre_id' }
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Glossaire indisponible : ${error?.message ?? 'réponse vide'}`);
  }
  return data as Glossaire;
}

export interface NouvelleEntree {
  source: string;
  traduction: string;
  categorie?: CategorieGlossaire;
  verrouillee?: boolean;
  occurrences?: number;
}

/**
 * Ajoute (ou met à jour) une entrée de glossaire. Idempotent : la clé
 * (glossaire_id, source_normalisee) est unique — ré-ajouter la même
 * source met simplement à jour la traduction. Une entrée VERROUILLÉE
 * n'est jamais écrasée par une suggestion non verrouillée.
 */
export async function ajouterEntree(
  supabase: SupabaseClient,
  livre: { id: string; langue_source: string; langue_cible: string },
  entree: NouvelleEntree
): Promise<EntreeGlossaire> {
  const source = entree.source.trim();
  const traduction = entree.traduction.trim();
  if (!source || !traduction) {
    throw new Error('Entrée de glossaire invalide : source et traduction requises.');
  }
  const glossaire = await assurerGlossaire(supabase, livre);
  const sourceNormalisee = normaliserSource(source);

  // Ne pas écraser une entrée verrouillée par une simple suggestion.
  const existante = await supabase
    .from('glossaire_entrees')
    .select('*')
    .eq('glossaire_id', glossaire.id)
    .eq('source_normalisee', sourceNormalisee)
    .maybeSingle();
  if (existante.data && (existante.data as EntreeGlossaire).verrouillee && !entree.verrouillee) {
    return existante.data as EntreeGlossaire;
  }

  const { data, error } = await supabase
    .from('glossaire_entrees')
    .upsert(
      {
        glossaire_id: glossaire.id,
        source,
        source_normalisee: sourceNormalisee,
        traduction,
        categorie: entree.categorie ?? 'autre',
        verrouillee: entree.verrouillee ?? false,
        occurrences: entree.occurrences ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'glossaire_id,source_normalisee' }
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Entrée de glossaire non enregistrée : ${error?.message ?? 'réponse vide'}`);
  }
  return data as EntreeGlossaire;
}

/** Met à jour une entrée existante (recalcule la clé si la source change). */
export async function majEntree(
  supabase: SupabaseClient,
  id: number,
  maj: Partial<NouvelleEntree>
): Promise<EntreeGlossaire> {
  const champs: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof maj.source === 'string') {
    champs.source = maj.source.trim();
    champs.source_normalisee = normaliserSource(maj.source);
  }
  if (typeof maj.traduction === 'string') champs.traduction = maj.traduction.trim();
  if (maj.categorie) champs.categorie = maj.categorie;
  if (typeof maj.verrouillee === 'boolean') champs.verrouillee = maj.verrouillee;
  if (typeof maj.occurrences === 'number') champs.occurrences = maj.occurrences;

  const { data, error } = await supabase
    .from('glossaire_entrees')
    .update(champs)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Entrée de glossaire non mise à jour : ${error?.message ?? 'réponse vide'}`);
  }
  return data as EntreeGlossaire;
}

/** Supprime une entrée de glossaire. */
export async function supprimerEntree(
  supabase: SupabaseClient,
  id: number
): Promise<void> {
  const { error } = await supabase.from('glossaire_entrees').delete().eq('id', id);
  if (error) throw new Error(`Entrée de glossaire non supprimée : ${error.message}`);
}

export interface OptionsCandidatsLivre extends OptionsCandidats {
  /** Chapitres examinés pour la détection (défaut : 8). */
  maxChapitres?: number;
}

/**
 * Détecte des candidats dans le texte source d'un livre, en excluant
 * les sources déjà présentes au glossaire. Ne persiste rien : les
 * candidats sont PROPOSÉS (l'UI/la validation viendra ensuite).
 */
export async function proposerCandidats(
  supabase: SupabaseClient,
  livreId: string,
  options: OptionsCandidatsLivre = {}
): Promise<CandidatGlossaire[]> {
  const maxChapitres = options.maxChapitres ?? 8;
  const { data: chapitres } = await supabase
    .from('chapitres')
    .select('texte_source')
    .eq('livre_id', livreId)
    .order('position', { ascending: true })
    .limit(maxChapitres);
  const textes = (chapitres ?? []).map((c: { texte_source: string | null }) => c.texte_source ?? '');
  if (textes.every((t) => !t.trim())) return [];

  const existantes = await chargerPairesGlossaire(supabase, livreId);
  return detecterCandidatsGlossaire(textes, {
    ...options,
    dejaConnus: [...(options.dejaConnus ?? []), ...existantes.map((e) => e.source)],
  });
}

/**
 * Un candidat validé par l'utilisateur : la traduction imposée est
 * fournie explicitement (la détection ne la devine jamais).
 */
export type CandidatGlossaireTraduit = CandidatGlossaire & {
  traduction: string;
  categorie?: CategorieGlossaire;
};

/**
 * Enregistre des candidats comme entrées NON verrouillées du glossaire
 * (suggestions). Idempotent : les sources déjà présentes sont ignorées.
 * Renvoie le nombre d'entrées réellement créées.
 */
export async function enregistrerCandidats(
  supabase: SupabaseClient,
  livre: { id: string; langue_source: string; langue_cible: string },
  candidats: readonly CandidatGlossaireTraduit[]
): Promise<number> {
  const valides = candidats.filter((c) => c.source.trim() && c.traduction.trim());
  if (valides.length === 0) return 0;
  const glossaire = await assurerGlossaire(supabase, livre);
  const { data, error } = await supabase
    .from('glossaire_entrees')
    .upsert(
      valides.map((c) => ({
        glossaire_id: glossaire.id,
        source: c.source.trim(),
        source_normalisee: normaliserSource(c.source),
        traduction: c.traduction.trim(),
        categorie: c.categorie ?? 'autre',
        verrouillee: false,
        occurrences: c.occurrences,
      })),
      { onConflict: 'glossaire_id,source_normalisee', ignoreDuplicates: true }
    )
    .select('id');
  if (error) throw new Error(`Candidats non enregistrés : ${error.message}`);
  return data?.length ?? 0;
}
