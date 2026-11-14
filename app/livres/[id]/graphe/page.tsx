// ============================================================
// app/livres/[id]/graphe/page.tsx — Graphe narratif anti-spoilers
// (F25, manuel d'abord).
//
// GARDE SERVEUR : interrupteur `graphe` évalué ICI
// (verifierAccesModule) — module fermé → 404. La page ne charge que
// la COQUE (livre + chapitres du compte, RLS « own ») ; les données
// du graphe viennent de l'API, filtrée côté serveur par le chapitre
// lu — rien au-delà ne quitte la base.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauGraphe from '@/components/graphe/PanneauGraphe';
import PanneauIaGraphe from '@/components/graphe/PanneauIaGraphe';

export const metadata = prive('Graphe narratif');

export const dynamic = 'force-dynamic';

export default async function PageGraphe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('graphe', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  // Livre du compte (RLS « own ») : un livre d'autrui est introuvable.
  const { data: livre } = await supabase
    .from('livres')
    .select('id, titre, proprietaire_id')
    .eq('id', id)
    .maybeSingle();
  if (!livre) notFound();
  const fiche = livre as { id: string; titre: string; proprietaire_id: string };

  // Chapitres (coque seulement : titres + positions).
  const { data: chapitresBruts } = await supabase
    .from('chapitres')
    .select('id, titre, position')
    .eq('livre_id', id)
    .order('position', { ascending: true });
  const chapitres = ((chapitresBruts ?? []) as Array<{
    id: string;
    titre: string | null;
    position: number;
  }>).map((c) => ({ id: c.id, titre: c.titre ?? `Chapitre ${c.position}`, position: c.position }));

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
          <p className="sur-titre text-grenat-400">
            <Link href={`/livres/${id}`} className="hover:underline">
              {fiche.titre}
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Graphe narratif</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Personnages et relations, filtrés par votre chapitre lu : le
            serveur ne révèle rien au-delà. Construisez le graphe au fil de
            votre lecture — chaque apparition est datée.
          </p>
        </header>

        {fiche.proprietaire_id === utilisateur.id && chapitres.length > 0 && (
          <PanneauIaGraphe livreId={id} positionMax={chapitres.length} />
        )}

        <PanneauGraphe
          livreId={id}
          chapitres={chapitres}
          estProprietaire={fiche.proprietaire_id === utilisateur.id}
        />
      </main>
    </>
  );
}
