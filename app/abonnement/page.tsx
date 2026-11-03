// Abonnement (P0.9) — espace privé : offre en cours, quota effectif,
// tarifs actionnables et historique. Renvoie vers /connexion si la
// session est absente.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BarreNavigation from '@/components/BarreNavigation';
import AbonnementStatut from '@/components/AbonnementStatut';
import AbonnementTarifs from '@/components/AbonnementTarifs';
import AbonnementCredits from '@/components/AbonnementCredits';
import AbonnementHistorique from '@/components/AbonnementHistorique';
import JaugeQuota from '@/components/JaugeQuota';
import {
  CODE_PLAN_GRATUIT,
  estPlanPremium,
  packsCredits,
  planParCode,
  plansAbonnementAffiches,
  planEnVigueur,
  quotaPourPlan,
  statutEffectif,
  type CodePlan,
} from '@/lib/abonnement';
import { quotaMensuel, periodeMois, lireQuotaRestant, MagasinQuotaSupabase } from '@/lib/quota';
import { modePriveStrict } from '@/lib/providers';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
  lireMouvementsCredits,
} from '@/lib/paiement/magasin';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Abonnement',
  description:
    'Votre offre, votre quota de traduction, vos crédits et votre historique.',
};

export default async function PageAbonnement() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/abonnement');

  const supabase = await creerClientServeur();
  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  const magasinPaiement = new MagasinPaiementSupabase(supabase);
  const magasinCredits = new MagasinCreditsSupabase(supabase);

  const [profil, abonnement, evenements, paiements, solde, mouvements] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('pseudo')
        .eq('id', utilisateur.id)
        .maybeSingle(),
      magasinAbonnement.lire(utilisateur.id),
      magasinAbonnement.listerHistorique(utilisateur.id),
      magasinPaiement.lister(utilisateur.id),
      // Tolérant : un compte sans crédits (ou une base pas encore migrée)
      // ne doit jamais casser la page.
      magasinCredits.lireSolde(utilisateur.id).catch(() => 0),
      lireMouvementsCredits(supabase, utilisateur.id).catch(() => []),
    ]);

  const pseudo =
    (profil.data as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const statut = statutEffectif(abonnement);
  const plan =
    planParCode(abonnement?.plan ?? null) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const premium = statut === 'actif' && estPlanPremium(plan);
  const base = quotaMensuel();

  // Défense en profondeur : le quota élargi d'un plan n'est accordé que
  // si l'abonnement est RÉELLEMENT en vigueur (periode_fin > now()). Un
  // abonnement échu retombe sur le plafond de base, jamais sur le quota
  // Premium — miroir EXACT de public.limite_abonnement (SQL).
  const planQuota =
    planParCode(planEnVigueur(abonnement)) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const quota = quotaPourPlan(planQuota, base);
  // Usage RÉEL du mois (caractères soumis à traduction) : sans cette
  // lecture, la page n'affichait que le plafond — un chiffre qui ne
  // bouge jamais, donc muet sur ce qu'il reste réellement au compte.
  // Tolérant : une base pas encore migrée n'empêche pas l'affichage.
  const usageQuota = await lireQuotaRestant(
    new MagasinQuotaSupabase(supabase),
    utilisateur.id,
    new Date(),
    quota
  ).catch(() => null);
  const etatPaiement = modePaiementAffiche();
  const priveStrict = modePriveStrict();
  // Repli si l'usage est illisible : la période du mois civil en cours.
  const moisCourant = periodeMois();

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
              Paiement sécurisé via{' '}
              <strong className="text-encre-100">
                {etatPaiement.fournisseur === 'fedapay' ? 'FedaPay' : etatPaiement.fournisseur}
              </strong>{' '}
              (Mobile Money).
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
          <dl className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
            {/* Quota + crédits : rendus par le SERVEUR (valeur exacte dès
                le premier pixel) puis rafraîchis par JaugeQuota à chaque
                traduction facturée. */}
            <JaugeQuota
              initial={{
                utilise: usageQuota?.utilise ?? 0,
                limite: usageQuota?.limite ?? quota,
                restant: usageQuota?.restant ?? quota,
                soldeCredits: solde,
                periode: usageQuota?.periode ?? {
                  debut: moisCourant.debut,
                  fin: moisCourant.fin,
                },
              }}
            />
            <div>
              <dt className="text-encre-500">Confidentialité de la traduction</dt>
              <dd className="text-encre-100">
                {priveStrict
                  ? 'Mode privé strict : votre texte n’est jamais transmis à un tiers.'
                  : 'Votre texte est traité de façon sécurisée.'}
              </dd>
            </div>
          </dl>
          {premium && (
            <p className="text-encre-500 text-xs mt-3">
              Offre Premium en vigueur : plafond mensuel élargi à{' '}
              {quota.toLocaleString('fr-FR')} caractères, remis à zéro le
              1<sup>er</sup> de chaque mois.
            </p>
          )}
        </section>

        {/* Crédits prépayés : solde + packs (pay-as-you-go) */}
        <AbonnementCredits
          solde={solde}
          packs={packsCredits()}
          simulation={etatPaiement.mode === 'simulation'}
        />

        {/* Tarifs actionnables (abonnements) */}
        <section className="mt-8" aria-label="Tarifs">
          <p className="sur-titre text-violet-rom-300">Abonnements</p>
          <h2 className="font-display text-2xl text-encre-100 mt-2 mb-4">
            Changer d’offre
          </h2>
          <AbonnementTarifs
            plans={plansAbonnementAffiches()}
            planActuel={plan.code as CodePlan}
            premium={premium}
            simulation={etatPaiement.mode === 'simulation'}
          />
        </section>

        {/* Historique */}
        <section className="velours p-6 mt-8" aria-label="Historique">
          <AbonnementHistorique
            evenements={evenements}
            paiements={paiements}
            mouvements={mouvements}
          />
        </section>
      </main>
    </>
  );
}
