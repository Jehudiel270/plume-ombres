// ============================================================
// lib/fonctionnalites/registre.ts — REGISTRE DES INTERRUPTEURS.
//
// Portage React/Next de `data/feature-flags.ts` (maquette
// plume-ombres-ui), adapté au projet réel :
//   * les plans de la maquette (gratuit/premium/premium_plus)
//     deviennent les FAMILLES de plans réellement vendues
//     (lib/abonnement.ts : Lecteur, Passionné, Illimité…) ;
//   * les itinéraires correspondent aux routes Next réelles ;
//   * `clubs` n'est PAS marqué à risque juridique : décision de
//     l'administrateur (12/11/2026) — les clubs restent PRIVÉS
//     (comptes inscrits, aucun texte de chapitre partagé).
//
// Fichier PUR : aucune dépendance Next ni Supabase. Il est lu par
// le proxy (edge), les pages, les routes d'API et le script
// scripts/verifier-interrupteurs.ts. NE RIEN IMPORTER ICI.
//
// RÈGLE : toute nouvelle page ou API de module doit être déclarée
// ici (un interrupteur) ou dans ITINERAIRES_SOCLE. Le script
// `npm run check:flags` échoue sinon. Voir docs/fonctionnalites/.
// ============================================================

/** Familles de plans, du plus ouvert au plus complet. */
export type NiveauPlan = 'gratuit' | 'lecteur' | 'passionne' | 'illimite';

export const NIVEAUX_PLAN: readonly NiveauPlan[] = [
  'gratuit',
  'lecteur',
  'passionne',
  'illimite',
];

/** Hiérarchie des plans (exportée : les gardes fines d'abonnement
 *  hors interrupteur — export du carnet F24… — l'utilisent). */
export const ORDRE_PLAN: Record<NiveauPlan, number> = {
  gratuit: 0,
  lecteur: 1,
  passionne: 2,
  illimite: 3,
};

/**
 * Ramène un code d'offre réel (lib/abonnement.ts, type CodePlan) à sa
 * famille de niveau. Règle (décision chantier 12/11/2026) :
 *   * `essai` compte comme `lecteur` (essai de découverte, pas
 *     d'avantage exclusif garanti) ;
 *   * les packs de crédits et `etudiant` comptent comme `lecteur` ;
 *   * `groupe` et `ecole` comptent comme `illimite` (licences de
 *     groupe, usages multi-lecteurs assumés).
 * Un code inconnu vaut `gratuit` (on n'ouvre jamais par accident).
 */
export function niveauPlanDepuisCode(code: string | null | undefined): NiveauPlan {
  if (!code) return 'gratuit';
  if (code.startsWith('passionne')) return 'passionne';
  if (code.startsWith('illimite')) return 'illimite';
  if (code === 'groupe_mensuel' || code === 'ecole_annuel') return 'illimite';
  if (
    code.startsWith('lecteur') ||
    code.startsWith('credits_') ||
    code === 'etudiant_mensuel' ||
    code === 'essai' ||
    code.startsWith('premium_') // LEGACY, aliasé Passionné
  ) {
    return 'lecteur';
  }
  return 'gratuit';
}

export function estNiveauPlan(valeur: unknown): valeur is NiveauPlan {
  return typeof valeur === 'string' && (NIVEAUX_PLAN as readonly string[]).includes(valeur);
}

/** Pourquoi un module n'est pas accessible. */
export type RaisonBlocage = 'eteint' | 'juriste' | 'plan' | 'deploiement';

