// ============================================================
// app/progression/badges/page.tsx — Les badges en détail (A17).
//
// Page dédiée du module Progression (l'index reste /progression) :
// filtres par famille, état obtenu / verrouillé, ce qu'il faut pour
// décrocher chaque badge. Toujours non punitif : un badge manquant
// est une invitation, jamais un échec.
//
// GARDE SERVEUR : interrupteur `progression` (sous-chemin couvert).
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { BADGES, badgesPour, type Badge } from '@/lib/xp';
import { niveauPlanDepuisCode } from '@/lib/fonctionnalites/registre';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Badges de lecture');

export const dynamic = 'force-dynamic';

const FAMILLES = [
  ['chapitres', 'Chapitres découverts'],
  ['carnet', 'Carnet'],
  ['theories', 'Théories'],
  ['graphes', 'Graphe narratif'],
  ['traduction', 'Traduction'],
  ['exclusif', 'Souvenirs d’abonnés'],
] as const;

function badgesDeFamille(famille: string): Badge[] {
  return BADGES.filter((b) => b.genre === famille);
}

export default async function PageBadges() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('progression', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Les mêmes compteurs que l'index (lib/xp : règles pures).
  const [xpLignes, carnet, theories, personnages, traduits] = await Promise.all([
    supabase.from('lectures_xp').select('xp').limit(5000),
    supabase.from('carnet_notes').select('id', { count: 'exact', head: true }),
    supabase.from('theories').select('id', { count: 'exact', head: true }),
    supabase.from('graphe_personnages').select('id', { count: 'exact', head: true }),
    supabase.from('livres').select('id', { count: 'exact', head: true }).eq('statut', 'traduit'),
  ]);
  const codes = badgesPour({
    chapitres: xpLignes.data?.length ?? 0,
    carnet: carnet.count ?? 0,
    theories: theories.count ?? 0,
    personnages: personnages.count ?? 0,
    livresTraduits: traduits.count ?? 0,
    abonne:
      niveauPlanDepuisCode(planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT) !== 'gratuit',
  });
  const obtenus = new Set(codes);

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/progression" className="hover:text-grenat-300">
              Progression
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Vos badges-souvenirs
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            {obtenus.size} badge{obtenus.size > 1 ? 's' : ''} décroché
            {obtenus.size > 1 ? 's' : ''} sur la collection complète. Un badge
            manquant n’est pas un échec : c’est une lecture qui vous attend.
          </p>
        </header>

        {FAMILLES.map(([famille, libelle]) => (
          <section key={famille} className="space-y-3" aria-label={libelle}>
            <h2 className="sur-titre text-encre-300">{libelle}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {badgesDeFamille(famille).map((b) => {
                const eu = obtenus.has(b.code);
                return (
                  <li
                    key={b.code}
                    className={`p-4 rounded-2xl border ${
                      eu ? 'velours border-grenat-700/60' : 'border-nuit-700/60 opacity-60'
                    }`}
                  >
                    <p className="text-sm text-encre-100">
                      {b.nom}{' '}
                      {eu ? (
                        <span className="text-grenat-400 text-xs">· obtenu</span>
                      ) : (
                        <span className="text-encre-500 text-xs">· à venir</span>
                      )}
                    </p>
                    <p className="text-xs text-encre-500 mt-1">{b.description}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
