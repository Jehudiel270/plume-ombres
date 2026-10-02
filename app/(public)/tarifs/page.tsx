// Tarifs — page PUBLIQUE : catalogue réel, prix en francs CFA (XOF).
// Essai de 7 jours offert, sans carte. Aucun nom de moteur de
// traduction n'apparaît ici (moteur privé auto-hébergé, sans moteur
// payant) : les offres se différencient par le volume, la file
// prioritaire, le parallélisme, le glossaire, les exports et le groupe.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import {
  conditionsPlan,
  libellePeriodicite,
  libellePrix,
  MENTION_MOTEUR,
  plansPublics,
  planParCode,
} from '@/lib/abonnement';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Plume d’Ombres : 7 jours offerts sans carte, puis des offres à partir de 1 200 F CFA par mois (étudiant). Prix en francs CFA, paiement Mobile Money.',
};

/** Plan mis en avant dans la grille. */
const CODE_MIS_EN_AVANT = 'passionne_mensuel';

export default function PageTarifs() {
  const plans = plansPublics();
  const gratuit = planParCode('gratuit')!;

  return (
    <>
      <SectionPublique
        niveau={1}
        surTitre="Tarifs"
        titre="7 jours offerts, sans carte"
        intro="Créez un compte et traduisez jusqu’à 3 livres pendant 7 jours, sans rien payer et sans renseigner de carte. Ensuite, vous choisissez — ou vous restez à l’offre gratuite, qui traduit environ un livre par mois. Tous les prix sont en francs CFA (XOF)."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const misEnAvant = plan.code === CODE_MIS_EN_AVANT;
            const payant = plan.prixXof > 0;
            const conditions = conditionsPlan(plan);
            return (
              <div
                key={plan.code}
                className={`velours p-6 flex flex-col relative overflow-hidden ${
                  misEnAvant ? 'border border-violet-rom-500/50' : ''
                }`}
              >
                {misEnAvant && (
                  <div className="absolute top-5 right-5">
                    <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                      le plus choisi
                    </span>
                  </div>
                )}
                <p className="sur-titre text-violet-rom-300 pr-24">{plan.nom}</p>
                <p className="font-display text-3xl text-encre-100 mt-3">
                  {libellePrix(plan)}
                  {payant && (
                    <span className="text-sm text-encre-500">
                      {plan.parPersonne ? ' / personne' : ''}{' '}
                      {libellePeriodicite(plan)}
                    </span>
                  )}
                </p>
                {plan.prixMensuelXof && payant ? (
                  <p className="text-encre-500 text-xs mt-1">
                    soit {plan.prixMensuelXof.toLocaleString('fr-FR')} F CFA / mois
                  </p>
                ) : (
                  <p className="text-encre-500 text-xs mt-1">
                    {payant ? 'sans engagement' : 'sans carte, sans engagement'}
                  </p>
                )}
                <p className="text-encre-300 text-sm mt-3 leading-relaxed">
                  {plan.resume}
                </p>

                <ul className="mt-5 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
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

                <Link
                  href="/connexion?mode=inscription"
                  className={`${payant && !misEnAvant ? 'bouton-fantome' : 'bouton-principal'} mt-6 justify-center`}
                >
                  {plan.code === 'gratuit'
                    ? 'Créer mon compte'
                    : 'Commencer par l’essai gratuit'}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="text-encre-500 text-xs mt-6 leading-relaxed">
          * « Volume illimité » s’entend sous usage raisonnable : jusqu’à
          25 000 000 de caractères par mois et par compte, garde-fou qui protège
          la qualité du service. {MENTION_MOTEUR}.
        </p>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="Comment ça marche"
        titre="Un compte, un essai, puis l’offre qui vous convient"
      >
        <div className="velours p-6 space-y-4 text-sm text-encre-300 leading-relaxed">
          <p>
            <strong className="text-encre-100">L’essai dure 7 jours.</strong>{' '}
            Il donne accès au confort de l’offre Passionné (glossaire, file
            prioritaire, 2 traductions en parallèle), plafonné à 3 livres au
            total. Aucune carte, aucun numéro n’est demandé pour commencer.
          </p>
          <p>
            <strong className="text-encre-100">Un essai par personne.</strong>{' '}
            Pour éviter les abus, l’essai est limité à un compte par e-mail et par
            numéro Mobile Money.
          </p>
          <p>
            <strong className="text-encre-100">À la fin de l’essai, rien ne se perd.</strong>{' '}
            Votre compte bascule automatiquement sur l’offre gratuite : votre
            bibliothèque et vos traductions restent en place.
          </p>
          <p>
            <strong className="text-encre-100">Offres étudiant, groupe et école.</strong>{' '}
            Tarif étudiant sur justificatif ; offre Groupe à partir de 3 personnes
            (2 400 F CFA par personne et par mois) ; offre École à partir de
            11 personnes (1 800 F CFA par personne et par mois, facturés à
            l’année, soit 21 600 F CFA par personne et par an). Un seul payeur par
            groupe.
          </p>
          <p>
            <strong className="text-encre-100">Paiement.</strong> Par Mobile
            Money (MTN, Moov et autres opérateurs de la zone UEMOA). Les montants
            sont en francs CFA, sans centimes.
          </p>
          <p>
            <strong className="text-encre-100">
              Ce qui restera toujours gratuit.
            </strong>{' '}
            Importer, traduire, lire et exporter restent accessibles : les offres
            payantes financent le <em>volume</em> et le <em>confort</em>, jamais
            l’accès de base.
          </p>
        </div>

        <p className="text-encre-500 text-xs mt-4 leading-relaxed">
          Offre gratuite actuelle : {gratuit.livresMois ?? 'volume illimité'} —{' '}
          {gratuit.avantages[0]}
        </p>
      </SectionPublique>
    </>
  );
}
