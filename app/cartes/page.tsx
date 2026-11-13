// ============================================================
// app/cartes/page.tsx — Cartes de lecture partageables (F13).
//
// GARDE SERVEUR : interrupteur `cartes` évalué ICI — module fermé →
// 404. La page ne charge que les livres et chapitres du compte
// (titres) : aucun texte intégral n'est transféré, l'extrait est
// collé par le lecteur et plafonné côté client ET dans la lib.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauCartes from '@/components/cartes/PanneauCartes';

export const metadata = prive('Cartes de lecture');

export const dynamic = 'force-dynamic';

export default async function PageCartes({
  searchParams,
}: {
  searchParams: Promise<{ livre?: string; chapitre?: string }>;
}) {
  const { livre: paramLivre } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('cartes', {
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

  // Chapitres du livre présélectionné (titres seulement).
  const livreId =
    paramLivre && livres.some((l) => l.id === paramLivre) ? paramLivre : livres[0]?.id ?? null;
  let chapitres: Array<{ id: string; titre: string }> = [];
  if (livreId) {
    const { data } = await supabase
      .from('chapitres')
      .select('id, titre')
      .eq('livre_id', livreId)
      .order('position', { ascending: true })
      .limit(500);
    chapitres = ((data ?? []) as Array<{ id: string; titre: string | null }>).map((c) => ({
      id: c.id,
      titre: c.titre ?? 'Chapitre',
    }));
  }

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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Partage</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Cartes de lecture</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Une citation mise en carte, avec son attribution : pour garder une
            trace visuelle d’un passage qui vous a marquée.
          </p>
        </header>

        <PanneauCartes livres={livres} chapitres={chapitres} />
      </main>
    </>
  );
}
