// Types partagés de l'application (miroir du schéma Supabase).

export type StatutLivre =
  | 'importe'
  | 'pret'
  | 'en_traduction'
  | 'traduit'
  | 'erreur';

export type StatutChapitre =
  | 'a_traduire'
  | 'en_traduction'
  | 'traduit'
  | 'erreur';

export type StatutSegment =
  | 'en_attente'
  | 'en_cours'
  | 'fait'
  | 'erreur';

export interface Profil {
  id: string;
  pseudo: string;
  created_at: string;
}

export interface Livre {
  id: string;
  proprietaire_id: string;
  titre: string;
  auteur: string | null;
  langue_source: string;
  langue_cible: string;
  nom_fichier: string | null;
  /**
   * Chemin du fichier original stocké (bucket « originaux »).
   * @deprecated Plus alimenté : l'original n'est plus conservé côté
   * serveur (chantier B2/B5). Conservé le temps que l'UI soit mise à
   * jour ; supprimable une fois le bucket vidé.
   */
  fichier_original: string | null;
  /**
   * Géométrie du PDF importé, réduite à 3 nombres (points PDF) :
   * mesurée à l'import (fichier en mémoire), relue à l'export.
   * Null pour un import .txt/.md/.epub (ou PDF sans texte).
   */
  pdf_largeur: number | null;
  pdf_hauteur: number | null;
  pdf_marge: number | null;
  statut: StatutLivre;
  /**
   * Classification d'âge (échelle AO3/Wattpad), renseignée par le
   * propriétaire. Défaut « non_classee » si la colonne n'est pas
   * encore déployée.
   */
  classification_age?: ClassificationAge;
  created_at: string;
  updated_at: string;
  // agrégats calculés côté client (facultatif)
  nb_chapitres?: number;
  nb_segments?: number;
  nb_faits?: number;
}

export interface Chapitre {
  id: string;
  livre_id: string;
  position: number;
  titre: string;
  texte_source: string;
  texte_traduit: string | null;
  statut: StatutChapitre;
  updated_at: string;
}

export interface Segment {
  id: number;
  chapitre_id: string;
  position: number;
  source: string;
  suite: string;
  traduit: string | null;
  statut: StatutSegment;
  tentative: number;
  erreur: string | null;
  updated_at: string;
}

/**
 * Un segment est « complet » (aucun trou) si sa traduction cible est
 * non vide. Cas particulier assumé : une source vide n'a rien à
 * traduire — un `traduit` vide y est légitime et ne bloque pas le
 * chapitre.
 */
export function segmentComplet(segment: Segment): boolean {
  if (segment.statut !== 'fait') return false;
  if ((segment.traduit ?? '').trim().length > 0) return true;
  return segment.source.trim().length === 0;
}

/**
 * Garde-fou : un chapitre n'est « entièrement traduit » que si TOUS ses
 * segments sont complets (texte cible non vide). Empêche de marquer un
 * chapitre « traduit » en laissant un trou (segment resté `en_cours`,
 * échec silencieux, traduction vide).
 */
export function chapitreEntierementTraduit(segments: Segment[]): boolean {
  return segments.every(segmentComplet);
}

/** Identifiant de fournisseur de traduction. */
export type IdFournisseur =
  | 'libretranslate'
  | 'mymemory'
  | 'gemini'
  | 'google';

/** Langues proposées (codes ISO 639-1). */
export type CodeLangue = 'fr' | 'en' | 'es' | 'it' | 'pt' | 'de';

export const LANGUES: Record<CodeLangue, string> = {
  fr: 'Français',
  en: 'Anglais',
  es: 'Espagnol',
  it: 'Italien',
  pt: 'Portugais',
  de: 'Allemand',
};

// ============================================================
// Repères de contenu (chantier W2 / idée E5) — avertissements,
// tropes et classification d'âge. Le public dark romance attend
// ces repères AVANT d'ouvrir un livre (pratique standard
// AO3 / Wattpad). Section additive : aucune rupture des types
// existants ci-dessus.
// ============================================================

/** Catégorie d'un repère de contenu. */
export type CategorieRepere = 'avertissement' | 'trope';

