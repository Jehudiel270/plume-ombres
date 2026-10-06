// ============================================================
// components/AbonnementCredits.tsx — Crédits prépayés (P0.9+).
//
// Affiche, pour un compte :
//   · son SOLDE de crédits de traduction (caractères prépayés) ;
//   · les PACKS disponibles, achetables un par un (sans abonnement).
//
// Composant serveur (aucun état). Les prix et volumes viennent de
// lib/abonnement.ts (source de vérité partagée avec le tunnel) :
// une seule définition de ce qu'est un pack.
//
// AUCUN nom de fournisseur de traduction n'est affiché ici.
// ============================================================

import Link from 'next/link';
import {
  libelleCaracteres,
  libelleEstimationRomans,
  libellePrix,
  type PlanAbonnement,
} from '@/lib/abonnement';

interface Props {
  /** Solde courant, en caractères prépayés (0 si aucun). */
  solde: number;
  /** Packs de crédits, triés par ordre d'affichage. */
  packs: readonly PlanAbonnement[];
  /** Vrai si le tunnel est en simulation (aucun débit). */
  simulation: boolean;
}

/** « 250 000 » → « 250 k » : la pastille compacte du solde. */
function soldeCompact(solde: number): string {
  return solde.toLocaleString('fr-FR');
}

export default function AbonnementCredits({ solde, packs, simulation }: Props) {
  const aDesCredits = solde > 0;

  return (
    <section className="mt-8" aria-label="Crédits de traduction prépayés">
      <p className="sur-titre text-or-ros-300">Crédits de traduction</p>
      <h2 className="font-display text-2xl text-encre-100 mt-2">
        Sans abonnement, à la carte
      </h2>
      <p className="text-encre-500 text-sm mt-3 italic leading-relaxed max-w-2xl">
        Le quota mensuel de votre offre est consommé en premier. Une fois
        épuisé, la traduction puise automatiquement dans vos crédits : votre
        travail en cours n’est jamais interrompu, et rien n’est perdu.
      </p>

      {/* ---------- Solde ---------- */}
      <div className="velours p-6 mt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-encre-500">
              Solde de crédits
            </p>
            <p
              className="font-display text-4xl text-encre-100 mt-1"
              aria-live="polite"
            >
              {soldeCompact(solde)}
              <span className="text-base text-encre-500 ml-2">caractères</span>
            </p>
            <p className="text-encre-500 text-xs mt-2">
              {aDesCredits
                ? 'Ils n’expirent pas : ils restent disponibles jusqu’à utilisation.'
                : 'Aucun crédit pour l’instant — votre quota mensuel suffit souvent à traduire un livre.'}
            </p>
          </div>

          {aDesCredits && (
            <span className="rounded-full border border-or-ros-300/50 bg-or-ros-300/10 text-or-ros-300 text-[11px] uppercase tracking-wider px-3 py-1">
              disponibles
            </span>
          )}
        </div>
      </div>

      {/* ---------- Packs ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        {packs.map((pack) => {
          const caracteres = pack.caracteres ?? 0;
          const estimation = libelleEstimationRomans(caracteres);
          return (
            <div
              key={pack.code}
              className="velours p-5 flex flex-col"
              aria-label={`${pack.nom} — ${libellePrix(pack)}`}
            >
              <p className="sur-titre text-or-ros-300">{pack.nom}</p>

              <p className="font-display text-3xl text-encre-100 mt-3">
                {libellePrix(pack)}
              </p>
              <p className="text-encre-500 text-[11px] mt-1">
                paiement unique — prix indicatif
              </p>

              <p className="text-encre-100 text-sm mt-4 font-semibold">
                {libelleCaracteres(caracteres)}
              </p>
              {estimation && (
                <p className="text-encre-500 text-xs mt-0.5">{estimation}</p>
              )}

              <ul className="mt-4 space-y-1.5 text-[13px] text-encre-300 leading-relaxed list-disc pl-5 flex-1">
                {pack.avantages.map((ligne) => (
                  <li key={ligne}>{ligne}</li>
                ))}
              </ul>

              <Link
                href={`/paiement/${pack.code}`}
                className="bouton-principal mt-5 justify-center"
              >
                {simulation
                  ? `Tester ${pack.nom} (simulation)`
                  : `Acheter — ${pack.nom}`}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="text-nano text-encre-500 mt-3 leading-snug">
        Les crédits sont rattachés à votre compte et utilisables sur tous vos
        appareils. Aucun prélèvement récurrent : vous décidez quand recharger.
      </p>
    </section>
  );
}
