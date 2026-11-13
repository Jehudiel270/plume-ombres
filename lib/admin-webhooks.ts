// ============================================================
// lib/admin-webhooks.ts — Mise en forme du journal des livraisons
// de webhook pour l'onglet « Paiements » du tableau de bord.
//
// Lecture défensive des lignes de public.evenements_webhook (RLS :
// lecture réservée aux administrateurs) + compte des RETENTES (une
// même référence livrée plusieurs fois : soit l'émetteur a rejoué un
// événement en échec, soit il a renvoyé un doublon — dans les deux
// cas la route répond « déjàTraite »).
// ============================================================

export interface LivraisonWebhook {
  id: number;
  fournisseur: string;
  evenement: string | null;
  reference: string | null;
  statutHttp: number;
  traite: boolean;
  dejaTraite: boolean;
  erreur: string | null;
  creeLe: string | null;
}

function nombre(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function chaineOuNull(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur : null;
}

/** Assainit les lignes de public.evenements_webhook. */
export function normaliserWebhooks(brut: unknown): LivraisonWebhook[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((ligne): LivraisonWebhook | null => {
      if (typeof ligne !== 'object' || ligne === null) return null;
      const o = ligne as Record<string, unknown>;
      const id = typeof o.id === 'number' ? o.id : Number(o.id);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        fournisseur: chaineOuNull(o.fournisseur) ?? 'inconnu',
        evenement: chaineOuNull(o.evenement),
        reference: chaineOuNull(o.reference),
        statutHttp: nombre(o.statut_http),
        traite: o.traite !== false,
        dejaTraite: o.deja_traite === true,
        erreur: chaineOuNull(o.erreur),
        creeLe: chaineOuNull(o.cree_le),
      };
    })
    .filter((l): l is LivraisonWebhook => l !== null);
}

/**
 * Nombre de livraisons en échec (répondu en erreur, non traitées) et
 * nombre de retentes (référence livrée plus d'une fois). Les deux
 * comptages se font sur la fenêtre déjà chargée.
 */
export function bilanWebhooks(livraisons: LivraisonWebhook[]): {
  echecs: number;
  retentes: number;
} {
  const compteParReference = new Map<string, number>();
  let echecs = 0;
  let retentes = 0;
  for (const l of livraisons) {
    if (!l.traite || (l.statutHttp >= 400 && l.statutHttp < 600)) echecs += 1;
    if (l.reference) {
      const dejaVu = compteParReference.get(l.reference) ?? 0;
      if (dejaVu >= 1) retentes += 1; // chaque livraison au-delà de la première
      compteParReference.set(l.reference, dejaVu + 1);
    }
  }
  return { echecs, retentes };
}
