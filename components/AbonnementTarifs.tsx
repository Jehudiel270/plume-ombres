// ============================================================
// components/AbonnementTarifs.tsx — Grille de tarifs ACTIONNABLE (P0.9).
//
// Composant serveur : affiche les plans et renvoie les plans payants
// vers le tunnel /paiement/<code>. Le plan gratuit n'a pas de bouton
// d'achat. Prix en francs CFA (FedaPay / Mobile Money).
// ============================================================

import Link from 'next/link';
import {
  libellePeriodicite,
  libellePrix,
  type CodePlan,
  type PlanAbonnement,
} from '@/lib/abonnement';

interface Props {
  plans: readonly PlanAbonnement[];
  /** Plan effectif du compte. */
  planActuel: CodePlan;
  /** Vrai si le compte est Premium actif. */
  premium: boolean;
  /** Vrai si le paiement est en simulation. */
  simulation: boolean;
}

export default function AbonnementTarifs({
  plans,
  planActuel,
  premium,
  simulation,
}: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const courant = plan.code === planActuel;
        const payant = plan.prixXof > 0;
        return (
          <div
            key={plan.code}
            className={`velours p-6 flex flex-col relative overflow-hidden ${
              courant ? 'border border-violet-rom-500/50' : ''
            }`}
          >
            {courant && (
              <div className="absolute top-5 right-5">
                <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                  votre offre
                </span>
              </div>
            )}
            <p className="sur-titre text-violet-rom-300">{plan.nom}</p>
            <p className="font-display text-4xl text-encre-100 mt-3">
              {libellePrix(plan)}
              {payant && (
                <span className="text-base text-encre-500">
                  {' '}
                  {libellePeriodicite(plan)}
                </span>
              )}
            </p>
            <p className="text-encre-500 text-xs mt-1">
              {payant
                ? 'prix indicatif — à confirmer avant l’ouverture'
                : 'sans engagement, sans carte bancaire'}
            </p>
            <ul className="mt-6 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
              {plan.avantages.map((ligne) => (
                <li key={ligne}>{ligne}</li>
              ))}
            </ul>

            {!payant && (
              <span className="mt-6 text-encre-500 text-sm italic">
                {courant ? 'Inclus par défaut' : 'Toujours inclus'}
              </span>
            )}
            {payant && courant && premium && (
              <span className="mt-6 text-violet-rom-300 text-sm">
                Actif sur votre compte
              </span>
            )}
            {payant && !(courant && premium) && (
              <Link
                href={`/paiement/${plan.code}`}
                className="bouton-principal mt-6 justify-center"
              >
                {simulation
                  ? `Tester ${plan.nom} (simulation)`
                  : `Souscrire — ${plan.nom}`}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
