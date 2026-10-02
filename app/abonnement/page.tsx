// Abonnement — espace privé : offre en cours, essai gratuit, quota
// effectif, tarifs actionnables et historique. Renvoie vers /connexion
// si la session est absente. Aucun nom de moteur de traduction.
//
// Le plan affiché est le plan EFFECTIF : l'essai de 7 jours prime tant
// qu'il court ; à l'échéance, bascule automatique vers l'offre
// gratuite — la bibliothèque et les traductions sont CONSERVÉES.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BarreNavigation from '@/components/BarreNavigation';
import AbonnementStatut from '@/components/AbonnementStatut';
import AbonnementTarifs from '@/components/AbonnementTarifs';
import AbonnementHistorique from '@/components/AbonnementHistorique';
import SecuriserEssai from '@/components/paiement/SecuriserEssai';
import {
  accesPremium,
  planEffectif,
  plansPublics,
  quotaPourPlan,
  statutEffectif,
  type CodePlan,
} from '@/lib/abonnement';
import {
  etatEssai,
  MESSAGE_ESSAI_ECHU,
  MESSAGE_ESSAI_LIVRES_EPUISES,
  messageEssaiActif,
} from '@/lib/essai';
import { quotaMensuel } from '@/lib/quota';
import { MagasinAbonnementSupabase, MagasinPaiementSupabase } from '@/lib/paiement/magasin';
import { MagasinEssaiSupabase } from '@/lib/paiement/magasin-essai';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Abonnement',
  description: 'Votre offre, votre essai, votre quota de traduction et votre historique.',
};

export default async function PageAbonnement() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/abonnement');

  const supabase = await creerClientServeur();
  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  const magasinPaiement = new MagasinPaiementSupabase(supabase);
  const magasinEssai = new MagasinEssaiSupabase(supabase);

  let abonnement = await magasinAbonnement.lire(utilisateur.id);
  if (abonnement?.plan === 'essai') {
    try {
      await magasinEssai.basculerSiEchu(utilisateur.id);
      abonnement = (await magasinAbonnement.lire(utilisateur.id)) ?? abonnement;
    } catch {
      /* bascule de confort */
    }
  }

  const [profil, evenements, paiements, registre] = await Promise.all([
    supabase.from('profiles').select('pseudo').eq('id', utilisateur.id).maybeSingle(),
    magasinAbonnement.listerHistorique(utilisateur.id),
    magasinPaiement.lister(utilisateur.id),
    magasinEssai.lireRegistre(utilisateur.id).catch(() => null),
  ]);

  const pseudo =
    (profil.data as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const statut = statutEffectif(abonnement);
  const plan = planEffectif(abonnement);
  const premium = statut === 'actif' && accesPremium(plan);
  const base = quotaMensuel();
  const quota = quotaPourPlan(plan, base);
  const etatPaiement = modePaiementAffiche();
  const essai = etatEssai(abonnement);
  const essaiEpuise = essai.actif && essai.livresRestants === 0;

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

        {/* Bandeau de mode de paiement */}
        <div className="velours p-4 mt-6 text-sm text-encre-300">
          {etatPaiement.mode === 'simulation' && (
            <p>
              <strong className="text-encre-100">Mode simulation.</strong> Aucun
              paiement réel n’est possible ici : le tunnel est exerçable de bout en
              bout, sans clé ni débit.
            </p>
          )}
          {etatPaiement.mode === 'non_configure' && (
            <p>
              <strong className="text-encre-100">Paiement non configuré.</strong>{' '}
              Aucun moyen de paiement n’est branché pour l’instant. Votre compte
              reste pleinement utilisable.
            </p>
          )}
          {(etatPaiement.mode === 'sandbox' || etatPaiement.mode === 'live') && (
            <p>
              Paiement par Mobile Money. Environnement : {etatPaiement.mode}.
            </p>
          )}
        </div>

        {/* Essai gratuit */}
        {essai.actif && (
          <section
            className="velours p-6 mt-4 border border-violet-rom-500/40"
            aria-label="Essai gratuit"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[11px] uppercase tracking-wider px-3 py-1">
                7 jours offerts, sans carte
              </span>
              <span className="text-encre-300 text-sm">
                {messageEssaiActif(essai)}
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-encre-500 mb-1">
                <span>Livres utilisés pendant l’essai</span>
                <span>
                  {essai.livresUtilises} / {essai.plafondLivres}
                </span>
              </div>
              <div className="h-2 rounded-full bg-nuit-800 overflow-hidden">
                <div
                  className="h-full bg-violet-rom-500/70"
                  style={{
                    width: `${Math.min(
                      (essai.livresUtilises / essai.plafondLivres) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
            {essaiEpuise && (
              <p className="mt-3 text-sm text-grenat-300">
                {MESSAGE_ESSAI_LIVRES_EPUISES}
              </p>
            )}
            <SecuriserEssai telephone={registre?.telephone ?? null} />
          </section>
        )}

        {/* Fin d'essai */}
        {essai.echu && (
          <section
            className="velours p-6 mt-4 border border-nuit-700"
            aria-label="Fin de l’essai"
          >
            <p className="sur-titre text-encre-300">Fin de l’essai</p>
            <p className="text-encre-300 text-sm mt-2 leading-relaxed">
              {MESSAGE_ESSAI_ECHU}
            </p>
          </section>
        )}

        {/* Offre en cours */}
        <section className="velours p-6 mt-4" aria-label="Offre en cours">
          <p className="sur-titre text-encre-300">Offre en cours</p>
          <div className="mt-4">
            <AbonnementStatut
              statut={statut}
              plan={plan.code}
              periodeFin={abonnement?.periode_fin ?? null}
              premium={premium}
              essai={essai.actif}
            />
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-encre-500">Quota mensuel de traduction</dt>
              <dd className="text-encre-100">
                {quota.toLocaleString('fr-FR')} caractères
                {premium && (
                  <span className="text-encre-500"> (plafond élargi)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-encre-500">Livres par mois</dt>
              <dd className="text-encre-100">
                {plan.livresMois === null
                  ? 'Volume illimité*'
                  : `${plan.livresMois} livre${plan.livresMois > 1 ? 's' : ''}`}
              </dd>
            </div>
            <div>
              <dt className="text-encre-500">Traductions en parallèle</dt>
              <dd className="text-encre-100">{plan.traductionsSimultanees}</dd>
            </div>
            <div>
              <dt className="text-encre-500">File prioritaire</dt>
              <dd className="text-encre-100">
                {plan.filePrioritaire ? 'Incluse' : 'Normale'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Tarifs actionnables */}
        <section className="mt-8" aria-label="Tarifs">
          <p className="sur-titre text-violet-rom-300">Tarifs</p>
          <h2 className="font-display text-2xl text-encre-100 mt-2 mb-1">
            Changer d’offre
          </h2>
          <p className="text-encre-500 text-sm mb-4">
            Prix en francs CFA. Annulation possible à tout moment ; aucune
            fonctionnalité de base n’est payante.
          </p>
          <AbonnementTarifs
            plans={plansPublics()}
            planActuel={plan.code as CodePlan}
            premium={premium}
            simulation={etatPaiement.mode === 'simulation'}
            paiementConfigure={etatPaiement.configure}
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
