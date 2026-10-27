// ============================================================
// components/AbonnementHistorique.tsx — Historique (P0.9).
// Composant serveur : événements d'abonnement + paiements.
// ============================================================

import { libelleStatut, planParCode, libelleCaracteres } from '@/lib/abonnement';
import type { EvenementAbonnement } from '@/lib/abonnement';
import type { MouvementCredit, Paiement } from '@/lib/paiement/types';

interface Props {
  evenements: EvenementAbonnement[];
  paiements: Paiement[];
  /** Journal des crédits prépayés (facultatif : additif). */
  mouvements?: MouvementCredit[];
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

/** Statut de paiement lisible : jamais l'énumération brute en base. */
function libellePaiement(statut: Paiement['statut']): string {
  const libelles: Record<string, string> = {
    en_attente: 'En attente',
    reussi: 'Payé',
    echoue: 'Échoué',
    annule: 'Annulé',
    rembourse: 'Remboursé',
  };
  return libelles[statut] ?? statut;
}

export default function AbonnementHistorique({
  evenements,
  paiements,
  mouvements = [],
}: Props) {
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
                  {libellePaiement(p.statut)} · {p.fournisseur} · {date(p.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Crédits prépayés (P0.9+) : journal des recharges.
          Additif : aucun impact si le compte n'a jamais acheté de pack. */}
      {mouvements.length > 0 && (
        <div>
          <p className="sur-titre text-encre-300 mb-3">Crédits</p>
          <ul className="space-y-2 text-sm">
            {mouvements.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-nuit-700/50 pb-2"
              >
                <span className="text-encre-100">
                  + {libelleCaracteres(m.caracteres)}
                  {planParCode(m.pack_code)?.nom
                    ? ` — ${planParCode(m.pack_code)?.nom}`
                    : ''}
                </span>
                <span className="text-encre-500 text-xs">
                  {m.montant !== null
                    ? `${m.montant.toLocaleString('fr-FR')} ${m.devise ?? 'XOF'} · `
                    : ''}
                  {date(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
