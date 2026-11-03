// Tunnel de paiement (P0.9) — page du plan choisi, avec le
// formulaire Mobile Money. Renvoie vers /connexion si la session est
// absente (le paiement exige un compte).
//
// A5 : le REFUS d'un code inconnu, masqué, legacy, « essai »,
// hors-ligne (étudiant/groupe/école) ou verrouillé (Illimité) est
// appliqué CÔTÉ SERVEUR, à partir du catalogue lu dans la BASE — pas
// seulement en cachant un bouton. Un ?plan=premium_mensuel forgé à la
// main échoue (404).

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import BarreNavigation from '@/components/BarreNavigation';
import FormulairePaiement from '@/components/paiement/FormulairePaiement';
import {
  estPackCredits,
  libelleCaracteres,
  libellePeriodicite,
  libellePrix,
  planParCode,
} from '@/lib/abonnement';
import {
  catalogueComplet,
  diagnostiquerAchat,
  lireCatalogue,
} from '@/lib/plans-catalogue';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Paiement',
  description:
    'Acheter des crédits de traduction ou souscrire à un abonnement, par Mobile Money.',
};

export default async function PagePaiementPlan({
  params,
}: {
  params: Promise<{ plan: string }>;
}) {
  const { plan: code } = await params;

  // Catalogue LU DANS LA BASE (source de vérité) : prix, durée, quota,
  // statut de vente. Hydrate aussi le catalogue partagé.
  const supabase = await creerClientServeur();
  const catalogue = await lireCatalogue(supabase);
  const diag = diagnostiquerAchat(code, catalogue);

  if (!diag.achetable) {
    const planConnu = catalogue.plans.some((p) => p.code === code);
    // En anonyme, la RLS peut empêcher la lecture des packs : on ne peut
    // alors PAS conclure qu'un code « credits_… » est inconnu — on exige
    // la session (elle lira le catalogue des packs).
    if (!planConnu && !catalogue.packsLus) {
      redirect(`/connexion?suivant=/paiement/${code}`);
    }
    // Refus franc : code inconnu, inactif, masqué, legacy, essai,
    // hors-ligne ou Illimité verrouillé.
    notFound();
  }

  const plan = planParCode(code, catalogueComplet(catalogue));
  if (!plan) notFound();

  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect(`/connexion?suivant=/paiement/${code}`);

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const etatPaiement = modePaiementAffiche();
  const pack = estPackCredits(plan);
  // Un pack n'a pas de périodicité : on annonce son volume à la place.
  const dureeLibelle = pack
    ? libelleCaracteres(plan.caracteres ?? 0)
    : libellePeriodicite(plan) || 'durée 30 jours';
  const prixLibelle = pack
    ? libellePrix(plan)
    : `${libellePrix(plan)} ${libellePeriodicite(plan)}`.trim();

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

        <div data-reveler="haut" data-delai="1" className="velours p-6 mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-3xl text-encre-100">
              {libellePrix(plan)}
            </span>
            <span className="text-encre-500 text-sm">{dureeLibelle}</span>
          </div>
          {pack && (
            <p className="text-or-ros-300 text-xs mt-2">
              Paiement unique — aucun abonnement, aucune reconduction. Les
              crédits s’ajoutent à votre solde et n’expirent pas.
            </p>
          )}
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
