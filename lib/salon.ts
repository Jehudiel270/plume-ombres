// ============================================================
// lib/salon.ts — Salon vivant (F11 v3) : transformations pures
// partagées par la page serveur du salon et l'API GET.
//
// Trois responsabilités :
//   1. agréger les réactions émojis par message (avec « moi ») ;
//   2. transformer les lignes brutes de clubs_messages en
//      MessageSalon (filtrage anti-spoilers inclus, côté serveur) ;
//   3. partager les types du fil entre serveur et composant client.
// ============================================================

import { editionPossible, messageVisiblePour } from './clubs';

export type ReactionSalon = { emoji: string; total: number; moi: boolean };

export type MessageSalon = {
  id: number;
  auteur: string;
  auteurId: string;
  mien: boolean;
  contenu: string;
  plafond: number;
  le: string;
  modifieLe: string | null;
  epingle: boolean;
  reponseA: number | null;
  editionPossible: boolean;
  signale: boolean;
  prive: boolean;
  destinataire: string | null;
  reactions: ReactionSalon[];
};

/** Ligne brute telle que lue en base (jointure profiles sur l'auteur). */
export type LigneMessageBrute = {
  id: number;
  auteur_id: string;
  contenu: string;
  chapitre_max: number;
  created_at: string;
  modifie_le: string | null;
  epingle: boolean;
  reponse_a: number | null;
  signale: boolean;
  prive: boolean;
  destinataire_id: string | null;
  profiles: { pseudo: string | null } | null;
};

/** Ligne brute de clubs_reactions. */
export type LigneReactionBrute = {
  message_id: number;
  utilisateur_id: string;
  emoji: string;
};

/**
 * Agrège les réactions par message : une entrée par émoji, comptage
 * total, et l'indicateur « moi » pour l'état pressé du bouton.
 */
export function agregerReactions(
  lignes: LigneReactionBrute[],
  monId: string
): Map<number, ReactionSalon[]> {
  const parMessage = new Map<number, Map<string, ReactionSalon>>();
  for (const ligne of lignes) {
    let parEmoji = parMessage.get(ligne.message_id);
    if (!parEmoji) {
      parEmoji = new Map<string, ReactionSalon>();
      parMessage.set(ligne.message_id, parEmoji);
    }
    const existante = parEmoji.get(ligne.emoji);
    if (existante) {
      existante.total += 1;
      existante.moi = existante.moi || ligne.utilisateur_id === monId;
    } else {
      parEmoji.set(ligne.emoji, {
        emoji: ligne.emoji,
        total: 1,
        moi: ligne.utilisateur_id === monId,
      });
    }
  }
  const final = new Map<number, ReactionSalon[]>();
  for (const [messageId, parEmoji] of parMessage) {
    final.set(
      messageId,
      Array.from(parEmoji.values()).sort(
        (a, b) => b.total - a.total || a.emoji.localeCompare(b.emoji)
      )
    );
  }
  return final;
}

export type OptionsMessageSalon = {
  monId: string;
  maPosition: number;
  estCreateur: boolean;
  /** Pseudos des membres du club, pour nommer le destinataire d'un MP. */
  pseudosMembres: Map<string, string>;
};

/**
 * Ligne brute → MessageSalon. Renvoie null si le message est au-delà
 * de MA position de lecture : le contenu ne part PAS vers le
 * navigateur (règle du brief — jamais un flou CSS).
 */
export function versMessageSalon(
  ligne: LigneMessageBrute,
  options: OptionsMessageSalon
): MessageSalon | null {
  if (!messageVisiblePour(ligne.chapitre_max, options.maPosition)) return null;
  return {
    id: ligne.id,
    auteur: ligne.profiles?.pseudo ?? 'Lecteur',
    auteurId: ligne.auteur_id,
    mien: ligne.auteur_id === options.monId,
    contenu: ligne.contenu,
    plafond: ligne.chapitre_max,
    le: ligne.created_at,
    modifieLe: ligne.modifie_le,
    epingle: ligne.epingle,
    reponseA: ligne.reponse_a,
    editionPossible: editionPossible(ligne.created_at, ligne.modifie_le),
    // Le signalement reste une affaire de modération : visible du
    // créateur seulement, jamais renvoyé comme arme entre membres.
    signale: ligne.signale === true && options.estCreateur,
    prive: ligne.prive === true,
    destinataire: ligne.destinataire_id
      ? (options.pseudosMembres.get(ligne.destinataire_id) ?? null)
      : null,
    reactions: [],
  };
}

/** Tri du fil : épinglés d'abord, puis du plus récent au plus ancien. */
export function triFil(a: MessageSalon, b: MessageSalon): number {
  if (a.epingle !== b.epingle) return a.epingle ? -1 : 1;
  return b.le.localeCompare(a.le);
}