export interface DefInterrupteur {
  /** Identifiant stable (snake_case). NE JAMAIS LE RENOMMER : stocké en base. */
  cle: string;
  /** Code dans les documents sources (F9, A17…). */
  code: string;
  libelle: string;
  groupe: string;
  description: string;
  /** Préfixes de PAGES. `*` = un segment. Sous-chemins inclus, insensible à la casse. */
  itineraires: string[];
  /** Préfixes d'API bloqués en 404 (même logique). */
  api: string[];
  /** Famille de plan minimale par défaut (null = aucun). Modifiable depuis l'admin. */
  planMinimal: NiveauPlan | null;
  /**
   * Risque juridique élevé (exposition publique de contenus traduits) :
   * éteint partout, activation IMPOSSIBLE sans confirmation écrite
   * « validé par un juriste » (loi béninoise n° 2005-30).
   */
  risqueJuridique?: boolean;
  noteJuridique?: string;
  /** État par défaut en production (aucun état enregistré en base). */
  prod: boolean;
  /** Justification OBLIGATOIRE quand le module n'a ni itinéraire ni API
   *  (fonction d'interface à l'intérieur du socle, ex. TTS dans le lecteur). */
  sansItineraire?: string;
}

const LEGAL =
  'Suppose que la plateforme mette des contenus traduits à disposition de tiers. ' +
  'À activer seulement après validation écrite par un juriste (loi béninoise n° 2005-30).';

