// ============================================================
// app/genres/page.tsx — Index des genres de VOTRE bibliothèque
// (A1-A5, variante atelier).
//
// Les genres viennent des fiches d'ambiance (F5) posées par le
// propriétaire de chaque livre. Rien de public : la page regroupe
// vos livres, elle ne met rien à disposition de tiers.
//
// GARDE SERVEUR : interrupteur `catalogue_public` évalué ICI.
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { chargerAmbiances } from '@/lib/ambiance';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Genres de votre bibliothèque');

export const dynamic = 'force-dynamic';

export default async function PageGenres() {
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

  const [livresLignes, ambiances] = await Promise.all([
    supabase.from('livres').select('id, titre').limit(300),
    chargerAmbiances(supabase),
  ]);

  // Genre → livres (titre connu de la bibliothèque seulement).
  const parGenre = new Map<string, Array<{ id: string; titre: string }>>();
  for (const l of ((livresLignes.data ?? []) as unknown as Array<{ id: string; titre: string }>)) {
    const fiche = ambiances.get(l.id);
    if (!fiche) continue;
    for (const g of fiche.genres) {
      const liste = parGenre.get(g) ?? [];
      liste.push(l);
      parGenre.set(g, liste);
    }
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  const genres = [...parGenre.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr')
  );

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Genres</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Vos genres, d’après vos fiches d’ambiance
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Chaque genre regroupe les livres pour lesquels vous l’avez noté
            dans sa fiche d’ambiance. Vous n’en voyez pas ? Complétez les
            fiches depuis le module Ambiance.
          </p>
        </header>

        {genres.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Aucun genre noté pour l’instant. Ouvrez le module Ambiance et
            décrivez vos livres : genres, tropes, intensité.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {genres.map(([genre, livres]) => (
              <li key={genre} className="velours p-4 rounded-2xl">
                <h2 className="font-display text-lg text-encre-100">
                  <Link
                    href={`/genres/${encodeURIComponent(genre.toLowerCase())}`}
                    className="hover:text-grenat-300"
                  >
                    {genre}
                  </Link>
                </h2>
                <p className="mt-1 text-xs text-encre-500">
                  {livres.length} livre{livres.length > 1 ? 's' : ''}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {livres.slice(0, 4).map((l) => (
                    <li key={l.id} className="text-xs text-encre-400 truncate">
                      <Link href={`/livres/${l.id}`} className="hover:text-encre-200">
                        {l.titre}
                      </Link>
                    </li>
                  ))}
                  {livres.length > 4 && (
                    <li className="text-[11px] text-encre-500">
                      et {livres.length - 4} autre{livres.length - 4 > 1 ? 's' : ''}…
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
