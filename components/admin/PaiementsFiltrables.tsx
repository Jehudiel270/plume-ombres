'use client';

// ============================================================
// components/admin/PaiementsFiltrables.tsx — Suivi des paiements.
//
// Reçoit les paiements DÉJÀ chargés par la RPC admin (aucun contenu de
// livre, aucune coordonnée bancaire) et fait tout le reste côté
// navigateur : recherche instantanée, filtres, graphique et export.
// Aucune requête réseau supplémentaire, donc aucun coût Supabase.
// ============================================================

import { useEffect, useMemo, useState } from 'react';

import { formaterDateHeure, formaterMontant, type PaiementAdmin } from '@/lib/admin-stats';
import {
  FILTRES_VIDES,
  agregerPaiements,
  filtrerPaiements,
  libelleStatut,
  valeursDisponibles,
  type FiltresPaiements,
  type PeriodePaiements,
} from '@/lib/admin-paiements';

interface Props {
  paiements: PaiementAdmin[];
  erreur: string | null;
}

const PERIODES: { valeur: PeriodePaiements; libelle: string }[] = [
  { valeur: 'aujourd_hui', libelle: 'Aujourd’hui' },
  { valeur: 'sept_jours', libelle: '7 jours' },
  { valeur: 'trente_jours', libelle: '30 jours' },
  { valeur: 'tout', libelle: 'Tout' },
];

const COULEURS_STATUT: Record<string, string> = {
  reussi: 'border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300',
  echoue: 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300',
  en_attente: 'border-nuit-700 bg-nuit-800 text-encre-300',
  annule: 'border-nuit-700 bg-nuit-800 text-encre-500',
  rembourse: 'border-nuit-700 bg-nuit-800 text-encre-300',
};

const PAR_PAGE = 25;

