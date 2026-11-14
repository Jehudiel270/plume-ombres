'use client';

// ============================================================
// components/univers/FriseSaga.tsx — « La saga en un regard » :
// frise ARBORÉE des tomes (portage fidèle de la maquette
// components/universe/UniverseTomeMap.vue).
//
//   • un nœud par tome (plaque-titre stylisée, état de lecture) ;
//   • un LIEN entre tomes adjacents : le nombre de personnages
//     communs VISIBLES (jamais de nom révélé avant l'heure) ;
//   • des « racines » : les avatars des personnages visibles du tome.
//
// Le clic (ou le clavier) ouvre le détail du tome via ?tome=N.
// Toutes les données reçues sont DÉJÀ filtrées par le serveur.
// ============================================================

import Link from 'next/link';

import type { SagaLienTomes } from '@/lib/univers-saga';

export type EtatTome = 'lu' | 'en_cours' | 'non_commence';

export interface TomeFrise {
  rang: number;
  id: string;
  titre: string;
  auteur: string | null;
  totalChapitres: number;
  chapitresLus: number;
  etat: EtatTome;
  /** Noms des personnages VISIBLES dans ce tome (max 6 affichés). */
  racines: string[];
}

interface Props {
  universId: string;
  tomes: TomeFrise[];
  liens: SagaLienTomes[];
  tomeActif: number;
}

const LIBELLE_ETAT: Record<EtatTome, string> = {
  lu: 'Lu',
  en_cours: 'En cours',
  non_commence: 'Non commencé',
};

function pourcentage(tome: TomeFrise): number {
  if (tome.totalChapitres <= 0) return 0;
  return Math.min(100, Math.round((tome.chapitresLus / tome.totalChapitres) * 100));
}

function initiales(nom: string): string {
  const morceaux = nom.trim().split(/\s+/);
  if (morceaux.length === 1) return morceaux[0]!.slice(0, 2).toUpperCase();
  return (morceaux[0]!.slice(0, 1) + morceaux[1]!.slice(0, 1)).toUpperCase();
}

export default function FriseSaga({ universId, tomes, liens, tomeActif }: Props) {
  const lienVersSuivant = new Map(
    liens.map((l) => [l.depuis, l] as const)
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-nuit-700 bg-nuit-850">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(209,20,47,.16), transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="relative flex items-start gap-0 overflow-x-auto px-4 pb-5 pt-6 sm:px-8"
        role="group"
        aria-label="Tomes de la saga"
      >
        {tomes.map((tome, indice) => {
          const lien = lienVersSuivant.get(tome.rang);
          return (
            <div key={tome.id} className="flex items-start gap-0">
              {/* Lien inter-tomes (personnages communs) */}
              {indice > 0 && (
                <div className="flex h-[225px] min-w-[72px] flex-1 flex-col items-center justify-center px-1 sm:h-[258px] sm:min-w-[110px]">
                  <svg
                    viewBox="0 0 100 14"
                    preserveAspectRatio="none"
                    className="h-3.5 w-full"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 7 C 30 0, 70 14, 100 7"
                      fill="none"
                      stroke={lien && lien.communs.length > 0 ? '#ff5a73' : '#42283a'}
                      strokeWidth={1.6}
                      strokeDasharray={lien && lien.communs.length > 0 ? '0' : '4 4'}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="mt-1.5 max-w-[120px] text-center text-[11px] leading-tight text-encre-500">
                    {lien && lien.communs.length > 0 ? (
                      <>
                        <span className="text-grenat-400" aria-hidden="true">
                          ◆
                        </span>{' '}
                        {lien.communs.length} personnage
                        {lien.communs.length > 1 ? 's' : ''} commun
                        {lien.communs.length > 1 ? 's' : ''}
                      </>
                    ) : (
                      'Lien à documenter'
                    )}
                  </div>
                </div>
              )}

              {/* Nœud du tome */}
              <div className="w-[150px] shrink-0 sm:w-[172px]">
                <Link
                  href={`/univers/${universId}?tome=${tome.rang}`}
                  aria-current={tome.rang === tomeActif ? 'true' : undefined}
                  aria-label={`Tome ${tome.rang} : ${tome.titre}, ${
                    LIBELLE_ETAT[tome.etat]
                  }`}
                  className={`group block w-full rounded-xl p-1.5 text-left transition ${
                    tome.rang === tomeActif
                      ? 'bg-grenat-500/10 ring-2 ring-grenat-500'
                      : 'hover:bg-nuit-800'
                  }`}
                >
                  {/* Plaque-titre (pas d'image de couverture dans le modèle) */}
                  <div
                    className={`relative grid h-[88px] place-items-center rounded-lg border px-3 text-center ${
                      tome.etat === 'lu'
                        ? 'border-grenat-600 bg-grenat-700/25'
                        : tome.etat === 'en_cours'
                          ? 'border-violet-rom-500/70 bg-violet-rom-600/20'
                          : 'border-nuit-700 bg-nuit-800 opacity-80'
                    }`}
                  >
                    <span className="font-display text-sm leading-snug text-encre-100">
                      {tome.titre}
                    </span>
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-nuit-600 bg-nuit-850 font-display text-[11px] text-encre-300">
                      {tome.rang}
                    </span>
                  </div>

                  <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-encre-500">
                    Tome {tome.rang}
                  </div>
                  <div
                    className={`line-clamp-2 text-sm leading-snug ${
                      tome.rang === tomeActif ? 'text-encre-100' : 'text-encre-300'
                    }`}
                  >
                    {tome.auteur ?? 'Auteur inconnu'}
                  </div>
                  <div className="mt-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                        tome.etat === 'lu'
                          ? 'bg-grenat-700/40 text-grenat-300'
                          : tome.etat === 'en_cours'
                            ? 'bg-violet-rom-600/30 text-violet-rom-300'
                            : 'bg-nuit-800 text-encre-500'
                      }`}
                    >
                      {LIBELLE_ETAT[tome.etat]}
                    </span>
                  </div>
                  {tome.etat === 'en_cours' && (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] text-encre-500">
                        Chapitre {tome.chapitresLus} / {tome.totalChapitres}
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-nuit-800"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-grenat-500"
                          style={{ width: `${pourcentage(tome)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {tome.etat === 'lu' && (
                    <div className="mt-2 text-[11px] text-grenat-300">
                      {tome.totalChapitres} chapitres découverts
                    </div>
                  )}
                </Link>

                {/* Racines : personnages visibles dans ce tome */}
                <div
                  className="relative ml-[22px] mt-1 border-l border-dashed border-nuit-700 pl-3 pt-2"
                  aria-label={`Personnages visibles, tome ${tome.rang}`}
                >
                  {tome.racines.length > 0 ? (
                    <>
                      <div className="flex -space-x-1.5">
                        {tome.racines.slice(0, 5).map((nom) => (
                          <span
                            key={nom}
                            title={nom}
                            className="grid h-6 w-6 place-items-center rounded-full border-2 border-nuit-850 bg-grenat-700 text-[9px] font-semibold text-encre-100"
                          >
                            {initiales(nom)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-encre-500">
                        {tome.racines.length} visible
                        {tome.racines.length > 1 ? 's' : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-encre-500">
                      Aucun personnage documenté encore
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="relative border-t border-nuit-700 px-4 py-2.5 text-[12px] text-encre-500 sm:px-8">
        Cliquez sur un tome pour ouvrir son détail. Un tome non entamé ne révèle
        que les personnages « présents dès le début » ; tout le reste suit votre
        chapitre lu.
      </p>
    </div>
  );
}
