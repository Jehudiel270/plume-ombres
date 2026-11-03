// ============================================================
// lib/paiement/alertes.ts — Alerter les administrateurs d'un paiement.
//
// Appelé par le webhook FedaPay ET par la vérification au retour de
// paiement : sans cela, un paiement échoué la nuit ne réveille
// personne. L'écriture elle-même est faite par la fonction SQL
// notifier_paiement() (idempotente : une seule alerte par paiement et
// par destinataire, jamais de doublon quand FedaPay rejoue l'événement).
//
// ⚠ Une erreur d'alerte ne doit JAMAIS faire échouer un paiement :
// l'appelant enveloppe cet appel dans un try/catch et journalise.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type StatutAlerte = 'reussi' | 'echoue';

export function statutAlertable(statut: unknown): statut is StatutAlerte {
  return statut === 'reussi' || statut === 'echoue';
}

export async function notifierPaiement(
  client: SupabaseClient,
  reference: string | null | undefined,
  statut: unknown
): Promise<number> {
  if (!reference || !statutAlertable(statut)) {
    return 0;
  }
  const { data, error } = await client.rpc('notifier_paiement', {
    p_reference: reference,
    p_statut: statut,
  });
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === 'number' ? data : 0;
}
