// ============================================================
// components/admin/RevenusAbonnements.tsx — Indicateurs de revenus
// de l'onglet « Abonnements » (vague 2 du tableau de bord).
//
// Composant pur d'affichage : les données viennent de la RPC
// public.admin_stats_revenus via lib/admin-revenus.ts (collectées
// dans app/admin/page.tsx). Aucune donnée personnelle : des montants
// XOF, des libellés de plan et des comptages.
// ============================================================

import type { StatsRevenus } from '@/lib/admin-revenus';

function formaterXof(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} F CFA`;
}

function moisLisible(periode: string): string {
  const [annee, mois] = periode.split('-');
  if (!annee || !mois) return periode;
  const date = new Date(Number(annee), Number(mois) - 1, 1);
  if (Number.isNaN(date.getTime())) return periode;
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function CarteRevenu({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-[12px] border border-nuit-700/60 bg-nuit-800/40 p-4">
      <p className="text-encre-500 text-[11px] uppercase tracking-wider leading-tight">{libelle}</p>
      <p className="font-display text-2xl text-encre-100 mt-2 break-words">{valeur}</p>
      {detail && <p className="text-encre-500 text-xs mt-1">{detail}</p>}
    </div>
  );
}

export default function RevenusAbonnements({
  stats,
  erreur,
}: {
  stats: StatsRevenus | null;
  erreur: string | null;
}) {
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-revenus">
      <h2 id="titre-revenus" className="sur-titre text-encre-300">
        Revenus et dynamique des abonnements
      </h2>
      <div className="liseret mt-3" />

      {erreur && (
        <p className="text-encre-500 text-xs mt-3">
          Indicateurs indisponibles (migration « admin_stats_revenus » non encore appliquée ou
          accès refusé) : {erreur}
        </p>
      )}
      {!erreur && stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            <CarteRevenu
              libelle="Revenu mensuel récurrent"
              valeur={formaterXof(stats.mrrXof)}
              detail="abonnements actifs ramenés au mois"
            />
            <CarteRevenu
              libelle="Abonnements actifs"
              valeur={stats.actifsTotal.toLocaleString('fr-FR')}
              detail={
                stats.actifsParPlan.length > 0
                  ? stats.actifsParPlan
                      .map((p) => `${p.nom} (${p.actifs})`)
                      .join(' · ')
                  : undefined
              }
            />
            <CarteRevenu
              libelle="Revenu moyen par abonné"
              valeur={stats.arpuXof === null ? '—' : formaterXof(stats.arpuXof)}
              detail={`encaissé depuis l'origine : ${formaterXof(stats.encaisseTotalXof)}`}
            />
          </div>

          {stats.parMois.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <caption className="sr-only">
                  Mouvements mensuels des abonnements sur les derniers mois.
                </caption>
                <thead>
                  <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                    <th scope="col" className="py-2 font-normal">Mois</th>
                    <th scope="col" className="py-2 font-normal text-right">Nouveaux</th>
                    <th scope="col" className="py-2 font-normal text-right">Sorties</th>
                    <th scope="col" className="py-2 font-normal text-right">Encaissé</th>
                    <th scope="col" className="py-2 font-normal text-right">Paiements</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.parMois.map((m) => (
                    <tr key={m.periode} className="border-t border-nuit-700/50">
                      <th scope="row" className="py-2 text-left font-normal text-encre-300">
                        {moisLisible(m.periode)}
                      </th>
                      <td className="py-2 text-right chiffres-tabulaires text-emerald-300">
                        {m.nouveaux > 0 ? `+${m.nouveaux}` : '0'}
                      </td>
                      <td className="py-2 text-right chiffres-tabulaires text-grenat-300">
                        {m.sorties > 0 ? `−${m.sorties}` : '0'}
                      </td>
                      <td className="py-2 text-right chiffres-tabulaires text-encre-100">
                        {formaterXof(m.encaisse)}
                      </td>
                      <td className="py-2 text-right chiffres-tabulaires text-encre-300">
                        {m.paiements}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-encre-500 mt-3">
            Le revenu mensuel récurrent (MRR) estime chaque abonnement actif au prorata du mois :
            prix du plan × 30 ÷ durée en jours (un annuel de 30 000 F CFA pèse 2 466 F CFA par
            mois). Les sorties regroupent les résiliations et les expirations.
          </p>
        </>
      )}
    </section>
  );
}
