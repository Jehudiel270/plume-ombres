// Confirmation — SUCCÈS (P0.9). Relit l'état réel du paiement et de
// l'abonnement côté serveur (source de vérité), et propose de
// revérifier si le webhook n'est pas encore arrivé.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import FormulairePaiement from '@/components/paiement/FormulairePaiement';
import AbonnementStatut from '@/components/AbonnementStatut';
import {
  estPackCredits,
  libelleCaracteres,
  planParCode,
  statutEffectif,
} from '@/lib/abonnement';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Paiement confirmé',
  description: 'Confirmation de votre paiement Mobile Money.',
};

export default async function PageSucces({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const utilisateur = await utilisateurConnecte();
  const { reference } = await searchParams;
  if (!utilisateur) {
    redirect(
      `/connexion?suivant=/paiement/succes${
        reference ? `?reference=${encodeURIComponent(reference)}` : ''
      }`
    );
  }

  const supabase = await creerClientServeur();
  const paiement = reference
    ? await new MagasinPaiementSupabase(supabase).lire(reference)
    : null;
  const abonnement = await new MagasinAbonnementSupabase(supabase).lire(
    utilisateur.id
  );
  const statut = statutEffectif(abonnement);
  const enAttente = !paiement || paiement.statut === 'en_attente';

  // Achat de CRÉDITS PRÉPAYÉS : on confirme le nouveau solde (le pack
  // n'ouvre aucun droit récurrent — l'afficher comme un abonnement
  // serait trompeur).
  const planPaye = planParCode(paiement?.plan ?? null);
  const achatCredits = estPackCredits(planPaye);
  const solde = achatCredits
    ? await new MagasinCreditsSupabase(supabase)
        .lireSolde(utilisateur.id)
        .catch(() => 0)
    : 0;

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 text-center animate-fondu-monte">
      <p className="sur-titre text-violet-rom-300">Paiement</p>
      <h1 className="font-display text-3xl text-encre-100 mt-3">
        {enAttente
          ? 'Paiement reçu, en cours de validation'
          : achatCredits
            ? 'Crédits ajoutés'
            : 'Paiement confirmé'}
      </h1>
      <div className="liseret mt-4 mx-auto" />

      <div data-reveler="haut" data-delai="1" className="velours p-6 mt-6 text-left space-y-3">
        {paiement && (
          <p className="text-sm text-encre-300">
            Référence{' '}
            <span className="text-encre-100">{paiement.reference}</span> ·{' '}
            {paiement.montant.toLocaleString('fr-FR')} {paiement.devise} ·{' '}
            {paiement.statut}
          </p>
        )}

        {achatCredits && !enAttente && (
          <div className="rounded-xl border border-or-ros-300/40 bg-or-ros-300/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-encre-500">
              Nouveau solde de crédits
            </p>
            <p className="font-display text-2xl text-encre-100 mt-1" aria-live="polite">
              {libelleCaracteres(solde)}
            </p>
            <p className="text-encre-500 text-xs mt-1">
              Ils sont rattachés à votre compte et n’expirent pas.
            </p>
          </div>
        )}

        {!achatCredits && (
          <AbonnementStatut
            statut={statut}
            plan={abonnement?.plan ?? 'gratuit'}
            periodeFin={abonnement?.periode_fin ?? null}
            premium={statut === 'actif'}
          />
        )}

        {enAttente && reference && (
          <div className="pt-2">
            <p className="text-xs text-encre-500 mb-2">
              Si l’opérateur a validé et que rien ne change, revérifiez le
              statut :
            </p>
            <FormulairePaiement reference={reference} statutInitial="en_attente" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <Link href="/abonnement" className="bouton-principal">
          Voir mon abonnement
        </Link>
        <Link href="/bibliotheque" className="bouton-fantome">
          Retour à la bibliothèque
        </Link>
      </div>
    </main>
  );
}