/** Niveaux de classification d'âge (échelle AO3/Wattpad). */
export type ClassificationAge =
  | 'non_classee'
  | 'tout_public'
  | 'ado'
  | 'mature'
  | 'explicite';

/** Libellé, aide et sensibilité associés à chaque classification. */
export const CLASSIFICATIONS: Record<
  ClassificationAge,
  { libelle: string; aide: string; sensible: boolean }
> = {
  non_classee: {
    libelle: 'Non classé',
    aide: "Classification non renseignée par le propriétaire.",
    sensible: false,
  },
  tout_public: {
    libelle: 'Tout public',
    aide: 'Aucun contenu réservé.',
    sensible: false,
  },
  ado: {
    libelle: 'Ado (13+)',
    aide: 'Thèmes matures, sans scène explicite.',
    sensible: false,
  },
  mature: {
    libelle: 'Mature (17+)',
    aide: 'Contenu sombre ou sexuel non explicite.',
    sensible: true,
  },
  explicite: {
    libelle: 'Explicite (18+)',
    aide: 'Scènes sexuelles ou violentes explicites.',
    sensible: true,
  },
};

/** Vrai si la classification exige un écran d'avertissement. */
export function classificationSensible(
  classification: ClassificationAge | null | undefined
): boolean {
  return classification ? (CLASSIFICATIONS[classification]?.sensible ?? false) : false;
}

/** Un repère de contenu enregistré pour un livre. */
export interface Avertissement {
  id: string;
  livre_id: string;
  categorie: CategorieRepere;
  libelle: string;
  /** Vrai si le libellé divulgâche l'intrigue : masqué par défaut. */
  spoiler: boolean;
  /** Vrai si le repère déclenche l'écran d'avertissement. */
  grave: boolean;
  origine: 'manuel' | 'suggestion_acceptee';
  created_at: string;
}

/**
 * Proposition issue de la détection automatique. Elle n'est JAMAIS
 * enregistrée sans validation explicite de l'utilisateur.
 */
export interface PropositionRepere {
  libelle: string;
  categorie: CategorieRepere;
  grave: boolean;
  occurrences: number;
}

/** Repère prêt à être créé (sans identifiants générés par la base). */
export interface NouveauRepere {
  libelle: string;
  categorie: CategorieRepere;
  spoiler: boolean;
  grave: boolean;
  origine: 'manuel' | 'suggestion_acceptee';
}

/** Libellés proposés à la saisie (autocomplétion) — avertissements. */
export const CATALOGUE_AVERTISSEMENTS: string[] = [
  'Violence',
  'Violence sexuelle / non-consentement',
  'Consentement douteux / coercition',
  'Enlèvement / séquestration',
  'Torture',
  'Violence conjugale / domestique',
  'Maltraitance / humiliation',
  'Suicide / automutilation',
  'Troubles alimentaires',
  'Addiction / abus de substances',
  'Mort / deuil',
  'Meurtre / homicide',
  'Harcèlement / stalking',
  'Chantage',
  'Infidélité',
  'Relations toxiques / possessivité',
  'BDSM / dynamique de pouvoir',
  'Traite / exploitation',
  'Grossesse / IVG',
  'Santé mentale / amnésie',
  'Âge gap important',
  'Réécriture de conte',
];

/** Libellés proposés à la saisie (autocomplétion) — tropes. */
export const CATALOGUE_TROPES: string[] = [
  'Enemies to lovers',
  'Slow burn',
  'Found family',
  'Grumpy x sunshine',
  'Mariage arrangé / de convenance',
  'Forced proximity',
  'Only one bed',
  'Second chance',
  'Identité secrète',
  'Mafia / Bratva',
  'Milliardaire / PDG',
  'Harem inversé',
  'Alpha / Omegaverse',
  'Anti-héros / morally grey',
  'Héros possessif / protecteur',
  'Amour interdit',
];

interface RegleDetection {
  libelle: string;
  categorie: CategorieRepere;
  grave: boolean;
  /** Nombre minimal d'occurrences pour proposer le repère. */
  seuil: number;
  /**
   * Motif comparé au texte NORMALISÉ (minuscules, sans accents),
   * d'où l'écriture sans diacritiques ci-dessous.
   */
  motif: string;
}

