// Confirmation — SUCCÈS (P0.9). Relit l'état réel du paiement et de
// l'abonnement côté serveur (source de vérité), et propose de
// revérifier si le webhook n'est pas encore arrivé.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import FormulairePaiement from '@/components/paiement/FormulairePaiement';
import AbonnementStatut from '@/components/AbonnementStatut';
import { accesPremium, planParCode, statutEffectif } from '@/lib/abonnement';
import { MagasinAbonnementSupabase, MagasinPaiementSupabase } from '@/lib/paiement/magasin';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
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

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 text-center animate-fondu-monte">
      <p className="sur-titre text-violet-rom-300">Paiement</p>
      <h1 className="font-display text-3xl text-encre-100 mt-3">
        {enAttente ? 'Paiement reçu, en cours de validation' : 'Paiement confirmé'}
      </h1>
      <div className="liseret mt-4 mx-auto" />

      <div className="velours p-6 mt-6 text-left space-y-3">
        {paiement && (
          <p className="text-sm text-encre-300">
            Référence{' '}
            <span className="text-encre-100">{paiement.reference}</span> ·{' '}
            {paiement.montant.toLocaleString('fr-FR')} {paiement.devise} ·{' '}
            {paiement.statut}
          </p>
        )}
        <AbonnementStatut
          statut={statut}
          plan={abonnement?.plan ?? 'gratuit'}
          periodeFin={abonnement?.periode_fin ?? null}
          premium={statut === 'actif' && accesPremium(planParCode(abonnement?.plan ?? null))}
          essai={planParCode(abonnement?.plan ?? null)?.categorie === 'essai'}
        />
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