/** Une cellule CSV ne doit jamais devenir une formule à l'ouverture. */
function celluleCsv(valeur: string | number): string {
  const texte = String(valeur);
  const dangereux = ['=', '+', '-', '@', String.fromCharCode(9), String.fromCharCode(13)]
    .some((prefixe) => texte.startsWith(prefixe));
  const sur = dangereux ? `'${texte}` : texte;
  return /[";\n\r]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
}

function formaterXof(montant: number, devise: string): string {
  return formaterMontant(montant, devise);
}

export default function PaiementsFiltrables({ paiements, erreur }: Props) {
  const [filtres, setFiltres] = useState<FiltresPaiements>(FILTRES_VIDES);
  const [page, setPage] = useState(0);
  const [copie, setCopie] = useState<string | null>(null);

  // --- Densité d'affichage (mémorisée par navigateur) ----------------
  const [dense, setDense] = useState(false);
  useEffect(() => {
    // Lecture après hydratation (localStorage n'existe pas au rendu
    // serveur) ; différée pour ne pas déclencher de rendu en cascade.
    const t = window.setTimeout(
      () => setDense(window.localStorage.getItem('plume-densite') === 'compacte'),
      0
    );
    return () => window.clearTimeout(t);
  }, []);
  function basculerDensite() {
    setDense((actuel) => {
      const suivant = !actuel;
      window.localStorage.setItem('plume-densite', suivant ? 'compacte' : 'confort');
      return suivant;
    });
  }

  // --- Filtres conservés dans l'URL ---------------------------------
  // Un filtre qu'on ne peut pas partager ni retrouver après un
  // rechargement se perd. On écrit donc les quatre filtres dans l'URL
  // avec window.history.replaceState : AUCUNE navigation, donc aucun
  // rechargement du composant serveur (le router de Next relancerait la
  // page et refermerait l'onglet ouvert).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lecture: Partial<FiltresPaiements> = {};
    const q = params.get('pay_q');
    const statut = params.get('pay_statut');
    const fournisseur = params.get('pay_fournisseur');
    const periode = params.get('pay_periode');
    if (q) lecture.recherche = q;
    if (statut) lecture.statut = statut;
    if (fournisseur) lecture.fournisseur = fournisseur;
    if (periode === 'aujourd_hui' || periode === 'sept_jours' || periode === 'trente_jours' || periode === 'tout') {
      lecture.periode = periode;
    }
    if (Object.keys(lecture).length === 0) return;
    const t = window.setTimeout(() => setFiltres((actuel) => ({ ...actuel, ...lecture })), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const poser = (cle: string, valeur: string, defaut: string) => {
      if (valeur !== '' && valeur !== defaut) params.set(cle, valeur);
      else params.delete(cle);
    };
    poser('pay_q', filtres.recherche.trim(), '');
    poser('pay_statut', filtres.statut, 'tous');
    poser('pay_fournisseur', filtres.fournisseur, 'tous');
    poser('pay_periode', filtres.periode, 'tout');
    const requete = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${requete === '' ? '' : `?${requete}`}`
    );
  }, [filtres]);

  // Recherche déposée par la palette Ctrl+K.
  useEffect(() => {
    function surRecherche(evenement: Event) {
      const detail = (evenement as CustomEvent<{ onglet?: string; texte?: string }>).detail;
      if (!detail || detail.onglet !== 'paiements' || typeof detail.texte !== 'string') return;
      setFiltres((actuel) => ({ ...actuel, recherche: detail.texte as string }));
      setPage(0);
    }
    window.addEventListener('plume:recherche', surRecherche);
    return () => window.removeEventListener('plume:recherche', surRecherche);
  }, []);

  const disponibles = useMemo(() => valeursDisponibles(paiements), [paiements]);
  const filtres_ = useMemo(() => filtrerPaiements(paiements, filtres), [paiements, filtres]);
  const agregats = useMemo(() => agregerPaiements(filtres_, 30), [filtres_]);

  const pages = Math.max(1, Math.ceil(filtres_.length / PAR_PAGE));
  const pageSure = Math.min(page, pages - 1);
  const visibles = filtres_.slice(pageSure * PAR_PAGE, pageSure * PAR_PAGE + PAR_PAGE);

  const modifier = (partiel: Partial<FiltresPaiements>) => {
    setFiltres((actuel) => ({ ...actuel, ...partiel }));
    setPage(0);
  };

  const maxSerie = Math.max(1, ...agregats.serie.map((point) => point.encaisse));

  const exporter = () => {
    const entetes = [
      'référence',
      'compte',
      'plan',
      'montant',
      'devise',
      'statut',
      'fournisseur',
      'opérateur',
      'date',
    ];
    const lignes = filtres_.map((p) =>
      [
        p.reference,
        p.pseudo,
        p.plan ?? '',
        p.montant,
        p.devise,
        libelleStatut(p.statut),
        p.fournisseur ?? '',
        p.operateur ?? '',
        p.creeLe ?? '',
      ]
        .map(celluleCsv)
        .join(';')
    );
    // BOM : Excel reconnaît l'UTF-8 et n'abîme plus les accents.
    const contenu = `\ufeff${[entetes.join(';'), ...lignes].join('\r\n')}`;
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
    lien.download = `paiements-${new Date().toISOString().slice(0, 10)}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  };

  const copierReference = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopie(reference);
      window.setTimeout(() => setCopie(null), 1500);
    } catch {
      setCopie(null);
    }
  };

  if (erreur) {
    return (
      <section className="velours p-5 sm:p-6">
        <h2 className="sur-titre text-encre-300">Suivi des paiements</h2>
        <div className="liseret mt-3" />
        <p className="text-grenat-300 text-sm mt-3">Journal indisponible : {erreur}</p>
      </section>
    );
  }

  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-paiements">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-paiements" className="sur-titre text-encre-300">
          Suivi des paiements
        </h2>
        <button type="button" onClick={exporter} className="bouton-fantome !px-3 text-xs">
          Exporter la sélection (CSV)
        </button>
      </div>
      <div className="liseret mt-3" />

      {/* ---------- Indicateurs ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Encaissé</p>
          <p className="text-encre-100 text-lg mt-1">
            {formaterXof(agregats.volume, filtres_.find((p) => p.devise)?.devise ?? 'XOF')}
          </p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Transactions</p>
          <p className="text-encre-100 text-lg mt-1">{agregats.nombre}</p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Panier moyen</p>
          <p className="text-encre-100 text-lg mt-1">
            {formaterXof(agregats.panierMoyen, 'XOF')}
          </p>
        </div>
        <div className="rounded-lg border border-nuit-700/60 bg-nuit-900/40 p-3">
          <p className="text-encre-500 text-[11px] uppercase tracking-wider">Taux de succès</p>
          <p className="text-encre-100 text-lg mt-1">
            {Math.round(agregats.tauxSucces * 100)} %
          </p>
        </div>
      </div>

      {/* ---------- Filtres ---------- */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[220px]">
            <span className="sr-only">Rechercher un paiement</span>
            <input
              type="search"
              value={filtres.recherche}
              onChange={(evenement) => modifier({ recherche: evenement.target.value })}
              placeholder="Référence, compte, montant, opérateur…"
              className="w-full rounded-md border border-nuit-700 bg-nuit-900/60 px-3 py-2 text-sm text-encre-100 placeholder:text-encre-500 focus:border-violet-rom-500 focus:outline-none"
            />
          </label>

          <label className="text-xs text-encre-500">
            Statut
            <select
              value={filtres.statut}
              onChange={(evenement) => modifier({ statut: evenement.target.value })}
              className="ml-2 rounded-md border border-nuit-700 bg-nuit-900/60 px-2 py-2 text-sm text-encre-100 focus:border-violet-rom-500 focus:outline-none"
            >
              <option value="tous">Tous</option>
              {disponibles.statuts.map((statut) => (
                <option key={statut.valeur} value={statut.valeur}>
                  {statut.libelle}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-encre-500">
            Fournisseur
            <select
              value={filtres.fournisseur}
              onChange={(evenement) => modifier({ fournisseur: evenement.target.value })}
              className="ml-2 rounded-md border border-nuit-700 bg-nuit-900/60 px-2 py-2 text-sm text-encre-100 focus:border-violet-rom-500 focus:outline-none"
            >
              <option value="tous">Tous</option>
              {disponibles.fournisseurs.map((fournisseur) => (
                <option key={fournisseur} value={fournisseur}>
                  {fournisseur}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Période">
          {PERIODES.map((periode) => {
            const actif = filtres.periode === periode.valeur;
            return (
              <button
                key={periode.valeur}
                type="button"
                aria-pressed={actif}
                onClick={() => modifier({ periode: periode.valeur })}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  actif
                    ? 'border-violet-rom-500/70 bg-violet-rom-500/20 text-violet-rom-200'
                    : 'border-nuit-700 text-encre-500 hover:text-encre-300'
                }`}
              >
                {periode.libelle}
              </button>
            );
          })}
          {(filtres.recherche ||
            filtres.statut !== 'tous' ||
            filtres.fournisseur !== 'tous' ||
            filtres.periode !== 'tout') && (
            <button
              type="button"
              onClick={() => setFiltres(FILTRES_VIDES)}
              className="ml-2 text-xs text-encre-500 underline underline-offset-4 hover:text-encre-300"
            >
              Réinitialiser
            </button>
          )}
          <button
            type="button"
            onClick={basculerDensite}
            aria-pressed={dense}
            className={`ml-2 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              dense
                ? 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300'
                : 'border-nuit-700 text-encre-500 hover:text-encre-300'
            }`}
            title="Affiche plus de lignes à l’écran (mémorisé sur cet appareil)"
          >
            Vue compacte
          </button>
        </div>
      </div>

      {/* ---------- Graphique ---------- */}
      <figure className="mt-6">
        <figcaption className="text-encre-500 text-xs">
          Montant encaissé par jour — 30 derniers jours (période filtrée)
        </figcaption>
        <div className="mt-2 flex h-32 items-end gap-[3px]" role="img"
          aria-label={`Encaissements quotidiens, maximum ${formaterXof(maxSerie, 'XOF')}`}>
          {agregats.serie.map((point) => {
            const hauteur = point.encaisse === 0 ? 2 : Math.max(4, Math.round((point.encaisse / maxSerie) * 100));
            return (
              <div
                key={point.jour}
                className="group relative flex-1 rounded-t-[2px] bg-violet-rom-500/50 hover:bg-violet-rom-500"
                style={{ height: `${hauteur}%` }}
                title={`${point.jour} · ${formaterXof(point.encaisse, 'XOF')} · ${point.nombre} paiement(s)`}
              >
                <span className="sr-only">
                  {point.jour} : {formaterXof(point.encaisse, 'XOF')}
                </span>
              </div>
            );
          })}
        </div>
      </figure>

      {/* ---------- Répartition ---------- */}
      {agregats.parStatut.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {agregats.parStatut.map((ligne) => (
            <span
              key={ligne.statut}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                COULEURS_STATUT[ligne.statut] ?? COULEURS_STATUT.en_attente
              }`}
            >
              {ligne.libelle} · {ligne.nombre}
            </span>
          ))}
        </div>
      )}

      {/* ---------- Tableau ---------- */}
      {filtres_.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-5">
          Aucun paiement ne correspond à ces filtres.
        </p>
      ) : (
        <>
          <div className={`mt-5 overflow-x-auto ${dense ? 'densite-compacte' : ''}`}>
            <table className="w-full min-w-[720px] text-sm chiffres-tabulaires">
              <caption className="sr-only">
                Paiements filtrés : compte, plan, montant, statut, fournisseur et date.
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
                {visibles.map((p) => (
                  <tr key={p.reference} className="border-t border-nuit-700/50 align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-normal">
                      <span className="text-encre-100">{p.pseudo}</span>
                      <button
                        type="button"
                        onClick={() => copierReference(p.reference)}
                        title="Copier la référence"
                        className="block text-encre-500 text-[11px] break-all text-left hover:text-violet-rom-300"
                      >
                        {copie === p.reference ? 'référence copiée ✓' : p.reference}
                      </button>
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
                        {libelleStatut(p.statut)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-encre-300">
                      {[p.fournisseur, p.operateur].filter(Boolean).join(' · ') || '—'}
                      {p.referenceFournisseur && (
                        <span className="block text-encre-500 text-[11px] break-all">
                          {p.referenceFournisseur}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-encre-500 text-xs whitespace-nowrap">
                      {formaterDateHeure(p.creeLe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-encre-500">
            <span>
              {filtres_.length} paiement{filtres_.length > 1 ? 's' : ''} sur {paiements.length}
            </span>
            {pages > 1 && (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, pageSure - 1))}
                  disabled={pageSure === 0}
                  className="rounded border border-nuit-700 px-2 py-1 disabled:opacity-40"
                >
                  Précédent
                </button>
                <span>
                  {pageSure + 1} / {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pages - 1, pageSure + 1))}
                  disabled={pageSure >= pages - 1}
                  className="rounded border border-nuit-700 px-2 py-1 disabled:opacity-40"
                >
                  Suivant
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
