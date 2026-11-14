// ============================================================
// lib/clubs.ts — Clubs de lecture PRIVÉS (F11) : règles pures.
//
// Décision de l'administrateur (12/11/2026) : les clubs restent
// PRIVÉS — comptes inscrits uniquement, rejoint par CODE
// d'invitation, aucune page publique, AUCUN texte de chapitre
// partagé. Les messages portent un plafond anti-spoilers
// (`chapitre_max`) appliqué CÔTÉ SERVEUR : un membre dont la
// position de lecture est en deçà reçoit le message MASQUÉ.
//
// Ici : les règles pures (code d'invitation, plafond, bornes).
// L'API applique ; cette librairie décide.
// ============================================================

/** Alphabet sans ambiguïté (pas de 0/O, 1/I/L) pour les codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const LONGUEUR_CODE = 8;
export const MAX_MEMBRES = 12;
export const MAX_CLUBS_PAR_COMPTE = 8;
export const MAX_MESSAGE = 2000;
export const MAX_TITRE = 120;
export const MAX_DESCRIPTION = 600;

/**
 * Palette des RÉACTIONS rapides : vrais émojis Unicode, liste
 * blanche stricte — la base n'accepte qu'eux (l'API vérifie, la
 * RLS double). Assez large pour exprimer une lecture : approbation,
 * émotion, choc, tendresse, ambiance de lecture.
 */
export const EMOJIS_REACTIONS: readonly string[] = [
  '👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🤔',
  '😱', '🥹', '💀', '✨', '📚', '☕', '🕯️', '🌙',
];

/** L'émoji proposé fait-il partie de la liste blanche ? */
export function estEmojiReaction(brut: unknown): brut is string {
  return typeof brut === 'string' && (EMOJIS_REACTIONS as readonly string[]).includes(brut);
}

/** Fenêtre d'édition d'un message (15 minutes après publication).
 *  Passé ce délai, le fil garde sa mémoire : on supprime et on
 *  réécrit, on ne réécrit pas l'histoire en silence. */
export const FENETRE_EDITION_MS = 15 * 60 * 1000;

/** Code d'invitation lisible (8 caractères). Aléatoire VOLONTAIRE :
 *  valeur de sécurité côté client, régénérée jusqu'à validité côté
 *  serveur (UNIQUE en base). */
export function codeInvitation(aleatoire: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i += 1) {
    code += ALPHABET[Math.floor(aleatoire() * ALPHABET.length)];
  }
  return code;
}

export function estCodeValide(code: unknown): code is string {
  return typeof code === 'string' && /^[A-HJKMNP-Z2-9]{8}$/.test(code);
}

/**
 * Caviardage anti-spoilers (PUR, testé) : un message lié au chapitre
 * `chapitreMax` est-il visible pour un membre rendu au chapitre
 * `positionLecture` ? Règle du brief : RIEN au-delà du chapitre lu,
 * filtrage côté serveur — jamais un flou CSS.
 *   chapitreMax = 0  → hors intrigue, toujours visible ;
 *   positionLecture >= chapitreMax → visible ;
 *   sinon → masqué (le CONTENU n'est jamais envoyé au navigateur).
 */
export function messageVisiblePour(
  chapitreMax: number,
  positionLecture: number
): boolean {
  const max = Math.max(0, Math.round(Number(chapitreMax) || 0));
  const lu = Math.max(0, Math.round(Number(positionLecture) || 0));
  return max === 0 || lu >= max;
}

/** Libellé du plafond, pour l'interface. */
export function libellePlafond(chapitreMax: number): string {
  if (!chapitreMax || chapitreMax < 1) return 'Hors intrigue';
  return `Jusqu’au chapitre ${chapitreMax}`;
}

/** Nettoie un message saisi : borné, sans espaces extrêmes. La
 *  coupe éventuelle ne casse jamais un émoji en deux (paire de
 *  substitution UTF-16 respectée). */
export function propreMessage(brut: unknown): string {
  if (typeof brut !== 'string') return '';
  const nettoye = brut.trim().replace(/\s+\n/g, '\n');
  if (nettoye.length <= MAX_MESSAGE) return nettoye;
  const coupe = nettoye.slice(0, MAX_MESSAGE);
  const dernier = coupe.charCodeAt(coupe.length - 1);
  if (dernier >= 0xd800 && dernier <= 0xdbff) {
    return coupe.slice(0, -1);
  }
  return coupe;
}