/**
 * Détection automatique SIMPLE (mots-clés FR + EN) : propositions
 * à valider par le propriétaire, jamais appliquées seules.
 */
const REGLES_DETECTION: RegleDetection[] = [
  {
    libelle: 'Violence',
    categorie: 'avertissement',
    grave: false,
    seuil: 6,
    motif:
      '\\b(violence|violences|violent|violente|violents|violentes|sang|sanglant\\w*|blood\\w*|bleed\\w*|blesse\\w*|blessure\\w*|frapp\\w*|bagarre\\w*|arme|armes|weapon\\w*|gun\\w*|couteau|couteaux|knife|knives|poignard\\w*|stab\\w*)\\b',
  },
  {
    libelle: 'Violence sexuelle / non-consentement',
    categorie: 'avertissement',
    grave: true,
    seuil: 1,
    motif:
      '\\b(viol|viols|violer|viole|violee|violees|violeur|violeurs|rape|raped|rapes|raping|rapist|non-consens\\w*|nonconsens\\w*|attouchement\\w*)\\b',
  },
  {
    libelle: 'Consentement douteux / coercition',
    categorie: 'avertissement',
    grave: true,
    seuil: 2,
    motif:
      '\\b(coercition|coerc\\w*|contrainte|contraint\\w*|forcee|forcees|sans consentement|against her will|against his will|forced)\\b',
  },
  {
    libelle: 'Enlèvement / séquestration',
    categorie: 'avertissement',
    grave: true,
    seuil: 2,
    motif:
      '\\b(enlev\\w*|kidnap\\w*|abduct\\w*|sequestr\\w*|otage\\w*|hostage\\w*|captif|captive|captifs|captives|captivite|prisonni\\w*|dungeon\\w*|cachot\\w*|cellule\\w*)\\b',
  },
  {
    libelle: 'Torture',
    categorie: 'avertissement',
    grave: true,
    seuil: 1,
    motif: '\\b(tortur\\w*|mutil\\w*)\\b',
  },
  {
    libelle: 'Violence conjugale / domestique',
    categorie: 'avertissement',
    grave: true,
    seuil: 2,
    motif: '\\b(conjugal\\w*|domestic\\w*|violentee|femme battue)\\b',
  },
  {
    libelle: 'Maltraitance / humiliation',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif: '\\b(maltrait\\w*|abus\\w*|abuse\\w*|abusive|negligence|humili\\w*|humiliation\\w*)\\b',
  },
  {
    libelle: 'Suicide / automutilation',
    categorie: 'avertissement',
    grave: true,
    seuil: 1,
    motif:
      '\\b(suicid\\w*|self-harm|selfharm|automutilation\\w*|scarification\\w*|se tuer|kill myself|end my life)\\b',
  },
  {
    libelle: 'Troubles alimentaires',
    categorie: 'avertissement',
    grave: false,
    seuil: 2,
    motif: '\\b(anorexi\\w*|boulimi\\w*|eating disorder\\w*|trouble alimentaire\\w*)\\b',
  },
  {
    libelle: 'Addiction / abus de substances',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif:
      '\\b(addict\\w*|dependance|drogue\\w*|drug\\w*|overdose\\w*|alcool\\w*|alcohol\\w*|ivrogne|drunk\\w*)\\b',
  },
  {
    libelle: 'Mort / deuil',
    categorie: 'avertissement',
    grave: false,
    seuil: 6,
    motif:
      '\\b(mort|morts|morte|mortes|deces|death\\w*|dead|died|dying|deuil|mourning|funeral\\w*|enterrement\\w*|grief\\w*|tue|tuee|tuees|tues|killed|kill|kills)\\b',
  },
  {
    libelle: 'Meurtre / homicide',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif: '\\b(meurtre\\w*|murder\\w*|homicide\\w*|assassin\\w*|assassinat\\w*|tuer|tue|tuee)\\b',
  },
  {
    libelle: 'Harcèlement / stalking',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif: '\\b(harce\\w*|harass\\w*|stalk\\w*|menace\\w*|menac\\w*|threat\\w*|intimidat\\w*)\\b',
  },
  {
    libelle: 'Chantage',
    categorie: 'avertissement',
    grave: false,
    seuil: 1,
    motif: '\\b(chantage\\w*|blackmail\\w*|extorsion|extortion\\w*)\\b',
  },
  {
    libelle: 'Infidélité',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif: '\\b(infidel\\w*|adultere\\w*|cheating|trompe\\w*|unfaithful)\\b',
  },
  {
    libelle: 'Relations toxiques / possessivité',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif:
      '\\b(toxiqu\\w*|toxic\\w*|obsess\\w*|possessif\\w*|possessive\\w*|jalous\\w*|jealous\\w*)\\b',
  },
  {
    libelle: 'BDSM / dynamique de pouvoir',
    categorie: 'avertissement',
    grave: false,
    seuil: 3,
    motif:
      '\\b(bdsm|bondage\\w*|soumission|soumis\\w*|soumise\\w*|domin\\w*|dominat\\w*|esclave\\w*|slave\\w*|collier\\w*)\\b',
  },
  {
    libelle: 'Traite / exploitation',
    categorie: 'avertissement',
    grave: true,
    seuil: 1,
    motif:
      '\\b(traite des etres humains|human trafficking|trafficking|esclavage|slavery|prostitution|prostituee\\w*)\\b',
  },
  {
    libelle: 'Grossesse / IVG',
    categorie: 'avertissement',
    grave: false,
    seuil: 2,
    motif:
      '\\b(grossesse\\w*|enceinte|pregnan\\w*|avortement\\w*|avort\\w*|abortion\\w*|fausse couche|miscarriage\\w*)\\b',
  },
  {
    libelle: 'Santé mentale / amnésie',
    categorie: 'avertissement',
    grave: false,
    seuil: 2,
    motif:
      '\\b(amnesi\\w*|depression\\w*|depressif\\w*|psychiatr\\w*|asile\\w*|folie|fou|folle|bipolaire\\w*)\\b',
  },
  {
    libelle: 'Enemies to lovers',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(enemies to lovers|enemies-to-lovers)\\b',
  },
  {
    libelle: 'Slow burn',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\bslow burn\\w*\\b',
  },
  {
    libelle: 'Found family',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\bfound family\\b',
  },
  {
    libelle: 'Grumpy x sunshine',
    categorie: 'trope',
    grave: false,
    seuil: 2,
    motif: '\\bgrumpy\\b',
  },
  {
    libelle: 'Mariage arrangé / de convenance',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif:
      '\\b(arranged marriage\\w*|mariage arrange\\w*|marriage of convenience|mariage de convenance|mariage blanc)\\b',
  },
  {
    libelle: 'Forced proximity',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(forced proximity|proximite forcee)\\b',
  },
  {
    libelle: 'Only one bed',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(only one bed|un seul lit)\\b',
  },
  {
    libelle: 'Second chance',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(second chance|seconde chance)\\b',
  },
  {
    libelle: 'Identité secrète',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(secret identity|identite secrete|double vie)\\b',
  },
  {
    libelle: 'Mafia / Bratva',
    categorie: 'trope',
    grave: false,
    seuil: 2,
    motif: '\\b(mafia\\w*|mafieux|bratva\\w*|cartel\\w*|yakuza\\w*)\\b',
  },
  {
    libelle: 'Milliardaire / PDG',
    categorie: 'trope',
    grave: false,
    seuil: 2,
    motif: '\\b(billionaire\\w*|milliardaire\\w*|ceo|pdg)\\b',
  },
  {
    libelle: 'Harem inversé',
    categorie: 'trope',
    grave: false,
    seuil: 1,
    motif: '\\b(reverse harem|harem inverse)\\b',
  },
  {
    libelle: 'Alpha / Omegaverse',
    categorie: 'trope',
    grave: false,
    seuil: 2,
    motif: '\\b(omegaverse\\w*|omega\\w*|alpha\\w*)\\b',
  },
  {
    libelle: 'Anti-héros / morally grey',
    categorie: 'trope',
    grave: false,
    seuil: 2,
    motif: '\\b(anti-heros?|antihero\\w*|morally gre[yi]|antagoniste\\w*)\\b',
  },
  {
    libelle: 'Héros possessif / protecteur',
    categorie: 'trope',
    grave: false,
    seuil: 3,
    motif: '\\b(protective|protecteur\\w*|possessive|possessif)\\b',
  },
];

