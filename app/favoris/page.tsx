// Favoris (C5) — page dédiée : les livres marqués d'une étoile, dans
// l'ordre d'ajout du favori. Rendu côté serveur (pas de client ici) :
// chaque carte est un lien vers le livre, où le favori se retire.
// Les tables `favorites` et `livres` sont filtrées par RLS (propriétaire).

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';
import BarreNavigation from '@/components/BarreNavigation';
import type { Livre, StatutLivre } from '@/lib/types';
import { libelleLangue } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mes favoris',
  description: 'Les romances que vous avez marquées d’une étoile.',
};

const ETIQUETTES_STATUT: Record<StatutLivre, string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'Erreurs à reprendre',
};

const COULEURS_STATUT: Record<StatutLivre, string> = {
  importe: 'bg-encre-500/15 text-encre-300',
  pret: 'bg-violet-rom-500/15 text-violet-rom-300',
  en_traduction: 'bg-grenat-500/15 text-grenat-300',
  traduit: 'bg-emerald-500/15 text-emerald-300',
  erreur: 'bg-amber-500/15 text-amber-300',
};

interface LigneFavori {
  id: string;
  livre_id: string;
  created_at: string;
}

export default async function PageFavoris() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/favoris');

  const supabase = await creerClientServeur();

  const [{ data: favoris }, { data: profil }] = await Promise.all([
    supabase
      .from('favorites')
      .select('id, livre_id, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', utilisateur.id)
      .maybeSingle(),
  ]);

  const lignes = (favoris ?? []) as LigneFavori[];
  const ids = lignes.map((l) => l.livre_id);

  const { data: livres } = ids.length
    ? await supabase.from('livres').select('*').in('id', ids)
    : { data: [] as Livre[] };

  // Ordre du favori le plus récent, en ignorant ce que la RLS ne rend pas
  // (favori orphelin : livre supprimé entre-temps).
  const parId = new Map((livres ?? []).map((l) => [l.id, l as Livre]));
  const visibles = lignes
    .map((l) => parId.get(l.livre_id))
    .filter((l): l is Livre => Boolean(l));

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // P1.3 : chapitres en erreur par livre favori (RLS). Un favori ne doit
  // pas masquer un chapitre à reprendre — même signal que la bibliothèque,
  // sans remonter le texte des chapitres (comptage seul).
  const idsVisibles = visibles.map((l) => l.id);
  const { data: chapitresEnErreur } = idsVisibles.length
    ? await supabase
        .from('chapitres')
        .select('livre_id')
        .eq('statut', 'erreur')
        .in('livre_id', idsVisibles)
    : { data: [] as { livre_id: string }[] };

  const comptesErreur: Record<string, number> = {};
  for (const ligne of (chapitresEnErreur ?? []) as { livre_id: string }[]) {
    comptesErreur[ligne.livre_id] = (comptesErreur[ligne.livre_id] ?? 0) + 1;
  }

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <div>
          <p className="sur-titre text-grenat-400">Vos préférés</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Mes favoris</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Les romances que vous avez marquées d’une étoile, du plus récent au plus
            ancien.
          </p>
        </div>

        {visibles.length === 0 ? (
          /* ---------------- État vide ---------------- */
          <div className="velours p-12 text-center">
            <p className="text-5xl mb-4 opacity-80" aria-hidden>
              ☆
            </p>
            <p className="text-encre-100 font-display text-2xl">
              Aucun livre sous l’étoile.
            </p>
            <p className="text-encre-500 text-sm mt-3 max-w-md mx-auto leading-relaxed italic">
              Depuis la bibliothèque, touchez l’étoile d’une carte : le livre viendra
              s’aligner ici, à portée de main.
            </p>
            <Link href="/bibliotheque" className="bouton-principal mt-6 inline-flex">
              Ouvrir ma bibliothèque
            </Link>
          </div>
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {visibles.length} livre{visibles.length > 1 ? 's' : ''} en favori.
            </p>
            <div
              role="list"
              aria-label={`Favoris (${visibles.length})`}
              className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {visibles.map((livre, i) => (
                <Link
                  key={livre.id}
                  href={`/livres/${livre.id}`}
                  role="listitem"
                  className="carte-livre animate-fondu-monte group !no-underline"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg text-encre-100 leading-snug group-hover:text-grenat-300 transition-colors line-clamp-2">
                        {livre.titre}
                      </h2>
                      {livre.auteur && (
                        <p className="text-encre-500 text-xs mt-0.5 italic truncate">
                          {livre.auteur}
                        </p>
                      )}
                    </div>
                    <span aria-hidden className="shrink-0 text-grenat-300">
                      ★
                    </span>
                  </div>

                  <p className="text-[11px] text-encre-500 break-all min-w-0">
                    {libelleLangue(livre.langue_source)} →{' '}
                    {libelleLangue(livre.langue_cible)}
                    {livre.nom_fichier ? ` · ${livre.nom_fichier}` : ''}
                  </p>

                  {/* P1.3 : chapitres à reprendre visibles jusque dans les
                      favoris — le livre peut être « traduit » et garder
                      des chapitres en erreur. */}
                  {(comptesErreur[livre.id] ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-300 flex items-center gap-1.5 min-w-0">
                      <span aria-hidden>⚠</span>
                      <span className="truncate">
                        {comptesErreur[livre.id] === 1
                          ? '1 chapitre à reprendre'
                          : `${comptesErreur[livre.id]} chapitres à reprendre`}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[11px] text-encre-500 mt-auto pt-2 border-t border-nuit-700/60">
                    <span
                      className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 ${COULEURS_STATUT[livre.statut]}`}
                    >
                      {ETIQUETTES_STATUT[livre.statut]}
                    </span>
                    <span className="truncate min-w-0">
                      Modifié le{' '}
                      {new Date(livre.updated_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
