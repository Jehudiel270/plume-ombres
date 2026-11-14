'use client';

// ============================================================
// components/univers/OngletsSaga.tsx — « La saga, tomes confondus »
// (portage fidèle de la maquette : UniverseCharacterMatrix,
// UniverseTimeline et UniverseRelations).
//
//   • PERSONNAGES : matrice personnage × tome — une pastille par
//     apparition visible, un cadenas pour ce qui reste masqué,
//     ligne dépliable avec le détail tome par tome ;
//   • CHRONOLOGIE : événements de tous les tomes, filtrables par
//     personnage ;
//   • RELATIONS : une frise par paire de personnages (évolution
//     d'un tome à l'autre).
//
// TOUTES les données reçues sont déjà filtrées par le serveur
// (chargerGraphe par tome) : rien de masqué n'arrive ici.
// ============================================================

import { Fragment, useMemo, useState } from 'react';

import { GENRES_EVENEMENT, TYPES_RELATION } from '@/lib/graphe';
import type { SagaAgregat } from '@/lib/univers-saga';

interface Props {
  saga: SagaAgregat;
  /** Rang → titre, pour les en-têtes de colonnes. */
  titresParRang: Record<number, string>;
}

type Onglet = 'personnages' | 'chronologie' | 'relations';

const ONGLETS: Array<{ valeur: Onglet; libelle: string }> = [
  { valeur: 'personnages', libelle: 'Personnages' },
  { valeur: 'chronologie', libelle: 'Chronologie' },
  { valeur: 'relations', libelle: 'Relations' },
];

function initiales(nom: string): string {
  const morceaux = nom.trim().split(/\s+/);
  if (morceaux.length === 1) return morceaux[0]!.slice(0, 2).toUpperCase();
  return (morceaux[0]!.slice(0, 1) + morceaux[1]!.slice(0, 1)).toUpperCase();
}

function LibelleRole({ role }: { role: string }) {
  const libelles: Record<string, string> = {
    protagoniste: 'Protagoniste',
    antagoniste: 'Antagoniste',
    allie: 'Allié',
    secondaire: 'Secondaire',
    autre: 'Autre',
  };
  return <>{libelles[role] ?? 'Autre'}</>;
}

