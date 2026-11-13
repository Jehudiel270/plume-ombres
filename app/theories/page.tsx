// ============================================================
// app/theories/page.tsx — Théories de lecture (F8) + comparateur
// (F19).
//
// GARDE SERVEUR : interrupteur `theories` évalué ICI
// (verifierAccesModule) — module fermé → 404, comme si la page
// n'existait pas. Les théories restent PRIVÉES (atelier personnel) :
// aucune partie de ce module n'est partageable.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { listerTheories, type Theorie } from '@/lib/theories';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauTheories from '@/components/theories/PanneauTheories';

export const metadata = prive('Théories de lecture');

export const dynamic = 'force-dynamic';

export default async function PageTheories({
  searchParams,
}: {
  searchParams: Promise<{ livre?: string }>;
}) {
  const { livre: paramLivre } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('theories', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  // Livres du compte (RLS « own »).
  const { data: livresBruts } = await supabase
    .from('livres')
    .select('id, titre')
    .order('updated_at', { ascending: false })
    .limit(100);
  const livres = (livresBruts ?? []) as Array<{ id: string; titre: string }>;

  const livreId =
    paramLivre && livres.some((l) => l.id === paramLivre) ? paramLivre : null;
  const theories: Theorie[] = await listerTheories(supabase, livreId).catch(() => []);

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
          <p className="sur-titre text-grenat-400">Compréhension</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Théories</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Vos hypothèses de lecture, consignées et tranchées quand l’histoire
            répond. Le comparateur vérifie d’un coup d’œil comment un terme a
            été rendu dans toute la traduction.
          </p>
        </header>

        <PanneauTheories livres={livres} theories={theories} livreId={livreId} />
      </main>
    </>
  );
}
