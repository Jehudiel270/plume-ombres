// ============================================================
// components/admin/AnomaliesComptes.tsx — Comptes à surveiller
// (serveur, espace ADMIN).
//
// Les anomalies sont DÉRIVÉES de la liste réelle des comptes
// (public.admin_lister_comptes) et du catalogue public des plans :
// abonnement expiré mais statut encore « actif », abonnement « actif »
// sans date de fin, plan absent du catalogue. Aucun contenu de livre
// n'est lu ni affiché.
// ============================================================

import {
  formaterDateCourte,
  LIBELLES_ANOMALIE,
  nomPlan,
  type AnomalieCompte,
  type PlanAdmin,
} from '@/lib/admin-stats';

interface Props {
  anomalies: AnomalieCompte[];
  plans: readonly PlanAdmin[];
}

export default function AnomaliesComptes({ anomalies, plans }: Props) {
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-anomalies">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-anomalies" className="sur-titre text-encre-300">
          Comptes à surveiller
        </h2>
        <a
          href="/api/admin/export?type=anomalies"
          className="bouton-fantome !px-3 text-xs"
          download
        >
          Exporter (CSV)
        </a>
      </div>
      <div className="liseret mt-3" />

      {anomalies.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-3">
          Aucune anomalie détectée : les abonnements actifs ont tous une fin à venir et un
          plan connu.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {anomalies.map(({ compte, codes }) => (
            <li
              key={compte.id}
              className="rounded-[12px] border border-grenat-500/40 bg-grenat-500/5 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-encre-100 text-sm font-semibold">{compte.pseudo}</h3>
                <span className="text-encre-500 text-xs">
                  {compte.abonnementStatut ?? 'aucun'} · {nomPlan(compte.abonnementPlan, plans)} ·
                  fin {formaterDateCourte(compte.abonnementFin)}
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {codes.map((code) => (
                  <li
                    key={code}
                    className="rounded-full border border-grenat-500/60 bg-grenat-500/15 text-grenat-300 px-2 py-0.5 text-[11px]"
                  >
                    {LIBELLES_ANOMALIE[code]}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