function MatricePersonnages({ saga, titresParRang }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const rangs = Object.keys(titresParRang).map(Number).sort((a, b) => a - b);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-nuit-700">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <caption className="sr-only">
            Présence des personnages par tome, selon votre progression de lecture
          </caption>
          <thead>
            <tr className="bg-nuit-800 text-left">
              <th
                scope="col"
                className="sticky left-0 z-[1] bg-nuit-800 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-encre-500"
              >
                Personnage
              </th>
              {rangs.map((rang) => (
                <th
                  key={rang}
                  scope="col"
                  className="px-3 py-3 text-center align-bottom"
                  title={titresParRang[rang]}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-encre-300">
                    T{rang}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {saga.personnages.map((personnage) => {
              const estOuvert = ouvert === personnage.cle;
              return (
                <Fragment key={personnage.cle}>
                  <tr
                    className={`border-t border-nuit-700 ${estOuvert ? 'bg-nuit-800' : ''}`}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] bg-nuit-950 px-4 py-2.5 text-left font-normal"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2.5 text-left"
                        aria-expanded={estOuvert}
                        onClick={() => setOuvert(estOuvert ? null : personnage.cle)}
                      >
                        <span
                          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-grenat-700 text-[10px] font-semibold text-encre-100"
                          aria-hidden="true"
                        >
                          {initiales(personnage.nom)}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-encre-100">
                            {personnage.nom}
                          </span>
                          <span className="block text-[11px] text-encre-500">
                            <LibelleRole role={personnage.role} />
                          </span>
                        </span>
                      </button>
                    </th>
                    {rangs.map((rang) => {
                      const apparitions = personnage.apparitions[rang] ?? 0;
                      const liens = personnage.liens[rang] ?? 0;
                      const visible = personnage.tomes.includes(rang);
                      if (!visible) {
                        return (
                          <td
                            key={rang}
                            className="px-3 py-2.5 text-center text-encre-500"
                            aria-label="Tome sans apparition visible"
                          >
                            —
                          </td>
                        );
                      }
                      const total = apparitions + liens;
                      return (
                        <td key={rang} className="px-3 py-2.5 text-center">
                          {total > 0 ? (
                            <span
                              className="inline-flex items-center gap-1"
                              aria-label={`${total} trace${total > 1 ? 's' : ''} visible${
                                total > 1 ? 's' : ''
                              }`}
                            >
                              {Array.from({ length: Math.min(total, 5) }).map((_, i) => (
                                <i
                                  key={i}
                                  className="h-2.5 w-2.5 rounded-full bg-grenat-500"
                                />
                              ))}
                              {total > 5 && (
                                <span className="text-[11px] text-encre-500">+{total - 5}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-encre-500" aria-label="Présent, sans détail">
                              ·
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {estOuvert && (
                    <tr className="border-t border-nuit-700 bg-nuit-800">
                      <td colSpan={rangs.length + 1} className="px-4 py-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          {rangs
                            .filter((rang) => personnage.tomes.includes(rang))
                            .map((rang) => (
                              <div
                                key={rang}
                                className="rounded-lg border border-nuit-700 bg-nuit-850 p-3"
                              >
                                <div className="sur-titre mb-1.5 text-encre-500">
                                  Tome {rang} · {titresParRang[rang]}
                                </div>
                                <ul className="space-y-1.5 text-[13px] text-encre-300">
                                  <li>
                                    <span className="text-encre-500">
                                      {(personnage.apparitions[rang] ?? 0) + (personnage.liens[rang] ?? 0) ===
                                      0
                                        ? 'Présent, sans événement ni relation documenté à ce stade.'
                                        : `${personnage.apparitions[rang] ?? 0} événement${
                                            (personnage.apparitions[rang] ?? 0) > 1 ? 's' : ''
                                          } · ${personnage.liens[rang] ?? 0} relation${
                                            (personnage.liens[rang] ?? 0) > 1 ? 's' : ''
                                          } documenté${
                                            (personnage.apparitions[rang] ?? 0) +
                                              (personnage.liens[rang] ?? 0) >
                                            1
                                              ? 's'
                                              : ''
                                          }.`}
                                    </span>
                                  </li>
                                </ul>
                              </div>
                            ))}
                        </div>
                        {personnage.description && (
                          <p className="mt-3 text-[13px] italic text-encre-500">
                            {personnage.description}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-encre-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-grenat-500" />
          une trace visible (événement ou relation)
        </span>
        <span>· présent, sans détail documenté</span>
        <span>— tome sans apparition visible</span>
      </p>
      {Object.values(saga.personnagesMasquesParTome).some((n) => n > 0) && (
        <p className="mt-2 text-[13px] text-encre-300">
          {Object.entries(saga.personnagesMasquesParTome)
            .filter(([, n]) => n > 0)
            .map(([rang, n]) => `tome ${rang} : ${n}`)
            .join(' · ')}{' '}
          — des personnages restent à découvrir au fil de votre lecture.
        </p>
      )}
    </div>
  );
}

function Chronologie({ saga, titresParRang }: Props) {
  const [personnage, setPersonnage] = useState('tous');
  const noms = useMemo(() => {
    const vues = new Set<string>();
    for (const evenement of saga.evenements) {
      for (const nom of evenement.personnages) vues.add(nom);
    }
    return [...vues].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [saga.evenements]);

  const groupes = useMemo(() => {
    const parTome = new Map<number, typeof saga.evenements>();
    for (const evenement of saga.evenements) {
      if (
        personnage !== 'tous' &&
        !evenement.personnages.includes(personnage)
      ) {
        continue;
      }
      const liste = parTome.get(evenement.tome) ?? [];
      liste.push(evenement);
      parTome.set(evenement.tome, liste);
    }
    return [...parTome.entries()].sort((a, b) => a[0] - b[0]);
  }, [saga.evenements, personnage]);

  const total = groupes.reduce((somme, [, liste]) => somme + liste.length, 0);

  return (
    <div>
      <div
        className="mb-5 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filtrer par personnage"
      >
        <button
          type="button"
          onClick={() => setPersonnage('tous')}
          aria-pressed={personnage === 'tous'}
          className={`min-h-8 rounded-full px-3 text-xs ${
            personnage === 'tous'
              ? 'bouton-principal'
              : 'border border-nuit-700 bg-nuit-850 text-encre-300'
          }`}
        >
          Tous les personnages
        </button>
        {noms.map((nom) => (
          <button
            key={nom}
            type="button"
            onClick={() => setPersonnage(nom)}
            aria-pressed={personnage === nom}
            className={`min-h-8 rounded-full px-3 text-xs ${
              personnage === nom
                ? 'bouton-principal'
                : 'border border-nuit-700 bg-nuit-850 text-encre-300'
            }`}
          >
            {nom}
          </button>
        ))}
      </div>

      {groupes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
          Aucun événement visible pour l'instant : documentez-en depuis le graphe
          de chaque tome.
        </p>
      ) : (
        <ol className="relative space-y-8 border-l border-nuit-700 pl-6">
          {groupes.map(([rang, liste]) => (
            <li key={rang} className="relative">
              <span
                className="absolute -left-[31px] top-0.5 h-[11px] w-[11px] rounded-full border-2 border-nuit-950 bg-grenat-500"
                aria-hidden="true"
              />
              <h3 className="font-display text-xl text-encre-100">
                Tome {rang}{' '}
                <span className="text-encre-300">· {titresParRang[rang]}</span>
              </h3>
              <ul className="mt-3 space-y-2.5">
                {liste.map((evenement) => (
                  <li
                    key={`${evenement.tome}-${evenement.chapitre}-${evenement.titre}`}
                    className="rounded-lg border border-nuit-700 bg-nuit-800 p-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-encre-100">
                        {evenement.titre}
                      </span>
                      <span className="text-[11px] text-encre-500">
                        Chapitre {evenement.chapitre} ·{' '}
                        {GENRES_EVENEMENT[evenement.genre].libelle}
                      </span>
                    </div>
                    {evenement.texte && (
                      <p className="mt-1 text-[13px] leading-relaxed text-encre-300">
                        {evenement.texte}
                      </p>
                    )}
                    {evenement.personnages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {evenement.personnages.map((nom) => (
                          <span
                            key={nom}
                            className="rounded-full bg-nuit-850 px-2 py-0.5 text-[11px] text-encre-300"
                          >
                            {nom}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-[12px] text-encre-500">
        {total} événement{total > 1 ? 's' : ''} visible{total > 1 ? 's' : ''}.
      </p>
    </div>
  );
}

function Evolutions({ saga }: Props) {
  if (saga.evolutions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
        Aucune relation visible : documentez-en depuis le graphe de chaque tome.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {saga.evolutions.map((evolution) => (
        <li key={`${evolution.cleA}||${evolution.cleB}`} className="velours rounded-xl p-4">
          <div className="mb-3 flex items-center gap-2 font-display text-xl text-encre-100">
            {evolution.nomA}
            <span className="text-encre-500">/</span>
            {evolution.nomB}
          </div>
          <ol className="space-y-0">
            {evolution.etapes.map((etape, indice) => (
              <li
                key={`${etape.tome}-${etape.chapitre}-${indice}`}
                className="relative flex gap-3 pb-4 last:pb-0"
              >
                {indice < evolution.etapes.length - 1 && (
                  <span
                    className="absolute left-[7px] top-4 h-full w-px bg-nuit-700"
                    aria-hidden="true"
                  />
                )}
                <span
                  className="relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-nuit-850"
                  style={{ background: TYPES_RELATION[etape.type].couleur }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        background: `${TYPES_RELATION[etape.type].couleur}22`,
                        color: TYPES_RELATION[etape.type].couleur,
                      }}
                    >
                      {TYPES_RELATION[etape.type].libelle}
                    </span>
                    <span className="text-sm font-medium text-encre-100">
                      {etape.libelle}
                    </span>
                    <span className="text-[11px] text-encre-500">
                      Tome {etape.tome}, ch. {etape.chapitre}
                    </span>
                  </div>
                  {etape.etat && (
                    <p className="mt-0.5 text-[13px] text-encre-300">
                      {etape.etat}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}

export default function OngletsSaga(props: Props) {
  const [onglet, setOnglet] = useState<Onglet>('personnages');
  const visible: Record<Onglet, React.ReactNode> = {
    personnages: <MatricePersonnages {...props} />,
    chronologie: <Chronologie {...props} />,
    relations: <Evolutions {...props} />,
  };

  return (
    <div>
      <div
        className="mb-5 flex flex-wrap gap-1"
        role="tablist"
        aria-label="Vues de la saga, tomes confondus"
      >
        {ONGLETS.map((item) => (
          <button
            key={item.valeur}
            type="button"
            role="tab"
            aria-selected={onglet === item.valeur}
            onClick={() => setOnglet(item.valeur)}
            className={`min-h-10 rounded-lg px-4 text-sm ${
              onglet === item.valeur
                ? 'bouton-principal'
                : 'bouton-fantome border border-nuit-700 bg-nuit-850'
            }`}
          >
            {item.libelle}
          </button>
        ))}
      </div>
      <div role="tabpanel">{visible[onglet]}</div>
    </div>
  );
}
