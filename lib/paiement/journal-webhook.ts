// ============================================================
// lib/paiement/journal-webhook.ts — JOURNAL DES LIVRAISONS DE
// WEBHOOK (table public.evenements_webhook, migration 20261114000002).
//
// Chaque notification de paiement reçue par la route
// /api/paiement/webhook est tracée : succès, déjà traité (retente
// FedaPay) ou échec avec le statut HTTP renvoyé. L'écriture est
// SILENCIEUSE : un échec de journal ne doit JAMAIS faire échouer un
// traitement de paiement — FedaPay rejouerait l'événement pour rien.
//
// SÉCURITÉ : l'insertion n'est possible que par le rôle service
// (aucune politique d'insertion) ; la lecture est réservée aux
// administrateurs (RLS public.est_admin()).
// Aucune donnée personnelle : référence interne, nom d'événement,
// statut HTTP, message d'erreur.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EntreeWebhook {
  fournisseur: string;
  /** Nom de l'événement si identifiable (ex. transaction.approuved). */
  evenement: string | null;
  /** Référence interne (PLU-…) si identifiable. */
  reference: string | null;
  /** Statut HTTP renvoyé à l'émetteur. */
  statutHttp: number;
  /** Le paiement a-t-il été traité (activation, crédit…). */
  traite: boolean;
  /** Événement déjà traité précédemment (retente de l'émetteur). */
  dejaTraite: boolean;
  erreur: string | null;
}

/**
 * Écrit une entrée du journal. Silencieux par construction : en cas
 * d'erreur (table absente, rôle service non configuré), rien n'est
 * levé et le traitement courant continue.
 */
export async function journaliserWebhook(
  client: SupabaseClient | null,
  entree: EntreeWebhook
): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.from('evenements_webhook').insert({
      fournisseur: entree.fournisseur.slice(0, 40),
      evenement: entree.evenement ? entree.evenement.slice(0, 120) : null,
      reference: entree.reference ? entree.reference.slice(0, 80) : null,
      statut_http: Math.max(0, Math.min(599, Math.round(entree.statutHttp))),
      traite: entree.traite,
      deja_traite: entree.dejaTraite,
      erreur: entree.erreur ? entree.erreur.slice(0, 500) : null,
    });
    // Les erreurs PostgREST arrivent dans `error`, pas en exception.
    if (error) {
      console.warn(
        '[webhook] journal non écrit :',
        error.message
      );
    }
  } catch (e) {
    console.warn(
      '[webhook] journal non écrit :',
      e instanceof Error ? e.message : e
    );
  }
}
