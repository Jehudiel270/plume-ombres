// ============================================================
// components/admin/RepartitionAbonnements.tsx — Vue « abonnements
// & crédits » (serveur, espace ADMIN).
//
// Source : public.admin_stats_abonnements() (SECURITY DEFINER). Ne
// renvoie que des NOMBRES et des libellés de plan/pack — jamais un
// contenu de livre. Aucun nom de fournisseur de traduction ici.
// ============================================================

import {
  formaterMontant,
  formaterNombre,
  formaterPeriode,
  type StatsAbonnementsAdmin,
} from '@/lib/admin-stats';

interface Props {
  stats: StatsAbonnementsAdmin | null;
  erreur: string | null;
}

function Indicateur({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-[12px] border border-nuit-700 bg-nuit-800/60 p-3 sm:p-4">
      <p className="text-encre-500 text-[11px] uppercase tracking-wider leading-tight">{libelle}</p>
      <p className="font-display text-xl sm:text-2xl text-encre-100 mt-1 break-words">{valeur}</p>
      {detail && <p className="text-encre-500 text-[11px] mt-1">{detail}</p>}
    </div>
  );
}

export default function RepartitionAbonnements({ stats, erreur }: Props) {
  if (erreur || !stats) {
    return (
      <section className="velours p-5 sm:p-6" aria-labelledby="titre-abonnements">
        <h2 id="titre-abonnements" className="sur-titre text-encre-300">
          Abonnements &amp; crédits
        </h2>
        <div className="liseret mt-3" />
        <p className="text-grenat-300 text-sm mt-3">
          Répartition indisponible : {erreur ?? 'aucune donnée.'}
        </p>
      </section>
    );
  }

  const { credits, paiements, parPlan, parStatut } = stats;

  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-abonnements">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-abonnements" className="sur-titre text-encre-300">
          Abonnements &amp; crédits
        </h2>
        <p className="text-encre-500 text-xs">
          {formaterNombre(stats.abonnementsActifs)} actif
          {stats.abonnementsActifs > 1 ? 's' : ''} sur {formaterNombre(stats.abonnementsTotal)}
        </p>
      </div>
      <div className="liseret mt-3" />

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicateur
          libelle="Abonnements actifs"
          valeur={formaterNombre(stats.abonnementsActifs)}
          detail={`${formaterNombre(stats.abonnementsTotal)} au total`}
        />
        <Indicateur
          libelle="Expirés non résiliés"
          valeur={formaterNombre(stats.abonnementsExpiresNonResilies)}
          detail="à résilier"
        />
        <Indicateur
          libelle="Crédits vendus"
          valeur={formaterNombre(credits.vendusTotal)}
          detail={`${formaterNombre(credits.packsVendus)} pack(s) · ${formaterMontant(credits.montantVendu)}`}
        />
        <Indicateur
          libelle="Crédits consommés"
          valeur={formaterNombre(credits.consommesTotal)}
          detail={`solde restant : ${formaterNombre(credits.soldeTotal)}`}
        />
      </div>

      <h3 className="sur-titre text-encre-500 mt-6">Répartition par plan</h3>
      {parPlan.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-2">Aucun abonnement enregistré.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">
              Répartition des abonnements par plan, avec statut actif, expiré non résilié et total.
            </caption>
            <thead>
              <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                <th scope="col" className="py-2 pr-4 font-normal">Plan</th>
                <th scope="col" className="py-2 pr-4 font-normal text-right">Actifs</th>
                <th scope="col" className="py-2 pr-4 font-normal text-right">Expirés</th>
                <th scope="col" className="py-2 pr-4 font-normal text-right">Autres</th>
                <th scope="col" className="py-2 font-normal text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {parPlan.map((l) => (
                <tr key={l.plan} className="border-t border-nuit-700/50">
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-encre-100">
                    {l.nom}
                    <span className="text-encre-500 text-[11px] block">{l.plan}</span>
                  </th>
                  <td className="py-2 pr-4 text-right text-violet-rom-300">{formaterNombre(l.actifs)}</td>
                  <td className="py-2 pr-4 text-right text-grenat-300">{formaterNombre(l.expires)}</td>
                  <td className="py-2 pr-4 text-right text-encre-300">{formaterNombre(l.autres)}</td>
                  <td className="py-2 text-right text-encre-100">{formaterNombre(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="sur-titre text-encre-500">Crédits prépayés par pack</h3>
          {credits.parPack.length === 0 ? (
            <p className="text-encre-500 text-sm italic mt-2">Aucun pack vendu.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {credits.parPack.map((p) => (
                <li
                  key={p.pack}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-nuit-700/60 bg-nuit-800/40 px-3 py-2"
                >
                  <span className="text-encre-100 text-sm">{p.nom}</span>
                  <span className="text-encre-500 text-xs">
                    {formaterNombre(p.quantite)} × {formaterNombre(p.caracteres)} car. ·{' '}
                    {formaterMontant(p.montant)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="sur-titre text-encre-500">Paiements</h3>
          {paiements.total === 0 ? (
            <p className="text-encre-500 text-sm italic mt-2">Aucun paiement enregistré.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              <li className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-nuit-700/60 bg-nuit-800/40 px-3 py-2">
                <span className="text-encre-100 text-sm">Montant encaissé</span>
                <span className="text-violet-rom-300 text-sm">
                  {formaterMontant(paiements.montantReussi)}
                </span>
              </li>
              {paiements.parStatut.map((s) => (
                <li
                  key={s.statut}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-nuit-700/60 bg-nuit-800/40 px-3 py-2"
                >
                  <span className="text-encre-300 text-sm">Statut « {s.statut} »</span>
                  <span className="text-encre-100 text-xs">
                    {formaterNombre(s.total)} · {formaterMontant(s.montant)}
                  </span>
                </li>
              ))}
              {paiements.parFournisseur.map((f) => (
                <li
                  key={f.fournisseur}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-nuit-700/60 bg-nuit-800/40 px-3 py-2"
                >
                  <span className="text-encre-300 text-sm">Fournisseur {f.fournisseur}</span>
                  <span className="text-encre-100 text-xs">{formaterNombre(f.total)}</span>
                </li>
              ))}
              {paiements.dernier && (
                <li className="text-encre-500 text-xs">
                  Dernier paiement le {new Date(paiements.dernier).toLocaleDateString('fr-FR')}.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {parStatut.length > 0 && (
        <p className="text-encre-500 text-[11px] mt-4">
          Statuts d’abonnement :{' '}
          {parStatut.map((s) => `${s.statut} (${formaterNombre(s.total)})`).join(' · ')}
        </p>
      )}

      {stats.parMois.length > 0 && (
        <p className="text-encre-500 text-[11px] mt-1">
          Événements d’abonnement par mois :{' '}
          {stats.parMois
            .map((m) => `${formaterPeriode(m.periode)} (${formaterNombre(m.total)})`)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}
