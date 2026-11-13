// ============================================================
// app/genres/[slug]/page.tsx — Les livres d'un genre (A1-A5,
// variante atelier).
//
// GARDE SERVEUR : interrupteur `catalogue_public` évalué ICI.
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { chargerAmbiances, libelleIntensite, type Intensite } from '@/lib/ambiance';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Genre');

export const dynamic = 'force-dynamic';

export default async function PageGenre({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('catalogue_public', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  const nomGenre = decodeURIComponent(slug).toLowerCase();

  const [livresLignes, ambiances] = await Promise.all([
    supabase
      .from('livres')
      .select('id, titre, auteur, statut')
      .order('created_at', { ascending: false })
      .limit(300),
    chargerAmbiances(supabase),
  ]);

  type Livre = { id: string; titre: string; auteur: string | null; statut: string };

  const livres = ((livresLignes.data ?? []) as unknown as Livre[]).filter((l) => {
    const fiche = ambiances.get(l.id);
    return fiche?.genres.some((g) => g.toLowerCase() === nomGenre);
  });

  // Le genre EXACT tel que noté (majuscules d'origine).
  const genreAffiche =
    livres
      .map((l) => ambiances.get(l.id)?.genres.find((g) => g.toLowerCase() === nomGenre))
      .find(Boolean) ?? nomGenre;

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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/genres" className="hover:text-grenat-300">
              Genres
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">{genreAffiche}</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3">
            {livres.length} livre{livres.length > 1 ? 's' : ''} de votre
            bibliothèque porte{livres.length > 1 ? 'nt' : ''} ce genre dans sa
            fiche d’ambiance.
          </p>
        </header>

        {livres.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Aucun livre avec ce genre. <Link href="/ambiance" className="underline">Poser l’ambiance</Link> d’un
            livre pour le ranger ici.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {livres.map((l) => {
              const fiche = ambiances.get(l.id);
              return (
                <li key={l.id} className="velours p-4 rounded-2xl">
                  <h2 className="font-display text-lg text-encre-100">
                    <Link href={`/livres/${l.id}`} className="hover:text-grenat-300">
                      {l.titre}
                    </Link>
                  </h2>
                  {l.auteur && <p className="text-xs text-encre-500">{l.auteur}</p>}
                  {fiche && (
                    <p className="mt-1.5 text-xs text-encre-500">
                      Intensité {fiche.intensite} sur 5 — {libelleIntensite(fiche.intensite as Intensite)}
                      {fiche.tropes.length > 0 && ` · ${fiche.tropes.slice(0, 3).join(', ')}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