export const INTERRUPTEURS: readonly DefInterrupteur[] = [
  // --- Exposition publique (risque juridique : éteints partout) ---
  {
    cle: 'catalogue_public',
    code: 'A1-A5',
    libelle: 'Catalogue public et genres',
    groupe: 'Exposition publique',
    description:
      'Catalogue filtrable, pages genres, rangées éditoriales de l’accueil.',
    itineraires: ['/catalogue', '/genres'],
    api: [],
    planMinimal: null,
    risqueJuridique: true,
    noteJuridique: LEGAL,
    prod: false,
  },
  {
    cle: 'collections',
    code: 'A14',
    libelle: 'Collections éditoriales',
    groupe: 'Exposition publique',
    description:
      'Collections de livres constituées par le lecteur (listes privées : '
      + '« à relire », « série préférée »…). La variante atelier des '
      + 'collections : rien n’est exposé à des tiers.',
    itineraires: ['/collections'],
    api: ['/api/collections'],
    planMinimal: null,
    risqueJuridique: true,
    noteJuridique: LEGAL,
    prod: false,
  },
  {
    cle: 'calendrier',
    code: 'A19/A20',
    libelle: 'Calendrier des sorties et « À venir »',
    groupe: 'Exposition publique',
    description:
      'Calendrier de libération des chapitres, comptes à rebours, rangée « À venir ».',
    itineraires: ['/calendrier'],
    api: ['/api/calendrier'],
    planMinimal: null,
    risqueJuridique: true,
    noteJuridique: LEGAL,
    prod: false,
  },
  {
    cle: 'acces_anticipe',
    code: 'A19',
    libelle: 'Accès anticipé et libération différée',
    groupe: 'Exposition publique',
    description:
      'Chapitres réservés aux abonnés avant leur libération. Aucune route dédiée : ' +
      'c’est une règle d’accès appliquée aux chapitres existants.',
    itineraires: [],
    api: [],
    planMinimal: 'passionne',
    risqueJuridique: true,
    noteJuridique: LEGAL,
    prod: false,
    sansItineraire:
      'Règle d’accès appliquée à l’intérieur du socle de lecture, pas une page.',
  },

  // --- Lecture et carnet (atelier personnel) ---
  {
    cle: 'carnet',
    code: 'F2',
    libelle: 'Carnet de lecture',
    groupe: 'Lecture et carnet',
    description:
      'Notes, citations et surlignages pris pendant la lecture, conservés par ' +
      'livre. Export portable (MD/JSON, sans texte intégral) réservé aux abonnés (F24).',
    itineraires: ['/carnet'],
    api: ['/api/carnet'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'lecture_vocale',
    code: 'F9',
    libelle: 'Lecture à voix haute',
    groupe: 'Lecture et carnet',
    description:
      'Lecture vocale du chapitre affiché (Web Speech API du navigateur, zéro clé, zéro serveur).',
    itineraires: [],
    api: [],
    planMinimal: null,
    prod: false,
    sansItineraire:
      'Commande d’interface dans le lecteur (socle /livres), pas une page ni une API.',
  },
  {
    cle: 'bilingue',
    code: 'F7',
    libelle: 'Vue bilingue alignée',
    groupe: 'Lecture et carnet',
    description:
      'Paragraphe source en face du paragraphe traduit, pour vérifier la fidélité.',
    itineraires: [],
    api: [],
    planMinimal: null,
    prod: false,
    sansItineraire:
      'Vue alternative du lecteur (socle /livres), pas une page ni une API.',
  },
  {
    cle: 'theories',
    code: 'F8/F19',
    libelle: 'Théories et comparateur',
    groupe: 'Lecture et carnet',
    description:
      'Hypothèses de lecture personnelles (F8) et comparateur de cohérence ' +
      'de traduction, terme par terme (F19).',
    itineraires: ['/theories'],
    api: ['/api/theories'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'reprise',
    code: 'F6/F10',
    libelle: 'Aide à la reprise et questions',
    groupe: 'Lecture et carnet',
    description:
      'Résumé de l’intrigue lue à la reprise (F10) et questions sur ce qui a ' +
      'déjà été lu (F6). Le contexte est construit CÔTÉ SERVEUR : jamais rien ' +
      'au-delà du chapitre lu. Panneaux du lecteur, réservé aux abonnés.',
    itineraires: [],
    api: ['/api/livres/*/assistance'],
    planMinimal: 'passionne',
    prod: false,
  },
  {
    cle: 'graphe',
    code: 'F25',
    libelle: 'Graphe narratif anti-spoilers',
    groupe: 'Lecture et carnet',
    description:
      'Graphe des personnages et relations, filtré côté serveur par le chapitre lu.',
    itineraires: ['/livres/*/graphe'],
    api: ['/api/livres/*/graphe'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'glossaire',
    code: 'F16',
    libelle: 'Écran de gestion du glossaire',
    groupe: 'Lecture et carnet',
    description:
      'Gestion des termes et décisions de traduction. La mécanique d’injection existe déjà ' +
      '(lib/glossaire.ts) : cet interrupteur couvre l’écran de gestion.',
    itineraires: ['/glossaire'],
    api: ['/api/glossaire'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'ambiance',
    code: 'F5',
    libelle: 'Fiches d’ambiance enrichies',
    groupe: 'Lecture et carnet',
    description:
      'Genres, tropes, intensité et préférences. Les avertissements de contenu par livre ' +
      'existent déjà (socle) : cet interrupteur couvre les nouvelles pages.',
    itineraires: ['/ambiance'],
    api: [],
    planMinimal: null,
    prod: false,
  },

  // --- Univers ---
  {
    cle: 'univers',
    code: 'F17',
    libelle: 'Univers multi-tomes',
    groupe: 'Univers',
    description: 'Sagas, carte des tomes, anti-spoilers par tome.',
    itineraires: ['/univers', '/univers/*'],
    api: ['/api/univers'],
    planMinimal: 'illimite',
    prod: false,
  },

  // --- Communauté (décision administrateur 12/11/2026) ---
  {
    cle: 'clubs',
    code: 'F11',
    libelle: 'Clubs de lecture privés',
    groupe: 'Communauté',
    description:
      'Clubs PRIVÉS entre comptes inscrits : fils de discussion, sondages. AUCUN texte de ' +
      'chapitre ni extrait n’est partagé via un club, aucune page publique. Modération et ' +
      'anti-spam avant ouverture. Sans ces garde-fous, la variante publique resterait à risque.',
    itineraires: ['/clubs'],
    api: ['/api/clubs'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'defis',
    code: 'F14',
    libelle: 'Défis de lecture',
    groupe: 'Communauté',
    description: 'Objectifs et défis personnels non manipulateurs.',
    itineraires: ['/defis'],
    api: ['/api/defis'],
    planMinimal: null,
    prod: false,
  },
  {
    cle: 'cartes',
    code: 'F13',
    libelle: 'Cartes de lecture partageables',
    groupe: 'Communauté',
    description:
      'Visuels de citation avec limite d’extrait et attribution. Extrait cité : à peser ' +
      'avant ouverture (usage personnel de partage, pas de mise à disposition de chapitres).',
    itineraires: ['/cartes'],
    api: [],
    planMinimal: null,
    prod: false,
  },

  // --- Progression ---
  {
    cle: 'progression',
    code: 'A17',
    libelle: 'XP, rangs et badges',
    groupe: 'Progression',
    description:
      'Progression de lecteur non punitive (rangs, badges), adossée à lib/stats.ts. ' +
      'Base exploitable : rien ne punit, tout encourage.',
    itineraires: ['/progression'],
    api: ['/api/progression'],
    planMinimal: null,
    prod: false,
  },
];

/**
 * Itinéraires du SOCLE (atelier personnel) : jamais derrière un
 * interrupteur. Toute entrée doit être justifiée dans la fiche du
 * module ou du chantier (règle du brief BRIEF-HERMES §1).
 */
export const ITINERAIRES_SOCLE: readonly string[] = [
  // Espace personnel (atelier : import, traduction, lecture).
  '/',
  '/bibliotheque',
  '/livres',
  '/favoris',
  '/compte',
  '/abonnement',
  '/paiement',
  '/api/abonnement',
  '/api/paiement',
  '/api/translate',
  // Session et compte.
  '/connexion',
  '/auth',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
  // Pages publiques de présentation et pages légales.
  '/tarifs',
  '/faq',
  '/contact',
  '/mentions-legales',
  '/conditions',
  '/confidentialite',
  '/remboursement',
  '/cookies',
  // Infrastructure de service.
  '/api/statut',
  '/api/track',
  '/api/cron',
  '/api/og',
  '/api/fedapay-relay',
  '/api/features',
  // Centre de notifications du lecteur et journal des nouveautés :
  // deux pages du SOCLE dans la maquette (FEATURE-FLAGS.md) — un
  // compte rendu de l’activité du compte, aucun contenu de lecture.
  '/notifications',
  '/annonces',
  // Cible du partage système (PWA, manifest.share_target) : le
  // contenu reçu part vers le carnet du lecteur (F2) — du SOCLE,
  // comme dans la maquette (CORE_ROUTES, pages/partager.vue).
  '/partager',
  // Liens des modules ouverts pour la barre de navigation (aucun
  // contenu de lecture : des liens, évalués côté serveur).
  '/api/atelier',
];

/** Réservé aux administrateurs (les pages vérifient elles-mêmes la permission). */
export const ITINERAIRES_ADMIN: readonly string[] = ['/admin', '/api/admin'];

/** État d'un interrupteur, tel qu'enregistré en base. */
export interface EtatInterrupteur {
  actif: boolean;
  planMinimal: NiveauPlan | null;
  /** 0 à 100 : part des lecteurs concernés (déterministe par lecteur). */
  deploiement: number;
  /** Confirmation « validé par un juriste » (modules à risque uniquement). */
  juristeOk?: boolean;
  majLe?: string;
  majPar?: string | null;
}

export interface VerdictInterrupteur {
  ouvert: boolean;
  raison: RaisonBlocage;
}

export interface ContexteLecteur {
  utilisateurId: string | null;
  /** Famille de plan du lecteur (ignoré si non connecté). */
  niveauPlan?: NiveauPlan;
}

export const interrupteurParCle = (cle: string) =>
  INTERRUPTEURS.find((i) => i.cle === cle);

/** État PAR DÉFAUT d'un interrupteur (aucun état enregistré en base). */
export function etatParDefaut(def: DefInterrupteur, demo = false): EtatInterrupteur {
  return {
    actif: demo ? false : def.prod,
    planMinimal: def.planMinimal,
    deploiement: 100,
    juristeOk: false,
  };
}

/** Découpe un chemin : sans requête, décodé, minuscules, sans slashs superflus. */
export function normaliserChemin(brut: string): string[] {
  let p = brut.split('?')[0] ?? '';
  p = p.split('#')[0] ?? '';
  try {
    p = decodeURIComponent(p);
  } catch {
    /* chemin invalide : on garde le brut */
  }
  return p.toLowerCase().split('/').filter((s) => s !== '' && s !== '.');
}

/**
 * Vrai si `motif` (préfixe, `*` = un segment) couvre les segments du
 * chemin. CAS SPÉCIAL : un motif vide (la racine `/`) ne couvre QUE la
 * racine — jamais tout le site.
 */
function couvre(motif: string, segments: string[]): boolean {
  const ms = normaliserChemin(motif);
  if (ms.length === 0) return segments.length === 0;
  if (ms.length > segments.length) return false;
  return ms.every((s, i) => s === '*' || s === segments[i]);
}

function specificite(motif: string): number {
  const ms = normaliserChemin(motif);
  return ms.length * 2 + ms.filter((s) => s !== '*').length;
}

/** L'interrupteur le plus spécifique couvrant ce chemin, sinon undefined. */
export function interrupteurPourChemin(
  chemin: string,
  portee: 'pages' | 'api' = 'pages'
): DefInterrupteur | undefined {
  const segments = normaliserChemin(chemin);
  let meilleur: DefInterrupteur | undefined;
  let scoreMeilleur = -1;
  for (const def of INTERRUPTEURS) {
    const motifs = portee === 'api' ? def.api : def.itineraires;
    for (const motif of motifs) {
      if (!couvre(motif, segments)) continue;
      const score = specificite(motif);
      if (score > scoreMeilleur) {
        meilleur = def;
        scoreMeilleur = score;
      }
    }
  }
  return meilleur;
}

export const estCheminApi = (chemin: string) => normaliserChemin(chemin)[0] === 'api';

export const estCheminSocle = (chemin: string) => {
  const segments = normaliserChemin(chemin);
  return ITINERAIRES_SOCLE.some((p) => couvre(p, segments));
};

export const estCheminAdmin = (chemin: string) => {
  const segments = normaliserChemin(chemin);
  return ITINERAIRES_ADMIN.some((p) => couvre(p, segments));
};

/** Hash FNV-1a 32 bits → 0..99. Même lecteur + même clé = même résultat. */
export function compartiment(utilisateurId: string, cle: string): number {
  let h = 0x811c9dc5;
  const s = `${cle}:${utilisateurId}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/**
 * Évalue un interrupteur. ORDRE (règle du brief) :
 *   1. éteint → « eteint » ;
 *   2. module à risque sans confirmation juriste → « juriste » ;
 *   3. lecteur hors du déploiement progressif → « deploiement »
 *      (compartiment déterministe, stable par lecteur) ;
 *   4. abonnement insuffisant → « plan » ;
 *   5. sinon ouvert.
 * Sans contexte lecteur (proxy en visite anonyme), seuls 1 et 2
 * s'appliquent : plan et déploiement sont revérifiés CÔTÉ SERVEUR
 * dans la page ou la route du module (le serveur est l'autorité).
 */
export function evaluerInterrupteur(
  def: DefInterrupteur,
  etat: EtatInterrupteur | undefined,
  lecteur?: ContexteLecteur
): VerdictInterrupteur {
  const e = etat ?? etatParDefaut(def);
  if (!e.actif) return { ouvert: false, raison: 'eteint' };
  if (def.risqueJuridique && !e.juristeOk) {
    return { ouvert: false, raison: 'juriste' };
  }
  const deploiement = Math.max(0, Math.min(100, Math.round(e.deploiement)));
  if (
    deploiement < 100 &&
    lecteur?.utilisateurId &&
    compartiment(lecteur.utilisateurId, def.cle) >= deploiement
  ) {
    return { ouvert: false, raison: 'deploiement' };
  }
  if (e.planMinimal && lecteur?.utilisateurId) {
    const niveau = lecteur.niveauPlan ?? 'gratuit';
    if (ORDRE_PLAN[niveau] < ORDRE_PLAN[e.planMinimal]) {
      return { ouvert: false, raison: 'plan' };
    }
  }
  return { ouvert: true, raison: 'eteint' };
}

/** Part (sur 20 lecteurs de test) qui verrait le module : aperçu du déploiement. */
export function apercuDeploiement(cle: string, deploiement: number): number {
  let n = 0;
  for (let i = 1; i <= 20; i += 1) {
    if (compartiment(`lecteur-test-${i}`, cle) < deploiement) n += 1;
  }
  return n;
}

/**
 * Planifie l'ouverture en masse des modules (bouton du tableau de
 * bord « chantier »). FONCTION PURE, testée : la route d'API
 * l'applique ligne à ligne, le serveur reste l'autorité.
 *
 * Règles :
 *   * sans `avecRisque`, seuls les modules SANS risque juridique
 *     sont concernés — jamais les modules qui attendent la
 *     confirmation écrite d'un juriste ;
 *   * avec `avecRisque`, les modules à risque sont inclus ET la
 *     confirmation juridique est posée dans la même opération
 *     (l'interface exige une case de confirmation explicite) ;
 *   * l'ouverture pose `actif` à vrai et le déploiement à 100 %
 *     (l'intention du geste est « tout voir »), sans toucher au
 *     plan minimal déjà réglé ;
 *   * un module déjà ouvert à 100 % est laissé inchangé (aucune
 *     ligne réécrite pour rien, journal propre).
 */
export function planifierOuvertureMasse(
  etatParCle: ReadonlyMap<string, { actif: boolean; deploiement: number }>,
  avecRisque: boolean
): { aOuvrir: string[]; inchanges: string[]; ignoresRisque: string[] } {
  const aOuvrir: string[] = [];
  const inchanges: string[] = [];
  const ignoresRisque: string[] = [];

  for (const def of INTERRUPTEURS) {
    if (def.risqueJuridique && !avecRisque) {
      ignoresRisque.push(def.cle);
      continue;
    }
    const etat = etatParCle.get(def.cle);
    if (etat && etat.actif && Math.round(etat.deploiement) === 100) {
      inchanges.push(def.cle);
      continue;
    }
    aOuvrir.push(def.cle);
  }

  return { aOuvrir, inchanges, ignoresRisque };
}

/** Une ligne prête pour l'upsert de `fonctionnalites_etats` lors d'une
 *  ouverture en masse. Toutes les colonnes écrites y figurent sur
 *  CHAQUE ligne — voir la remarque de sécurité ci-dessous. */
export interface LigneOuvertureMasse {
  cle: string;
  actif: true;
  deploiement: number;
  juriste_ok: boolean;
  maj_le: string;
  maj_par: string;
}

/**
 * Construit les lignes d'upsert pour l'ouverture en masse. FONCTION
 * PURE, testée.
 *
 * REMARQUE DE SÉCURITÉ (bug corrigé le 14/11/2026) : supabase-js
 * ajoute à la requête un paramètre `columns` égal à l'UNION des clés
 * de toutes les lignes du tableau. Si une ligne omet `juriste_ok`
 * (valeur `undefined` retirée par JSON.stringify) alors qu'une autre
 * la porte, PostgREST insère NULL sur la ligne qui ne l'a pas —
 * colonne NOT NULL → erreur 23502 « null value in column
 * "juriste_ok" ». La règle est donc : chaque ligne porte la MÊME
 * liste de clés, et `juriste_ok` y est toujours un booléen explicite
 * (vrai pour un module à risque ouvert avec confirmation, faux
 * ailleurs — la confirmation n'a de sens que pour les modules à
 * risque, et `etatEffectif` l'ignore pour les autres).
 */
export function construireLignesOuvertureMasse(
  clesAOuvrir: readonly string[],
  utilisateurId: string,
  maintenantIso: string
): LigneOuvertureMasse[] {
  return clesAOuvrir.map((cle) => ({
    cle,
    actif: true,
    deploiement: 100,
    juriste_ok: interrupteurParCle(cle)?.risqueJuridique === true,
    maj_le: maintenantIso,
    maj_par: utilisateurId,
  }));
}
