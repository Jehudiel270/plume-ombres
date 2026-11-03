// Guichet SIMULÉ (P0.9) — remplace le fournisseur réel en mode
// simulation. L'utilisateur choisit le résultat ; le webhook local est
// rejoué. Aucun débit, aucune clé.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import SimulateurPaiement from '@/components/paiement/SimulateurPaiement';
import { MagasinPaiementSupabase } from '@/lib/paiement/magasin';
import { simulationAutorisee } from '@/lib/paiement/simulation';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Paiement simulé',
  description: 'Guichet de simulation : aucun débit réel.',
};

export default async function PageSimulation({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  if (!simulationAutorisee()) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="sur-titre text-grenat-400">Paiement</p>
        <h1 className="font-display text-3xl text-encre-100 mt-3">
          Simulation désactivée
        </h1>
        <p className="text-encre-300 mt-4">
          Le paiement simulé n’est pas autorisé dans cet environnement.
        </p>
        <Link href="/abonnement" className="bouton-principal mt-6 inline-flex">
          Retour à mon abonnement
        </Link>
      </main>
    );
  }

  const utilisateur = await utilisateurConnecte();
  const { reference } = await searchParams;
  if (!utilisateur) {
    redirect(
      `/connexion?suivant=/paiement/simulation${
        reference ? `?reference=${encodeURIComponent(reference)}` : ''
      }`
    );
  }

  const supabase = await creerClientServeur();
  const paiement = reference
    ? await new MagasinPaiementSupabase(supabase).lire(reference)
    : null;

  if (!reference || !paiement) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="sur-titre text-grenat-400">Paiement</p>
        <h1 className="font-display text-3xl text-encre-100 mt-3">
          Référence introuvable
        </h1>
        <p className="text-encre-300 mt-4">
          Cette transaction simulée n’existe pas (ou ne vous appartient pas).
        </p>
        <Link href="/abonnement" className="bouton-principal mt-6 inline-flex">
          Retour à mon abonnement
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 animate-fondu-monte">
      <p className="sur-titre text-violet-rom-300">Guichet simulé</p>
      <h1 className="font-display text-3xl text-encre-100 mt-2">
        Paiement Mobile Money
      </h1>
      <div className="liseret mt-3" />

      <div className="velours p-6 mt-6 space-y-4">
        <p className="text-sm text-encre-300">
          Référence <span className="text-encre-100">{paiement.reference}</span>{' '}
          · {paiement.montant.toLocaleString('fr-FR')} {paiement.devise}
        </p>
        <p className="text-xs text-encre-500 italic leading-relaxed">
          Ceci remplace l’écran de l’opérateur. Choisissez le résultat à
          simuler : la confirmation mettra à jour votre abonnement
          exactement comme un webhook réel.
        </p>
        <SimulateurPaiement reference={paiement.reference} />
      </div>
    </main>
  );
}
