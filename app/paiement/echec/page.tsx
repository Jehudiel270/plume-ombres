// Confirmation — ÉCHEC (P0.9). Aucun abonnement n'a été activé ;
// on invite à réessayer ou à revenir à l'offre en cours.

import type { Metadata } from 'next';
import Link from 'next/link';
import AbonnementStatut from '@/components/AbonnementStatut';
import { estPackCredits, planParCode, statutEffectif } from '@/lib/abonnement';
import { MagasinAbonnementSupabase, MagasinPaiementSupabase } from '@/lib/paiement/magasin';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Paiement échoué',
  description: 'Votre paiement n’a pas abouti — aucun débit conservé.',
};

export default async function PageEchec({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;
  const utilisateur = await utilisateurConnecte();

  let statut: ReturnType<typeof statutEffectif> = 'inactif';
  let plan = 'gratuit';
  let periodeFin: string | null = null;
  let montantTexte: string | null = null;
  let achatCredits = false;

  if (utilisateur) {
    const supabase = await creerClientServeur();
    const [paiement, abonnement] = await Promise.all([
      reference ? new MagasinPaiementSupabase(supabase).lire(reference) : null,
      new MagasinAbonnementSupabase(supabase).lire(utilisateur.id),
    ]);
    statut = statutEffectif(abonnement);
    plan = abonnement?.plan ?? 'gratuit';
    periodeFin = abonnement?.periode_fin ?? null;
    if (paiement) {
      montantTexte = `${paiement.montant.toLocaleString('fr-FR')} ${paiement.devise}`;
      achatCredits = estPackCredits(planParCode(paiement.plan));
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 text-center animate-fondu-monte">
      <p className="sur-titre text-grenat-400">Paiement</p>
      <h1 className="font-display text-3xl text-encre-100 mt-3">
        Le paiement n’a pas abouti
      </h1>
      <div className="liseret mt-4 mx-auto" />

      <div data-reveler="haut" data-delai="1" className="velours p-6 mt-6 text-left space-y-3">
        <p className="text-sm text-encre-300">
          {achatCredits
            ? 'Aucun crédit n’a été ajouté : votre solde reste inchangé.'
            : 'Aucun abonnement n’a été activé : votre offre reste inchangée.'}
          {montantTexte ? ` Montant concerné : ${montantTexte}.` : ''} Rien ne
          vous sera prélevé pour cette tentative.
        </p>
        {reference && (
          <p className="text-xs text-encre-500">
            Référence : <span className="text-encre-300">{reference}</span>
          </p>
        )}
        {!achatCredits && (
          <AbonnementStatut
            statut={statut}
            plan={plan}
            periodeFin={periodeFin}
            premium={statut === 'actif'}
          />
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <Link href="/abonnement" className="bouton-principal">
          Réessayer
        </Link>
        <Link href="/bibliotheque" className="bouton-fantome">
          Retour à la bibliothèque
        </Link>
      </div>
    </main>
  );
}