/** Nettoie un titre / une description de club. */
export function propreTexte(brut: unknown, maximum: number): string {
  if (typeof brut !== 'string') return '';
  return brut.trim().replace(/\s+/g, ' ').slice(0, maximum);
}

/** Position de lecture déclarée : entier borné (0 → 2000). */
export function bornePosition(brut: unknown): number {
  const n = Math.round(Number(brut));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(2000, n);
}

/**
 * Édition encore possible ? (PUR, testé) Un message publié à
 * `creeLe` (ISO) peut être édité par son auteur tant que la fenêtre
 * de 15 minutes n'est pas écoulée et qu'il n'a pas déjà été édité.
 */
export function editionPossible(
  creeLe: string,
  modifieLe: string | null | undefined,
  maintenant: number = Date.now()
): boolean {
  if (modifieLe) return false;
  const t = new Date(creeLe).getTime();
  if (!Number.isFinite(t)) return false;
  return maintenant - t < FENETRE_EDITION_MS && maintenant - t >= -60_000;
}

/** Libellé discret pour l'interface : message modifié. */
export function libelleModifie(modifieLe: string | null | undefined): string | null {
  if (!modifieLe) return null;
  return 'modifié';
}

// ============================================================
// RÔLES (admin / moderateur / membre)
//
// Le créateur est admin. Le staff (admin ou moderateur) épingle,
// masque, traite la file de signalements ; l'admin seul change les
// rôles. Un rôle n'accorde JAMAIS accès au contenu au-delà du
// plafond anti-spoilers : le pouvoir de modération n'ouvre pas le
// texte des chapitres non lus.
// ============================================================

export const ROLES_CLUB = ['admin', 'moderateur', 'membre'] as const;
export type RoleClub = (typeof ROLES_CLUB)[number];

export function estRoleClub(valeur: unknown): valeur is RoleClub {
  return (
    typeof valeur === 'string' &&
    (ROLES_CLUB as readonly string[]).includes(valeur)
  );
}

export function libelleRole(role: RoleClub): string {
  switch (role) {
    case 'admin':
      return 'Administrateur';
    case 'moderateur':
      return 'Modérateur';
    default:
      return 'Membre';
  }
}

/** Le rôle donne-t-il un pouvoir de modération ? (admin ou modo) */
export function estStaff(role: RoleClub): boolean {
  return role === 'admin' || role === 'moderateur';
}

// ============================================================
// PROGRAMME DE LECTURE PAR ÉTAPES
//
// Rythme du cahier initial : QUATRE chapitres par semaine, avec un
// focus de discussion. Chaque étape s'ouvre quand la précédente est
// terminée ; la discussion du club ne dépasse jamais l'étape
// ouverte (croisée avec la position de lecture de CHACUN).
// ============================================================

export const CHAPITRES_PAR_ETAPE = 4;
export const MAX_ETAPES = 52;

export const FOCUS_ETAPES: readonly string[] = [
  'Mise en place et premiers indices',
  'Les relations se tendent',
  'Un secret se précise',
  'Le premier tournant',
  'Les alliances se déplacent',
  'Le point de non-retour',
  'Conséquences',
  'Dernière ligne droite',
  'Conclusion et débat final',
  'Épilogue',
];

export interface EtapeProgramme {
  numero: number;
  chapitreDe: number;
  chapitreA: number;
  focus: string;
}

/** Génère le programme : étapes de `parEtape` chapitres jusqu'au
 *  dernier chapitre du livre. PUR, testé. Toute taille invalide
 *  (0, négatif, non numérique) retombe sur les 4 chapitres/semaine
 *  du cahier. */
export function genererEtapes(
  totalChapitres: number,
  parEtape: number = CHAPITRES_PAR_ETAPE
): EtapeProgramme[] {
  const total = Math.max(1, Math.round(Number(totalChapitres) || 1));
  const demandee = Number(parEtape);
  const taille =
    Number.isFinite(demandee) && demandee >= 1
      ? Math.min(12, Math.round(demandee))
      : CHAPITRES_PAR_ETAPE;
  const nombre = Math.min(MAX_ETAPES, Math.ceil(total / taille));
  const programme: EtapeProgramme[] = [];
  for (let i = 0; i < nombre; i += 1) {
    const de = i * taille + 1;
    const a = Math.min(total, (i + 1) * taille);
    programme.push({
      numero: i + 1,
      chapitreDe: de,
      chapitreA: a,
      focus: FOCUS_ETAPES[i % FOCUS_ETAPES.length] ?? '',
    });
  }
  return programme;
}

