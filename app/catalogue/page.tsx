// ============================================================
// app/catalogue/page.tsx — Catalogue de la bibliothèque (A1-A5,
// VARIANTE ATELIER).
//
// La maquette prévoyait un catalogue PUBLIC de contenus traduits
// mis à disposition — hors périmètre (risque juridique, interrupteur
// éteint). La variante honnête, câblée sur des données réelles : un
// catalogue de VOS livres importés, filtrable par genre (fiches
// d'ambiance), statut de traduction, langue source et recherche.
// C'est votre rayonnage, présenté comme une librairie.
//
// GARDE SERVEUR : interrupteur `catalogue_public` évalué ICI —
// fermé, sans confirmation juriste → 404.
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

export const metadata = prive('Catalogue de la bibliothèque');

export const dynamic = 'force-dynamic';

const STATUTS = ['importe', 'pret', 'en_traduction', 'traduit', 'erreur'] as const;

const LIBELLES_STATUT: Record<string, string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'En erreur',
};

const normaliser = (valeur: string) =>
  valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default async function PageCatalogue({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; statut?: string }>;
}) {
  const { q, genre, statut } = await searchParams;
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
    supabase
      .from('livres')
      .select('id, titre, auteur, statut, langue_source')
      .order('created_at', { ascending: false })
      .limit(300),
    chargerAmbiances(supabase),
  ]);

  type Livre = {
    id: string;
    titre: string;
    auteur: string | null;
    statut: string;
    langue_source: string;
  };

  // Genres présents dans la bibliothèque (fiches d'ambiance).
  const genres = new Set<string>();
  for (const fiche of ambiances.values()) {
    for (const g of fiche.genres) genres.add(g);
  }

  // Filtres (côté serveur : le serveur est l'autorité).
  const recherche = (q ?? '').trim().toLowerCase();
  const genreChoisi = (genre ?? '').trim();
  const statutChoisi = (statut ?? '').trim();

  const livres = ((livresLignes.data ?? []) as unknown as Livre[]).filter((l) => {
    if (recherche) {
      const cible = normaliser(`${l.titre} ${l.auteur ?? ''}`);
      if (!cible.includes(normaliser(recherche))) return false;
    }
    if (genreChoisi) {
      const fiche = ambiances.get(l.id);
      if (!fiche || !fiche.genres.some((g) => g === genreChoisi)) return false;
    }
    if (statutChoisi && l.statut !== statutChoisi) return false;
    return true;
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Catalogue</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Votre rayonnage, présenté comme une librairie
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Votre bibliothèque entière, filtrable par genre, statut de
            traduction et recherche. Rien de public ici : c’est votre atelier,
            habillé en librairie.
          </p>
        </header>

        {/* Filtres */}
        <form
          method="get"
          className="velours p-5 rounded-2xl grid gap-3 sm:grid-cols-4 items-end"
        >
          <label className="block text-sm text-encre-400 sm:col-span-2">
            Rechercher (titre ou auteur)
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Un titre, un nom…"
              className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
          </label>
          <label className="block text-sm text-encre-400">
            Genre (ambiance)
            <select
              name="genre"
              defaultValue={genreChoisi}
              className="champ-sombre select-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            >
              <option value="">Tous</option>
              {[...genres].sort((a, b) => a.localeCompare(b, 'fr')).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-encre-400">
            Statut
            <select
              name="statut"
              defaultValue={statutChoisi}
              className="champ-sombre select-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            >
              <option value="">Tous</option>
              {STATUTS.map((s) => (
                <option key={s} value={s}>
                  {LIBELLES_STATUT[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button type="submit" className="bouton-principal !min-h-10 cursor-pointer">
              Filtrer
            </button>
            <Link href="/catalogue" className="bouton-fantome !min-h-10 cursor-pointer">
              Réinitialiser
            </Link>
          </div>
        </form>

        {/* Résultats */}
        {livres.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Aucun livre ne répond à ces filtres.
          </p>
        ) : (
          <>
            <p className="text-xs text-encre-500">
              {livres.length} livre{livres.length > 1 ? 's' : ''}
            </p>
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
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[10px] text-encre-400">
                        {LIBELLES_STATUT[l.statut] ?? l.statut}
                      </span>
                      {fiche && (
                        <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[10px] text-encre-400">
                          Intensité {fiche.intensite} sur 5
                        </span>
                      )}
                      {fiche?.genres.slice(0, 3).map((g) => (
                        <Link
                          key={g}
                          href={`/genres/${encodeURIComponent(g.toLowerCase())}`}
                          className="rounded-full border border-grenat-700/50 px-2 py-0.5 text-[10px] text-grenat-300 hover:bg-white/[0.04]"
                        >
                          {g}
                        </Link>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
