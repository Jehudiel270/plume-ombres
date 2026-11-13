// ============================================================
// components/admin/JournalWebhooks.tsx — Journal des livraisons de
// webhook, dans l'onglet « Paiements » (vague 2 du tableau de bord).
//
// Montre ce que l'émetteur (FedaPay) a livré : événements traités,
// retentes (« déjà traité ») et échecs avec le statut HTTP renvoyé.
// Composant pur : les lignes sont chargées côté serveur
// (app/admin/page.tsx, lecture RLS réservée aux administrateurs).
// ============================================================

import type { LivraisonWebhook } from '@/lib/admin-webhooks';
import { bilanWebhooks } from '@/lib/admin-webhooks';

const STATUTS_ERREUR = [400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503, 504];

function classeStatut(statut: number): string {
  if (statut >= 200 && statut < 300) return 'text-emerald-300';
  if (STATUTS_ERREUR.includes(statut)) return 'text-grenat-300';
  return 'text-encre-300';
}

function heureLisible(iso: string | null): string {
  if (!iso) return '—';
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '—';
  return new Date(instant).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function JournalWebhooks({
  livraisons,
  erreur,
}: {
  livraisons: LivraisonWebhook[];
  erreur: string | null;
}) {
  const { echecs, retentes } = bilanWebhooks(livraisons);

  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-webhooks">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-webhooks" className="sur-titre text-encre-300">
          Livraisons de webhook (paiement)
        </h2>
        <span className="text-xs text-encre-500">
          {livraisons.length} livraison{livraisons.length > 1 ? 's' : ''}
          {echecs > 0 ? ` — ${echecs} en échec` : ''}
          {retentes > 0 ? ` — ${retentes} retente${retentes > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      <div className="liseret mt-3" />

      {erreur ? (
        <p className="text-encre-500 text-xs mt-3">
          Journal indisponible (migration « evenements_webhook » non encore appliquée, ou accès
          refusé) : {erreur}
        </p>
      ) : livraisons.length === 0 ? (
        <p className="text-encre-500 text-sm mt-3 italic">
          Aucune livraison reçue pour le moment. Les notifications de paiement apparaîtront ici
          dès la première transaction (ou le bouton « Tester » de FedaPay).
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">
              Dernières livraisons de webhook de paiement reçues par le site.
            </caption>
            <thead>
              <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                <th scope="col" className="py-2 pr-2 font-normal">Reçue le</th>
                <th scope="col" className="py-2 pr-2 font-normal">Événement</th>
                <th scope="col" className="py-2 pr-2 font-normal">Référence</th>
                <th scope="col" className="py-2 pr-2 font-normal">Statut</th>
                <th scope="col" className="py-2 pr-2 font-normal">Résultat</th>
                <th scope="col" className="py-2 font-normal">Détail</th>
              </tr>
            </thead>
            <tbody>
              {livraisons.map((l) => (
                <tr key={l.id} className="border-t border-nuit-700/50 align-top">
                  <td className="py-2 pr-2 chiffres-tabulaires text-encre-300 whitespace-nowrap">
                    {heureLisible(l.creeLe)}
                  </td>
                  <td className="py-2 pr-2 text-encre-300">
                    {l.evenement ?? '—'}
                  </td>
                  <td className="py-2 pr-2 chiffres-tabulaires text-encre-300">
                    {l.reference ?? '—'}
                  </td>
                  <td className={'py-2 pr-2 chiffres-tabulaires ' + classeStatut(l.statutHttp)}>
                    {l.statutHttp}
                  </td>
                  <td className="py-2 pr-2">
                    {!l.traite ? (
                      <span className="inline-block rounded-full px-2 py-0.5 text-xs border text-grenat-300 border-grenat-500/40 bg-grenat-500/10">
                        Échec
                      </span>
                    ) : l.dejaTraite ? (
                      <span className="inline-block rounded-full px-2 py-0.5 text-xs border text-or-ros-300 border-or-ros-300/40 bg-or-ros-300/10">
                        Déjà traité
                      </span>
                    ) : (
                      <span className="inline-block rounded-full px-2 py-0.5 text-xs border text-emerald-300 border-emerald-500/40 bg-emerald-500/10">
                        Traité
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-encre-500 text-xs max-w-[260px]">
                    {l.erreur ? (
                      <span className="block truncate" title={l.erreur}>
                        {l.erreur}
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-encre-500 mt-3">
            « Déjà traité » signifie que l’émetteur a renvoyé une notification déjà appliquée
            (retente ou doublon) : le site répond OK sans livrer deux fois. Les 30 dernières
            livraisons sont conservées à l’écran.
          </p>
        </div>
      )}
    </section>
  );
}
