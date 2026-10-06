// ============================================================
// components/admin/JournalPaiements.tsx — Derniers paiements
// (serveur, espace ADMIN).
//
// Source : public.admin_lister_paiements() (SECURITY DEFINER) :
// référence interne, compte, plan, montant, statut, fournisseur et
// opérateur. AUCUNE coordonnée bancaire (le téléphone n'est pas
// renvoyé) et aucun contenu de livre.
// ============================================================

import {
  formaterDateHeure,
  formaterMontant,
  type PaiementAdmin,
} from '@/lib/admin-stats';

interface Props {
  paiements: PaiementAdmin[];
  erreur: string | null;
}

const COULEURS_STATUT: Record<string, string> = {
  reussi: 'border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300',
  echoue: 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300',
  en_attente: 'border-nuit-700 bg-nuit-800 text-encre-300',
};

export default function JournalPaiements({ paiements, erreur }: Props) {
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-paiements">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-paiements" className="sur-titre text-encre-300">
          Derniers paiements
        </h2>
        <a
          href="/api/admin/export?type=paiements&limite=200"
          className="bouton-fantome !px-3 text-xs"
          download
        >
          Exporter (CSV)
        </a>
      </div>
      <div className="liseret mt-3" />

      {erreur ? (
        <p className="text-grenat-300 text-sm mt-3">Journal indisponible : {erreur}</p>
      ) : paiements.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-3">
          Aucun paiement enregistré pour le moment.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">
              Derniers paiements : compte, plan, montant, statut, fournisseur et date.
            </caption>
            <thead>
              <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                <th scope="col" className="py-2 pr-4 font-normal">Compte</th>
                <th scope="col" className="py-2 pr-4 font-normal">Plan</th>
                <th scope="col" className="py-2 pr-4 font-normal text-right">Montant</th>
                <th scope="col" className="py-2 pr-4 font-normal">Statut</th>
                <th scope="col" className="py-2 pr-4 font-normal">Fournisseur</th>
                <th scope="col" className="py-2 font-normal text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.reference} className="border-t border-nuit-700/50 align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    <span className="text-encre-100">{p.pseudo}</span>
                    <span className="block text-encre-500 text-[11px] break-all">{p.reference}</span>
                  </th>
                  <td className="py-3 pr-4 text-encre-300">{p.plan ?? '—'}</td>
                  <td className="py-3 pr-4 text-right text-encre-100 whitespace-nowrap">
                    {formaterMontant(p.montant, p.devise)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${
                        COULEURS_STATUT[p.statut] ?? COULEURS_STATUT.en_attente
                      }`}
                    >
                      {p.statut.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-encre-300">
                    {[p.fournisseur, p.operateur].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="py-3 text-right text-encre-500 text-xs whitespace-nowrap">
                    {formaterDateHeure(p.creeLe)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
