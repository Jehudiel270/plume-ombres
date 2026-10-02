// ============================================================
// components/AbonnementHistorique.tsx — Historique (P0.9).
// Composant serveur : événements d'abonnement + paiements.
// ============================================================

import { libelleStatut, planParCode } from '@/lib/abonnement';
import type { EvenementAbonnement } from '@/lib/abonnement';
import type { Paiement } from '@/lib/paiement/types';

interface Props {
  evenements: EvenementAbonnement[];
  paiements: Paiement[];
}

function date(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function montant(p: Paiement): string {
  return `${p.montant.toLocaleString('fr-FR')} ${p.devise}`;
}

export default function AbonnementHistorique({ evenements, paiements }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="sur-titre text-encre-300 mb-3">Abonnement</p>
        {evenements.length === 0 ? (
          <p className="text-encre-500 text-sm italic">
            Aucun événement d’abonnement pour l’instant.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {evenements.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-nuit-700/50 pb-2"
              >
                <span className="text-encre-100">
                  {planParCode(e.plan)?.nom ?? e.plan} — {libelleStatut(e.statut)}
                </span>
                <span className="text-encre-500 text-xs">
                  {e.motif ? `${e.motif} · ` : ''}
                  {date(e.cree_le)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="sur-titre text-encre-300 mb-3">Paiements</p>
        {paiements.length === 0 ? (
          <p className="text-encre-500 text-sm italic">
            Aucun paiement enregistré.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {paiements.map((p) => (
              <li
                key={p.reference}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-nuit-700/50 pb-2"
              >
                <span className="text-encre-100">
                  {planParCode(p.plan)?.nom ?? p.plan} · {montant(p)}
                </span>
                <span className="text-encre-500 text-xs">
                  {p.statut} · {p.fournisseur} · {date(p.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
