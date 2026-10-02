// ============================================================
// components/AbonnementTarifs.tsx — Grille de tarifs ACTIONNABLE.
//
// Composant serveur : affiche le catalogue réel (prix FCFA) et renvoie
// les offres payantes vers le tunnel /paiement/<code>. Le plan gratuit
// n'a pas de bouton d'achat. AUCUN nom de moteur de traduction.
// ============================================================

import Link from 'next/link';
import {
  conditionsPlan,
  libellePeriodicite,
  libellePrix,
  type CodePlan,
  type PlanAbonnement,
} from '@/lib/abonnement';

interface Props {
  plans: readonly PlanAbonnement[];
  /** Plan effectif du compte. */
  planActuel: CodePlan;
  /** Vrai si le compte a un accès supérieur au gratuit (payant ou essai). */
  premium: boolean;
  /** Vrai si le paiement est en simulation. */
  simulation: boolean;
  /** Vrai si un fournisseur de paiement est utilisable. */
  paiementConfigure?: boolean;
}

/** « 3 livres/mois » · « illimité* » */
function volumeTexte(plan: PlanAbonnement): string {
  if (plan.livresMois === null) return 'Volume illimité*';
  return `${plan.livresMois} livre${plan.livresMois > 1 ? 's' : ''} / mois`;
}

export default function AbonnementTarifs({
  plans,
  planActuel,
  premium,
  simulation,
  paiementConfigure = true,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const courant = plan.code === planActuel;
        const payant = plan.prixXof > 0;
        const conditions = conditionsPlan(plan);
        return (
          <div
            key={plan.code}
            className={`velours p-5 flex flex-col relative overflow-hidden ${
              courant ? 'border border-violet-rom-500/50' : ''
            }`}
          >
            {courant && (
              <div className="absolute top-4 right-4">
                <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                  votre offre
                </span>
              </div>
            )}
            <p className="sur-titre text-violet-rom-300 pr-20">{plan.nom}</p>
            <p className="font-display text-3xl text-encre-100 mt-2">
              {libellePrix(plan)}
              {payant && (
                <span className="text-sm text-encre-500">
                  {plan.parPersonne ? ' / personne' : ''}{' '}
                  {libellePeriodicite(plan)}
                </span>
              )}
            </p>
            {plan.prixMensuelXof && plan.prixXof > 0 && (
              <p className="text-encre-500 text-xs mt-1">
                soit {plan.prixMensuelXof.toLocaleString('fr-FR')} F CFA / mois
              </p>
            )}
            {!payant && (
              <p className="text-encre-500 text-xs mt-1">
                7 jours offerts à l’inscription, sans carte
              </p>
            )}

            <dl className="mt-4 space-y-1 text-xs text-encre-300">
              <div className="flex justify-between gap-2">
                <dt className="text-encre-500">Volume</dt>
                <dd>{volumeTexte(plan)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-encre-500">Parallèle</dt>
                <dd>
                  {plan.traductionsSimultanees} traduction
                  {plan.traductionsSimultanees > 1 ? 's' : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-encre-500">File prioritaire</dt>
                <dd>{plan.filePrioritaire ? 'Oui' : 'Non'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-encre-500">Glossaire</dt>
                <dd>{plan.glossaire ? 'Inclus' : '—'}</dd>
              </div>
            </dl>

            <ul className="mt-4 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
              {plan.avantages.map((ligne) => (
                <li key={ligne}>{ligne}</li>
              ))}
            </ul>

            {conditions.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11px] text-encre-500 leading-snug list-disc pl-4">
                {conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}

            {!payant && (
              <span className="mt-4 text-encre-500 text-sm italic">
                {courant ? 'Inclus par défaut' : 'Toujours inclus'}
              </span>
            )}
            {payant && courant && premium && (
              <span className="mt-4 text-violet-rom-300 text-sm">
                Actif sur votre compte
              </span>
            )}
            {payant && !(courant && premium) && paiementConfigure && (
              <Link
                href={`/paiement/${plan.code}`}
                className="bouton-principal mt-4 justify-center"
              >
                {simulation ? 'Tester (simulation)' : 'Souscrire'}
              </Link>
            )}
            {payant && !paiementConfigure && (
              <span className="mt-4 text-encre-500 text-xs italic">
                Paiement non configuré pour l’instant
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
