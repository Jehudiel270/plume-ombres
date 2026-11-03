// ============================================================
// components/admin/TableauVisites.tsx — Audience du site (serveur).
//
// Source : public.admin_stats_visites(p_jours) — comptages uniquement.
// Aucune adresse IP, aucun utilisateur identifié, aucun contenu de livre.
// ============================================================

import { evolution, type LigneComptage, type StatsVisites } from '@/lib/visites';

interface Props {
  stats: StatsVisites | null;
  erreur: string | null;
  /** Conversions observées sur la même fenêtre (comptes, achats). */
  conversions?: { comptes: number; paiements: number; volume: number; devise: string } | null;
}

function pourcentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function Barres({ lignes, vide }: { lignes: LigneComptage[]; vide: string }) {
  if (lignes.length === 0) {
    return <p className="text-encre-500 text-sm italic mt-2">{vide}</p>;
  }
  const maximum = Math.max(1, ...lignes.map((ligne) => ligne.visites));
  return (
    <ul className="mt-3 space-y-2">
      {lignes.map((ligne) => (
        <li key={ligne.libelle} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-encre-300 break-all">{ligne.libelle}</span>
            <span className="text-encre-500 text-xs whitespace-nowrap">{ligne.visites}</span>
          </div>
          <div className="mt-1 h-1 rounded bg-nuit-800">
            <div
              className="h-1 rounded bg-violet-rom-500/70"
              style={{ width: `${Math.max(2, (ligne.visites / maximum) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TableauVisites({ stats, erreur, conversions }: Props) {
  if (erreur) {
    return (
      <section className="velours p-5 sm:p-6">
        <h2 className="sur-titre text-encre-300">Audience du site</h2>
        <div className="liseret mt-3" />
        <p className="text-grenat-300 text-sm mt-3">Mesure indisponible : {erreur}</p>
      </section>
    );
  }

  if (!stats) return null;

  const { totaux, parJour } = stats;
  const maximum = Math.max(1, ...parJour.map((point) => point.visites));
  const tendance = evolution(totaux.aujourdhui, totaux.hier);
  const tauxConversion =
    conversions && totaux.uniques > 0
      ? Math.round((conversions.comptes / totaux.uniques) * 1000) / 10
      : null;

  return (
    <section className="space-y-4" aria-labelledby="titre-audience">
      <div>
        <h2 id="titre-audience" className="sur-titre text-encre-300">
          Audience du site
        </h2>
        <div className="liseret mt-3" />
        <p className="text-encre-500 text-xs mt-2">
          Mesure anonyme, sans cookie : pages vues, visiteurs de session et provenance.
          Conservée 180 jours.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Visites aujourd’hui</p>
          <p className="text-encre-100 text-lg mt-1">{totaux.aujourdhui}</p>
          <p className="text-encre-500 text-[11px] mt-1">
            {tendance === null
              ? 'pas de comparaison'
              : `${tendance >= 0 ? '+' : ''}${tendance} % vs hier`}
          </p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Visiteurs uniques</p>
          <p className="text-encre-100 text-lg mt-1">{totaux.uniques}</p>
          <p className="text-encre-500 text-[11px] mt-1">sur {stats.jours} jours</p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Pages vues</p>
          <p className="text-encre-100 text-lg mt-1">{totaux.visites}</p>
          <p className="text-encre-500 text-[11px] mt-1">
            {totaux.uniques > 0
              ? `${Math.round((totaux.visites / totaux.uniques) * 10) / 10} pages par visite`
              : 'aucune donnée'}
          </p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Comptes créés</p>
          <p className="text-encre-100 text-lg mt-1">{conversions?.comptes ?? '—'}</p>
          <p className="text-encre-500 text-[11px] mt-1">
            {tauxConversion === null ? 'taux non calculable' : `${tauxConversion} % des visiteurs`}
          </p>
        </div>
      </div>

      <figure className="velours p-5 sm:p-6">
        <figcaption className="text-encre-500 text-xs">
          Visites par jour — {stats.jours} derniers jours
        </figcaption>
        <div
          className="mt-3 flex h-32 items-end gap-[2px]"
          role="img"
          aria-label={`Visites quotidiennes sur ${stats.jours} jours, maximum ${maximum}`}
        >
          {parJour.map((point) => (
            <div
              key={point.jour}
              className="flex-1 rounded-t-[2px] bg-violet-rom-500/50 hover:bg-violet-rom-500"
              style={{ height: `${point.visites === 0 ? 1 : Math.max(3, (point.visites / maximum) * 100)}%` }}
              title={`${point.jour} · ${point.visites} visite(s) · ${point.uniques} visiteurs`}
            >
              <span className="sr-only">
                {point.jour} : {point.visites} visites, {point.uniques} visiteurs
              </span>
            </div>
          ))}
        </div>
      </figure>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="velours p-5 sm:p-6">
          <h3 className="sur-titre text-encre-300">Pages les plus vues</h3>
          <div className="liseret mt-2" />
          <Barres lignes={stats.pages} vide="Aucune page vue enregistrée sur la période." />
        </div>
        <div className="velours p-5 sm:p-6">
          <h3 className="sur-titre text-encre-300">Provenance</h3>
          <div className="liseret mt-2" />
          <Barres lignes={stats.sources} vide="Aucun lien entrant enregistré." />
          <h3 className="sur-titre text-encre-300 mt-6">Appareils</h3>
          <div className="liseret mt-2" />
          <Barres
            lignes={stats.appareils.map((ligne) => ({
              libelle: ligne.libelle,
              visites: ligne.visites,
            }))}
            vide="Aucun appareil identifié."
          />
          {stats.appareils.length > 0 && (
            <p className="text-encre-500 text-[11px] mt-3">
              {stats.appareils
                .map((ligne) => `${ligne.libelle} ${pourcentage(ligne.visites, totaux.visites)} %`)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      {conversions && (
        <div className="velours p-5 sm:p-6">
          <h3 className="sur-titre text-encre-300">Conversions sur la période</h3>
          <div className="liseret mt-2" />
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-encre-500 text-[11px] uppercase tracking-wider">Paiements</dt>
              <dd className="text-encre-100 mt-1">{conversions.paiements}</dd>
            </div>
            <div>
              <dt className="text-encre-500 text-[11px] uppercase tracking-wider">Volume</dt>
              <dd className="text-encre-100 mt-1">
                {conversions.volume.toLocaleString('fr-FR')} {conversions.devise}
              </dd>
            </div>
            <div>
              <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
                Revenu par visiteur
              </dt>
              <dd className="text-encre-100 mt-1">
                {totaux.uniques > 0
                  ? `${Math.round(conversions.volume / totaux.uniques).toLocaleString('fr-FR')} ${conversions.devise}`
                  : '—'}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
