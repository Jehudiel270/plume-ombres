// Tunnel de paiement (P0.9) — page du plan choisi, avec le
// formulaire Mobile Money. Renvoie vers /connexion si la session est
// absente (le paiement exige un compte).

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import BarreNavigation from '@/components/BarreNavigation';
import FormulairePaiement from '@/components/paiement/FormulairePaiement';
import {
  estPlanPremium,
  libellePeriodicite,
  libellePrix,
  planParCode,
} from '@/lib/abonnement';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paiement',
  description: 'Souscrire au Premium de Plume d’Ombres par Mobile Money.',
};

export default async function PagePaiementPlan({
  params,
}: {
  params: Promise<{ plan: string }>;
}) {
  const { plan: code } = await params;
  const plan = planParCode(code);
  if (!plan || !estPlanPremium(plan)) notFound();

  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect(`/connexion?suivant=/paiement/${code}`);

  const supabase = await creerClientServeur();
  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const etatPaiement = modePaiementAffiche();
  const prixLibelle = `${libellePrix(plan)} ${libellePeriodicite(plan)}`.trim();

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 animate-fondu-monte">
        <Link href="/abonnement" className="lien-discret text-sm underline">
          ← Retour à mon abonnement
        </Link>

        <div className="mt-4">
          <p className="sur-titre text-grenat-400">Paiement</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            {plan.nom}
          </h1>
          <div className="liseret mt-3" />
        </div>

        <div className="velours p-6 mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-3xl text-encre-100">
              {libellePrix(plan)}
            </span>
            <span className="text-encre-500 text-sm">
              {libellePeriodicite(plan) || 'durée 30 jours'}
            </span>
          </div>
          <p className="text-encre-500 text-xs mt-2">
            {etatPaiement.mode === 'simulation'
              ? 'Prix indicatif — paiement simulé, aucun débit.'
              : `Paiement sécurisé via ${
                  etatPaiement.fournisseur === 'fedapay'
                    ? 'FedaPay'
                    : etatPaiement.fournisseur
                } (Mobile Money).`}
          </p>

          <div className="mt-6">
            <FormulairePaiement
              plan={plan.code}
              planNom={plan.nom}
              prixLibelle={prixLibelle}
              simulation={etatPaiement.mode === 'simulation'}
            />
          </div>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5">
          {plan.avantages.map((ligne) => (
            <li key={ligne}>{ligne}</li>
          ))}
        </ul>
      </main>
    </>
  );
}
