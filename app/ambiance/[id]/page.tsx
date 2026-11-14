// ============================================================
// app/ambiance/[id]/page.tsx — Fiche d'ambiance d'un livre (F5 v2,
// RICHE). Reprend le cahier initial EN ENTIER : palette de 5
// couleurs nommées, atmosphère, ton, rythme (niveau 1 → 5 + libellé),
// promesses sans spoiler, playlist nommée (pistes : titre, humeur,
// minutes), citation d'ouverture du chapitre 1, mots-clés — ET les
// recommandations « Pour vous si vous avez aimé » : les autres
// livres de votre bibliothèque qui partagent genres et tropes.
//
// GARDE SERVEUR : interrupteur `ambiance` (sous-chemin couvert),
// livre du compte uniquement (RLS).
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  chargerAmbiances,
  dureePlaylist,
  libelleIntensite,
  libelleRythme,
  scoreRecommandation,
  type Intensite,
} from '@/lib/ambiance';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import BoutonSuivi from '@/components/suivis/BoutonSuivi';

export const metadata = prive('Fiche d’ambiance');

export const dynamic = 'force-dynamic';

export default async function PageAmbianceDetail({
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

  const moduleVerdict = await verifierAccesModule('ambiance', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Module « suivis » : le bouton « Je suis cette œuvre » n'est
  // monté que si l'interrupteur est ouvert (le serveur est l'autorité).
  const moduleSuivis = await verifierAccesModule('suivis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  let suiviInitial = false;
  if (moduleSuivis.ouvert) {
    const { data: suiviLigne } = await supabase
      .from('suivis_oeuvres')
      .select('livre_id')
      .eq('livre_id', id)
      .maybeSingle();
    suiviInitial = !!suiviLigne;
  }

  // Le livre (RLS : autrui → rien) et TOUTES les fiches (pour les
  // recommandations et le rappel de rayonnage).
  const [livreLigne, ambiances] = await Promise.all([
    supabase
      .from('livres')
      .select('id, titre, auteur')
      .eq('id', id)
      .maybeSingle(),
    chargerAmbiances(supabase),
  ]);

  const livre = livreLigne.data as unknown as {
    id: string;
    titre: string;
    auteur: string | null;
  } | null;
  const fiche = ambiances.get(id);
  if (!livre || !fiche) notFound();

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // Titres des autres livres du compte (pour les recommandations).
  const autresIds = Array.from(ambiances.keys()).filter((k) => k !== id);
  const titres = new Map<string, string>();
  await Promise.all(
    autresIds.map(async (autreId) => {
      const { data: autreLivre } = await supabase
        .from('livres')
        .select('id, titre')
        .eq('id', autreId)
        .maybeSingle();
      if (autreLivre) {
        titres.set(
          (autreLivre as { id: string; titre: string }).id,
          (autreLivre as { id: string; titre: string }).titre
        );
      }
    })
  );

  // Recommandations « Pour vous si vous avez aimé » : genres (×2)
  // + tropes (×1), classées, jamais un livre sans aucun lien.
  const recommandations = Array.from(ambiances.values())
    .filter((a) => a.livre_id !== id)
    .map((a) => ({
      livreId: a.livre_id,
      titre: titres.get(a.livre_id) ?? 'Votre livre',
      ...scoreRecommandation(fiche, a),
      ambiance: a,
    }))
    .filter((r) => r.score > 0 && titres.has(r.livreId))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const totalPlaylist = dureePlaylist(fiche.playlist);
  const rythmeNiveau = fiche.rythmeNiveau;

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/ambiance" className="hover:text-grenat-300">
              Ambiance
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">{livre.titre}</h1>
          {livre.auteur && <p className="text-encre-500 text-sm mt-1">{livre.auteur}</p>}
          {moduleSuivis.ouvert && (
            <div className="mt-3">
              <BoutonSuivi livreId={id} suiviInitial={suiviInitial} titre={livre.titre} />
            </div>
          )}
          <div className="liseret mt-3" />
          {fiche.motsCles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {fiche.motsCles.map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-nuit-700 px-2.5 py-0.5 text-xs text-encre-300"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Palette nommée du cahier initial */}
        {fiche.palette.length > 0 && (
          <section aria-labelledby="titre-palette">
            <h2 id="titre-palette" className="sur-titre text-encre-300">
              Palette
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {fiche.palette.map((c) => (
                <li
                  key={`${c.nom}-${c.hex}`}
                  className="overflow-hidden rounded-lg border border-nuit-700"
                >
                  <span
                    aria-hidden="true"
                    className="block h-16"
                    style={{ background: c.hex }}
                  />
                  <span className="block bg-nuit-800 px-2.5 py-2 text-xs">
                    <span className="block text-encre-100">{c.nom}</span>
                    <span className="block text-encre-500">{c.hex}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Atmosphère, ton, rythme */}
        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="titre-atmosphere">
          <div className="sm:col-span-2 velours rounded-2xl p-5">
            <h2 id="titre-atmosphere" className="sur-titre text-encre-300">
              Atmosphère
            </h2>
            {fiche.atmosphere ? (
              <p className="mt-2 font-display text-2xl leading-snug text-encre-100">
                {fiche.atmosphere}
              </p>
            ) : (
              <p className="mt-2 text-sm text-encre-500 italic">
                L’atmosphère n’est pas encore posée — complétez la fiche.
              </p>
            )}
          </div>
          {fiche.ton && (
            <div className="velours rounded-2xl p-4">
              <h2 className="sur-titre text-encre-300">Ton</h2>
              <p className="mt-2 text-sm text-encre-300">{fiche.ton}</p>
            </div>
          )}
          <div className="velours rounded-2xl p-4">
            <h2 className="sur-titre text-encre-300">Intensité &amp; rythme</h2>
            <p className="mt-2 text-sm text-encre-300">
              Intensité {fiche.intensite} sur 5 —{' '}
              {libelleIntensite(fiche.intensite as Intensite)}
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="h-2.5 w-10 rounded-full"
                  style={{
                    background:
                      n <= fiche.intensite ? 'var(--color-grenat-400)' : 'rgba(255,255,255,.08)',
                  }}
                />
              ))}
            </div>
            {rythmeNiveau !== null && (
              <>
                <p className="mt-3 text-sm text-encre-300">
                  {fiche.rythmeLabel ?? libelleRythme(rythmeNiveau)}
                </p>
                <div className="mt-2 flex gap-1.5" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className="h-2.5 w-10 rounded-full"
                      style={{
                        background:
                          n <= rythmeNiveau
                            ? 'var(--color-violet-rom-400)'
                            : 'rgba(255,255,255,.08)',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Promesses, sans spoiler */}
        {fiche.promesses.length > 0 && (
          <section aria-labelledby="titre-promesses">
            <h2 id="titre-promesses" className="sur-titre text-encre-300">
              Ce que le livre promet
            </h2>
            <p className="text-xs text-encre-500 mt-1">
              Aucun élément d’intrigue : ce que l’œuvre tient dès les premières
              pages.
            </p>
            <ul className="mt-3 space-y-2">
              {fiche.promesses.map((p) => (
                <li key={p} className="flex gap-2.5 text-[15px] text-encre-300">
                  <span aria-hidden="true" className="text-or-ros-300 mt-0.5">
                    ✦
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Genres et tropes */}
        {(fiche.genres.length > 0 || fiche.tropes.length > 0) && (
          <section aria-labelledby="titre-genres">
            <h2 id="titre-genres" className="sur-titre text-encre-300">
              Genres &amp; tropes
            </h2>
            {fiche.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {fiche.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/genres/${encodeURIComponent(g.toLowerCase())}`}
                    className="rounded-full border border-nuit-700 px-2.5 py-0.5 text-xs text-encre-200 hover:border-grenat-400"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            )}
            {fiche.tropes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fiche.tropes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-nuit-700/60 px-2.5 py-0.5 text-xs text-encre-400"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Citation d'ouverture du chapitre 1 */}
        {fiche.citationOuverture && (
          <section
            aria-labelledby="titre-citation"
            className="rounded-2xl border-l-2 border-grenat-500 bg-nuit-850/70 p-5"
          >
            <h2 id="titre-citation" className="sur-titre text-encre-300">
              Citation d’ouverture
            </h2>
            <blockquote className="mt-2 font-display text-xl italic leading-snug text-encre-100">
              « {fiche.citationOuverture} »
            </blockquote>
            <p className="mt-2 text-xs text-encre-500">
              Première phrase du chapitre 1, sans révélation.
            </p>
          </section>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Link href={`/livres/${livre.id}`} className="bouton-principal !min-h-10 cursor-pointer">
            Ouvrir le livre
          </Link>
          <Link href="/ambiance" className="bouton-fantome !min-h-10 cursor-pointer">
            Modifier la fiche
          </Link>
        </div>

        {/* Playlist nommée, pistes, humeurs, minutes */}
        {fiche.playlist.length > 0 && (
          <section aria-labelledby="titre-playlist" className="velours rounded-2xl p-5">
            <h2 id="titre-playlist" className="font-display text-lg text-encre-100">
              {fiche.playlistNom ?? 'Playlist d’ambiance'}
            </h2>
            <p className="mt-1 text-xs text-encre-500">
              Playlist d’ambiance imaginée pour la lecture · {fiche.playlist.length}{' '}
              titre{fiche.playlist.length > 1 ? 's' : ''} · {totalPlaylist} min
            </p>
            <ol className="mt-3 divide-y divide-nuit-700/70">
              {fiche.playlist.map((p, i) => (
                <li key={`${p.titre}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-xs text-encre-500 tnum">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-encre-100">{p.titre}</span>
                    {p.humeur && (
                      <span className="block truncate text-xs text-encre-500">{p.humeur}</span>
                    )}
                  </span>
                  <span className="text-xs text-encre-500 tnum">{p.minutes} min</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Recommandations : pour vous si vous avez aimé */}
        {recommandations.length > 0 && (
          <section aria-labelledby="titre-pour-vous">
            <h2 id="titre-pour-vous" className="sur-titre text-encre-300">
              Pour vous si vous avez aimé « {livre.titre} »
            </h2>
            <p className="text-xs text-encre-500 mt-1">
              Vos autres livres qui partagent ses genres et ses tropes.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {recommandations.map((r) => (
                <li key={r.livreId} className="rounded-xl border border-nuit-700/70 px-4 py-3">
                  <Link
                    href={`/ambiance/${r.livreId}`}
                    className="text-sm text-encre-200 hover:text-grenat-300"
                  >
                    {r.titre}
                  </Link>
                  <p className="text-[11px] text-encre-500 mt-0.5">
                    {[...r.genres, ...r.tropes].join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