/**
 * Plafond de discussion EFFECTIF d'un membre (PUR, testé) :
 *   • sans programme → sa position de lecture seule ;
 *   • avec programme → le PLUS PETIT de sa position et du dernier
 *     chapitre de la dernière étape DÉBLOQUÉE. Jamais au-delà de
 *     la lecture personnelle : le rythme du groupe ne force pas
 *     personne.
 */
export function plafondEffectif(
  positionLecture: number,
  dernierChapitreDebloque: number | null
): number {
  const lu = Math.max(0, Math.round(Number(positionLecture) || 0));
  if (dernierChapitreDebloque === null || dernierChapitreDebloque === undefined) {
    return lu;
  }
  const ouvert = Math.max(0, Math.round(Number(dernierChapitreDebloque) || 0));
  return Math.min(lu, ouvert);
}

// ============================================================
// SONDAGES
// ============================================================

export const MAX_QUESTION_SONDAGE = 200;
export const MAX_OPTION_SONDAGE = 120;
export const MAX_OPTIONS_SONDAGE = 4;
export const MIN_OPTIONS_SONDAGE = 2;
/** Durée de vote par défaut (7 jours), en jours. */
export const JOURS_SONDAGE = 7;

/** Nettoie la liste des options saisies : bornée, sans doublon vide. */
export function nettoyerOptionsSondage(brut: unknown): string[] {
  if (!Array.isArray(brut)) return [];
  const vues = new Set<string>();
  const options: string[] = [];
  for (const element of brut) {
    if (typeof element !== 'string') continue;
    const propre = element.trim().slice(0, MAX_OPTION_SONDAGE);
    if (!propre || vues.has(propre)) continue;
    vues.add(propre);
    options.push(propre);
    if (options.length >= MAX_OPTIONS_SONDAGE) break;
  }
  return options;
}

/** Date de clôture demandée : maintenant + `jours` (borné 1 → 60). */
export function dateClotureSondage(jours: number = JOURS_SONDAGE): string {
  const j = Math.max(1, Math.min(60, Math.round(Number(jours) || JOURS_SONDAGE)));
  return new Date(Date.now() + j * 86_400_000).toISOString();
}

/** Le sondage accepte-t-il encore un vote ? (PUR, testé) */
export function sondageOuvert(fermeLe: string, maintenant: number = Date.now()): boolean {
  const t = new Date(fermeLe).getTime();
  if (!Number.isFinite(t)) return false;
  return maintenant < t;
}

// ============================================================
// RENCONTRES
// ============================================================

export const MODES_RENCONTRE = ['en ligne', 'salon écrit'] as const;
export type ModeRencontre = (typeof MODES_RENCONTRE)[number];

export function estModeRencontre(valeur: unknown): valeur is ModeRencontre {
  return (
    typeof valeur === 'string' &&
    (MODES_RENCONTRE as readonly string[]).includes(valeur)
  );
}

export const MAX_TITRE_RENCONTRE = 120;
export const MAX_NOTE_CHAPITRES = 200;

// ============================================================
// FILE DE MODÉRATION
// ============================================================

/** Motifs proposés au signalement (liste fermée, sans juge). */
export const MOTIFS_SIGNALEMENT: readonly string[] = [
  'Spoiler non signalé',
  'Message répété',
  'Hors sujet',
  'Contenu inapproprié',
  'Autre',
];

export function estMotifValide(motif: unknown): motif is string {
  return typeof motif === 'string' && (MOTIFS_SIGNALEMENT as readonly string[]).includes(motif);
}

export const MAX_MOTIF = 200;

/** Nettoie un motif de signalement : motif de liste ou précision libre. */
export function propreMotif(brut: unknown): string {
  if (typeof brut !== 'string') return '';
  return brut.trim().slice(0, MAX_MOTIF);
}
