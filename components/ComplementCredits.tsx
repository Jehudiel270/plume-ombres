// ============================================================
// components/ComplementCredits.tsx — Bandeau « complément de crédits »
// du parcours LIVRE.
//
// Affiché AVANT que le lecteur ne lance la traduction, quand son
// solde restant (quota du mois + crédits) tombe JUSTE SOUS la taille
// du livre. Il rend trois choses lisibles d'un coup :
//   · la TAILLE du livre en caractères (ce que la traduction coûtera) ;
//   · le DÉFICIT exact (ce qu'il manque) ;
//   · le PACK LE PLUS JUSTE, avec le complément AU PRORATA arrondi
//     commercialement (réduction affichée).
//
// Composant SERVEUR (aucun état, aucune requête) : il ne fait que
// mettre en forme un `ComplementCredits` déjà calculé par
// lib/credits-manquants.ts. Aucun prix n'est écrit ici : tout vient
// du catalogue.
// ============================================================

import Link from 'next/link';
import {
  libelleCaracteres,
  libelleEstimationRomans,
  type PlanAbonnement,
} from '@/lib/abonnement';
import type { ComplementCredits } from '@/lib/credits-manquants';

interface Props {
  /** Résultat de `calculerComplement(...)` (lib/credits-manquants.ts). */
  complement: ComplementCredits;
}

/** « 1 250 F CFA ». */
function fcfa(montant: number): string {
  return `${Math.max(Math.trunc(montant), 0).toLocaleString('fr-FR')} F CFA`;
}

export default function ComplementCreditsBandeau({ complement }: Props) {
  // Rien à proposer : soit le solde suffit, soit aucun pack n'existe.
  if (!complement.necessaire || !complement.pack) return null;

  const pack: PlanAbonnement = complement.pack;
  const estimation = libelleEstimationRomans(complement.packCaracteres);
  const afficherRemise = complement.remiseXof > 0;

  return (
    <section
      className="velours p-4 sm:p-5 mt-4 border-or-ros-300/40 animate-fondu-monte"
      aria-label="Complément de crédits proposé"
    >
      <p className="sur-titre text-or-ros-300">Complément de crédits</p>

      {/* Le message calculé (message clair côté utilisateur). */}
      <p className="text-encre-100 text-sm mt-2 leading-relaxed" aria-live="polite">
        {complement.message}
      </p>

      {/* Chiffres-clés, lisibles d'un coup d'œil. */}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-encre-500">Taille du livre</dt>
          <dd className="text-encre-100 font-semibold">
            {libelleCaracteres(complement.tailleLivre)}
          </dd>
        </div>
        <div>
          <dt className="text-encre-500">Solde restant</dt>
          <dd className="text-encre-100 font-semibold">
            {libelleCaracteres(complement.soldeRestant)}
          </dd>
        </div>
        <div>
          <dt className="text-encre-500">Il vous manque</dt>
          <dd className="text-grenat-300 font-semibold">
            {libelleCaracteres(complement.deficit)}
          </dd>
        </div>
      </dl>

      {/* Proposition : pack le plus juste + complément au prorata. */}
      <div className="mt-4 rounded-xl border border-nuit-700 bg-nuit-900/40 p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-encre-100 text-sm font-semibold">
            {pack.nom} — {libelleCaracteres(complement.packCaracteres)}
            {estimation && (
              <span className="text-encre-500 font-normal"> · {estimation}</span>
            )}
          </p>
          <p className="text-encre-500 text-xs mt-1">
            {afficherRemise ? (
              <>
                Complément au prorata{' '}
                <span className="text-encre-300 line-through">
                  {fcfa(complement.prixPleinXof)}
                </span>{' '}
                <span className="text-or-ros-300 font-semibold">
                  {fcfa(complement.prixProrataXof)}
                </span>{' '}
                (−{fcfa(complement.remiseXof)}, soit −{complement.remisePourcent} %)
              </>
            ) : (
              <>Prix du pack : {fcfa(complement.prixPleinXof)}</>
            )}
          </p>
        </div>

        <Link
          href={`/paiement/${pack.code}`}
          className="bouton-principal !py-2.5 !px-5 text-sm justify-center shrink-0"
        >
          Compléter mes crédits
        </Link>
      </div>

      <p className="text-nano text-encre-500 mt-3 leading-snug">
        Montant calculé sur la part qui vous manque, arrondi au multiple de 50 F CFA.
        Les crédits s’ajoutent à votre solde et n’expirent pas.
      </p>
    </section>
  );
}
