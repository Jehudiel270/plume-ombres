// ============================================================
// app/collections/page.tsx — Collections personnelles (A14/F22).
//
// VARIANTE ATELIER des collections : des listes PRIVÉES que le
// lecteur constitue parmi SES livres (« à relire », « série du
// moment »…). Rien n'est exposé à des tiers ; l'interrupteur reste
// marqué à risque au registre et éteint par défaut — la page n'est
// visible que si l'administrateur l'a ouverte.
//
// GARDE SERVEUR : interrupteur `collections` évalué ICI — fermé ou
// plan insuffisant → 404.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauCollections from '@/components/collections/PanneauCollections';

export const metadata = prive('Collections');

export const dynamic = 'force-dynamic';

export default async function PageCollections() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('collections', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Collections + livres de la bibliothèque (RLS « own »).
  const [collectionsLignes, livres] = await Promise.all([
    supabase
      .from('collections')
      .select(
        'id, titre, description, collections_livres ( livre_id, position, livres ( titre ) )'
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('livres')
      .select('id, titre, auteur, statut')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  type LigneCollection = {
    id: string;
    titre: string;
    description: string | null;
    collections_livres: Array<{
      livre_id: string;
      position: number;
      livres: { titre: string } | null;
    }> | null;
  };

  const collections = ((collectionsLignes.data ?? []) as unknown as LigneCollection[]).map((col) => ({
    id: col.id,
    titre: col.titre,
    description: col.description,
    livres: (col.collections_livres ?? [])
      .filter((l) => l.livres)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ id: l.livre_id, titre: l.livres?.titre ?? '' })),
  }));

  const bibliotheque = (livres.data ?? []).map((l) => {
    const ligne = l as { id: string; titre: string; auteur: string | null; statut: string };
    return { id: ligne.id, titre: ligne.titre, auteur: ligne.auteur };
  });

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
          <p className="sur-titre text-grenat-400">Collections</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Vos listes de lecture
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Des listes privées, constituées par vous, parmi vos livres : « à
            relire », « série du moment », « à offrir »… Rien n’est publié :
            une collection est un rayonnage d’atelier, pas une vitrine.
          </p>
        </header>

        <PanneauCollections collections={collections} bibliotheque={bibliotheque} />
      </main>
    </>
  );
}
