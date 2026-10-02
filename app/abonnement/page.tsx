// Abonnement (P0.9) — espace privé : offre en cours, quota effectif,
// tarifs actionnables et historique. Renvoie vers /connexion si la
// session est absente.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BarreNavigation from '@/components/BarreNavigation';
import AbonnementStatut from '@/components/AbonnementStatut';
import AbonnementTarifs from '@/components/AbonnementTarifs';
import AbonnementHistorique from '@/components/AbonnementHistorique';
import {
  CODE_PLAN_GRATUIT,
  estPlanPremium,
  planParCode,
  quotaPourPlan,
  statutEffectif,
  tousLesPlans,
  type CodePlan,
} from '@/lib/abonnement';
import { quotaMensuel } from '@/lib/quota';
import { modePriveStrict } from '@/lib/providers';
import { MagasinAbonnementSupabase, MagasinPaiementSupabase } from '@/lib/paiement/magasin';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Abonnement',
  description: 'Votre offre, votre quota de traduction et votre historique.',
};

export default async function PageAbonnement() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/abonnement');

  const supabase = await creerClientServeur();
  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  const magasinPaiement = new MagasinPaiementSupabase(supabase);

  const [profil, abonnement, evenements, paiements] = await Promise.all([
    supabase.from('profiles').select('pseudo').eq('id', utilisateur.id).maybeSingle(),
    magasinAbonnement.lire(utilisateur.id),
    magasinAbonnement.listerHistorique(utilisateur.id),
    magasinPaiement.lister(utilisateur.id),
  ]);

  const pseudo =
    (profil.data as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const statut = statutEffectif(abonnement);
  const plan =
    planParCode(abonnement?.plan ?? null) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const premium = statut === 'actif' && estPlanPremium(plan);
  const base = quotaMensuel();
  const quota = quotaPourPlan(plan, base);
  const etatPaiement = modePaiementAffiche();
  const priveStrict = modePriveStrict();

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-fondu-monte">
        <div>
          <p className="sur-titre text-grenat-400">Abonnement</p>
          <h1 className="font-display text-3xl sm:text-4xl text-encre-100 mt-2">
            Offre et quota
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Votre abonnement finance le volume et la qualité, jamais l’accès de base.
          </p>
        </div>

        {/* Bandeau de mode */}
        <div className="velours p-4 mt-6 text-sm text-encre-300">
          {etatPaiement.mode === 'simulation' ? (
            <p>
              <strong className="text-encre-100">Mode simulation.</strong>{' '}
              Aucun paiement réel n’est possible ici : le tunnel est exerçable
              de bout en bout, sans clé ni débit.
            </p>
          ) : (
            <p>
              Paiement via{' '}
              <strong className="text-encre-100">
                {etatPaiement.fournisseur === 'fedapay' ? 'FedaPay' : etatPaiement.fournisseur}
              </strong>{' '}
              (Mobile Money). Environnement : {etatPaiement.mode}.
            </p>
          )}
        </div>

        {/* Offre en cours */}
        <section className="velours p-6 mt-4" aria-label="Offre en cours">
          <p className="sur-titre text-encre-300">Offre en cours</p>
          <div className="mt-4">
            <AbonnementStatut
              statut={statut}
              plan={plan.code}
              periodeFin={abonnement?.periode_fin ?? null}
              premium={premium}
            />
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-encre-500">Quota mensuel de traduction</dt>
              <dd className="text-encre-100">
                {quota.toLocaleString('fr-FR')} caractères
                {premium && (
                  <span className="text-encre-500"> (plafond Premium élargi)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-encre-500">Confidentialité de la traduction</dt>
              <dd className="text-encre-100">
                {priveStrict
                  ? 'Mode privé strict : votre texte n’est jamais transmis à un tiers.'
                  : 'Votre texte est traité de façon sécurisée.'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Tarifs actionnables */}
        <section className="mt-8" aria-label="Tarifs">
          <p className="sur-titre text-violet-rom-300">Tarifs</p>
          <h2 className="font-display text-2xl text-encre-100 mt-2 mb-4">
            Changer d’offre
          </h2>
          <AbonnementTarifs
            plans={tousLesPlans()}
            planActuel={plan.code as CodePlan}
            premium={premium}
            simulation={etatPaiement.mode === 'simulation'}
          />
        </section>

        {/* Historique */}
        <section className="velours p-6 mt-8" aria-label="Historique">
          <AbonnementHistorique evenements={evenements} paiements={paiements} />
        </section>
      </main>
    </>
  );
}
