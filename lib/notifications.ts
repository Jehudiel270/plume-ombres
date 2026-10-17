// Helpers TypeScript des notifications persistantes.
// Compatibles client (supabase-js) : aucune dépendance serveur, la
// sécurité repose sur les politiques RLS « own » et les RPC
// (compter_notifications_non_lues / marquer_notifications_lues).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Nature d'une notification (aligné sur la contrainte CHECK en base). */
export type TypeNotification = 'info' | 'traduction' | 'paiement' | 'erreur';

/** Une notification telle que lue depuis public.notifications. */
export interface Notification {
  id: number;
  proprietaire_id: string;
  type: TypeNotification;
  titre: string;
  corps: string | null;
  lien: string | null;
  lu: boolean;
  cree_le: string;
}

const TYPES_VALIDES: readonly TypeNotification[] = [
  'info',
  'traduction',
  'paiement',
  'erreur',
];

/** Nombre de notifications listées par défaut. */
export const LIMITE_DEFAUT = 20;
/** Borne HAUTE du nombre de notifications listées (protection réseau). */
export const LIMITE_MAX = 100;

function estTypeValide(v: unknown): v is TypeNotification {
  return typeof v === 'string' && (TYPES_VALIDES as readonly string[]).includes(v);
}

/** Borne une limite demandée dans [1, LIMITE_MAX] (défaut sinon). */
export function bornerLimite(limite?: number): number {
  if (typeof limite !== 'number' || !Number.isFinite(limite) || limite <= 0) {
    return LIMITE_DEFAUT;
  }
  return Math.min(Math.floor(limite), LIMITE_MAX);
}

/**
 * Assainit la réponse brute de la requête notifications : rejette le
 * non-tableau, ignore les lignes mal formées (id/propriétaire/titre/date)
 * et normalise type/corps/lien/lu. Robuste aux évolutions du schéma.
 */
export function assainirNotifications(brut: unknown): Notification[] {
  if (!Array.isArray(brut)) return [];
  const resultat: Notification[] = [];
  for (const ligne of brut as Record<string, unknown>[]) {
    if (!ligne || typeof ligne !== 'object') continue;
    const id = typeof ligne.id === 'number' ? ligne.id : Number(ligne.id);
    const proprietaireId =
      typeof ligne.proprietaire_id === 'string' ? ligne.proprietaire_id : '';
    const titre = typeof ligne.titre === 'string' ? ligne.titre : '';
    const creeLe =
      typeof ligne.cree_le === 'string' && ligne.cree_le ? ligne.cree_le : '';
    if (!Number.isFinite(id) || !proprietaireId || !titre || !creeLe) continue;
    resultat.push({
      id,
      proprietaire_id: proprietaireId,
      type: estTypeValide(ligne.type) ? ligne.type : 'info',
      titre,
      corps: typeof ligne.corps === 'string' ? ligne.corps : null,
      lien: typeof ligne.lien === 'string' ? ligne.lien : null,
      lu: ligne.lu === true,
      cree_le: creeLe,
    });
  }
  return resultat;
}

/**
 * Liste les notifications du compte courant, les plus récentes d'abord.
 * `limite` est bornée par bornerLimite (défaut 20, max 100).
 */
export async function listerNotifications(
  supabase: SupabaseClient,
  options: { limite?: number } = {}
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, proprietaire_id, type, titre, corps, lien, lu, cree_le')
    .order('cree_le', { ascending: false })
    .limit(bornerLimite(options.limite));
  if (error) throw error;
  return assainirNotifications(data);
}

/** Bornes de taille : une notification ne doit jamais grossir sans fin. */
const MAX_TITRE = 200;
const MAX_CORPS = 2000;
const MAX_LIEN = 500;

/** Contenu d'une notification à créer. */
export interface NouvelleNotification {
  /** Destinataire (obligatoire : la RLS « own » s'appuie dessus). */
  proprietaire_id: string;
  type: TypeNotification;
  titre: string;
  corps?: string | null;
  /** Lien interne vers l'objet concerné (ex. `/livres/<id>`). */
  lien?: string | null;
}

/** Tronque une chaîne facultative ; vide → null. */
function texteOuNull(valeur: string | null | undefined, max: number): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  if (propre === '') return null;
  return propre.slice(0, max);
}

/**
 * Crée UNE notification pour un compte.
 *
 * C'est le SEUL point d'insertion de la table `notifications` du
 * projet : tout le reste (cloche, compteur, marquage) ne fait que
 * lire. Fonctionne avec un client navigateur (RLS « own » : le
 * propriétaire doit être le compte courant) comme avec un client
 * service role (exécutant serveur, qui notifie le propriétaire du
 * travail).
 *
 * Échoue franchement (throw) sur un contenu inutilisable : une
 * notification muette serait pire qu'une erreur explicite. Un appelant
 * serveur peut l'envelopper dans un catch pour ne pas faire échouer un
 * travail déjà traduit.
 */
export async function creerNotification(
  supabase: SupabaseClient,
  notification: NouvelleNotification
): Promise<Notification> {
  const proprietaireId = (notification.proprietaire_id ?? '').trim();
  const titre = (notification.titre ?? '').trim().slice(0, MAX_TITRE);
  if (!proprietaireId) {
    throw new Error('Notification sans destinataire.');
  }
  if (!titre) {
    throw new Error('Notification sans titre.');
  }
  if (!estTypeValide(notification.type)) {
    throw new Error('Type de notification inconnu.');
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      proprietaire_id: proprietaireId,
      type: notification.type,
      titre,
      corps: texteOuNull(notification.corps, MAX_CORPS),
      lien: texteOuNull(notification.lien, MAX_LIEN),
    })
    .select('id, proprietaire_id, type, titre, corps, lien, lu, cree_le')
    .single();

  if (error) throw error;
  const [creee] = assainirNotifications([data]);
  if (!creee) throw new Error('Notification créée illisible.');
  return creee;
}

/** Nombre de notifications non lues du compte courant (via la RPC). */
export async function compterNotificationsNonLues(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc('compter_notifications_non_lues');
  if (error) throw error;
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Marque comme lues les notifications du compte courant.
 * - `ids` absent/null/vide → TOUTES les non-lues ;
 * - `ids` fourni → uniquement celles visées (et seulement celles du
 *   compte courant : l'isolation est garantie côté base).
 * Renvoie le nombre de lignes effectivement marquées.
 */
export async function marquerNotificationsLues(
  supabase: SupabaseClient,
  ids?: number[] | null
): Promise<number> {
  const p_ids = ids && ids.length > 0 ? ids : null;
  const { data, error } = await supabase.rpc('marquer_notifications_lues', {
    p_ids,
  });
  if (error) throw error;
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) ? n : 0;
}