/** Met un texte en minuscules et retire les accents (comparaison sûre). */
function normaliserTexte(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Clé de comparaison d'un libellé (« É » ≈ « e », espaces compactés).
 * Sert à éviter les doublons entre repères et propositions.
 */
export function cleRepere(libelle: string): string {
  return normaliserTexte(libelle).replace(/\s+/g, ' ').trim();
}

/**
 * Détection automatique simple par mots-clés du texte source.
 * Renvoie des propositions triées par occurrences — l'utilisateur
 * décide ensuite de les enregistrer ou non.
 */
export function detecterReperes(texte: string): PropositionRepere[] {
  if (!texte) return [];
  // Borne le corpus analysé : au-delà, le gain est nul et le coût
  // de la détection cesse d'être négligeable.
  const corpus = normaliserTexte(texte.slice(0, 400_000));
  const propositions: PropositionRepere[] = [];
  for (const regle of REGLES_DETECTION) {
    const occurrences = (corpus.match(new RegExp(regle.motif, 'g')) ?? []).length;
    if (occurrences >= regle.seuil) {
      propositions.push({
        libelle: regle.libelle,
        categorie: regle.categorie,
        grave: regle.grave,
        occurrences,
      });
    }
  }
  return propositions.sort((a, b) => b.occurrences - a.occurrences);

// ============================================================
// Glossaire par livre (cohérence de traduction — P1.1)
//
// Un livre = un glossaire ; chaque entrée impose une traduction
// pour un nom propre ou un terme (insensible à la casse, car la
// recherche se fait sur `source_normalisee`). Ces types miroitent
// les tables `glossaires` / `glossaire_entrees`.
// ============================================================

/** Nature d'une entrée de glossaire. */
export type CategorieGlossaire = 'personnage' | 'lieu' | 'terme' | 'autre';

/** Entrée de glossaire persistée : source → traduction IMPOSÉE. */
export interface EntreeGlossaire {
  id: number;
  glossaire_id: string;
  /** Forme source telle que saisie (affichage). */
  source: string;
  /** Forme normalisée (minuscules, espaces réduits) — clé d'unicité. */
  source_normalisee: string;
  /** Traduction imposée, réutilisée telle quelle par le moteur. */
  traduction: string;
  categorie: CategorieGlossaire;
  /** true = imposée par l'utilisateur (jamais écrasée par une suggestion). */
  verrouillee: boolean;
  /** Nombre d'occurrences observées dans le livre (0 si inconnu). */
  occurrences: number;
  created_at: string;
  updated_at: string;
}

/** Glossaire d'un livre (au plus un par livre). */
export interface Glossaire {
  id: string;
  livre_id: string;
  langue_source: string;
  langue_cible: string;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/** Candidat détecté automatiquement dans le texte (nom propre récurrent). */
export interface CandidatGlossaire {
  source: string;
  occurrences: number;
  /** Score heuristique de confiance (plus haut = plus probable). */
  score: number;
  /** Extrait de contexte où le candidat a été relevé. */
  exemple: string;
}

/** Paire source → traduction, format compact transmis au moteur. */
export interface PaireGlossaire {
  source: string;
  traduction: string;
}

/** Contexte glissant transmis au moteur avec la requête. */
export interface ContexteGlissant {
  /** Rappel court : termes déjà fixés + fin des segments précédents. */
  extrait: string;
  /** Caractères utilisés (contrainte de budget). */
  caracteres: number;
  /** Estimation de tokens (≈ caractères / 4). */
  tokensEstimes: number;
  /** true si une partie a été coupée pour tenir dans le budget. */
  tronque: boolean;
}
