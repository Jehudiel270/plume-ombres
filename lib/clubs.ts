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
