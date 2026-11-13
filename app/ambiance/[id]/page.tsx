// ============================================================
// app/ambiance/[id]/page.tsx — Fiche d'ambiance d'un livre (F5).
//
// La page /ambiance édite la fiche en place ; celle-ci la PRÉSENTE :
// genres, tropes, échelle d'intensité avec palette d'atmosphère
// (déduite de l'intensité, déterministe), et les AUTRES livres de
// votre bibliothèque qui partagent un genre — des rappels de
// rayonnage, pas des recommandations commerciales.
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
import { chargerAmbiances, libelleIntensite, type Intensite } from '@/lib/ambiance';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Fiche d’ambiance');

export const dynamic = 'force-dynamic';

/** Palette d'atmosphère (PUR, déterministe) : l'intensité choisit la
 *  teinte de la fiche — de la lueur grise au grenat profond. */
function paletteIntensite(intensite: Intensite): {
  fond: string;
  bord: string;
  encre: string;
} {
  switch (intensite) {
    case 1:
      return { fond: 'linear-gradient(135deg, #2a2a33, #1a1a22)', bord: '#8b8b9e', encre: '#b9b9c9' };
    case 2:
      return { fond: 'linear-gradient(135deg, #2b2c38, #1b1b26)', bord: '#7d8aa6', encre: '#a9b6cf' };
    case 3:
      return { fond: 'linear-gradient(135deg, #2e2a36, #1d1a26)', bord: '#8a7d9e', encre: '#c0a9cf' };
    case 4:
      return { fond: 'linear-gradient(135deg, #332a30, #221a1f)', bord: '#9e7d8a', encre: '#cfa9b6' };
    default:
      return { fond: 'linear-gradient(135deg, #38262b, #26181c)', bord: '#9e5a6a', encre: '#e0a0ae' };
  }
}

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

  // Le livre (RLS : autrui → rien) et TOUTES les fiches (pour les
  // rappels de rayonnage).
  const [livreLigne, ambiances] = await Promise.all([
    supabase
      .from('livres')
      .select('id, titre, auteur')
      .eq('id', id)
      .maybeSingle(),
    chargerAmbiances(supabase),
  ]);

  const livre = livreLigne.data as unknown as { id: string; titre: string; auteur: string | null } | null;
  const fiche = ambiances.get(id);
  if (!livre || !fiche) notFound();

  const palette = paletteIntensite(fiche.intensite);

  // Autres livres partageant au moins un genre (dans VOTRE bibliothèque).
  const rappels: Array<{ id: string; titre: string; partages: string[] }> = [];
  for (const autre of ambiances.values()) {
    if (autre.livre_id === id) continue;
    const partages = autre.genres.filter((g) => fiche.genres.includes(g));
    if (partages.length === 0) continue;
    const { data: autreLivre } = await supabase
      .from('livres')
      .select('titre')
      .eq('id', autre.livre_id)
      .maybeSingle();
    if (autreLivre) {
      rappels.push({
        id: autre.livre_id,
        titre: (autreLivre as { titre: string }).titre,
        partages,
      });
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

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/ambiance" className="hover:text-grenat-300">
              Ambiance
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">{livre.titre}</h1>
          {livre.auteur && <p className="text-encre-500 text-sm mt-1">{livre.auteur}</p>}
          <div className="liseret mt-3" />
        </header>

        {/* Atmosphère */}
        <section
          className="p-6 rounded-2xl border"
          style={{ background: palette.fond, borderColor: `${palette.bord}66` }}
          aria-labelledby="titre-atmosphere"
        >
          <h2 id="titre-atmosphere" className="sur-titre" style={{ color: palette.encre }}>
            Atmosphère
          </h2>
          <p className="mt-2 text-sm" style={{ color: palette.encre }}>
            Intensité {fiche.intensite} sur 5 — {libelleIntensite(fiche.intensite as Intensite)}
          </p>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="h-2.5 w-10 rounded-full"
                style={{
                  background: n <= fiche.intensite ? palette.bord : 'rgba(255,255,255,.08)',
                }}
              />
            ))}
          </div>
          {fiche.genres.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: palette.encre }}>
                Genres
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fiche.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/genres/${encodeURIComponent(g.toLowerCase())}`}
                    className="rounded-full border px-2.5 py-0.5 text-xs hover:opacity-80"
                    style={{ borderColor: `${palette.bord}99`, color: palette.encre }}
                  >
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {fiche.tropes.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: palette.encre }}>
                Tropes
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fiche.tropes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border px-2.5 py-0.5 text-xs"
                    style={{ borderColor: `${palette.bord}55`, color: palette.encre }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Link href={`/livres/${livre.id}`} className="bouton-principal !min-h-10 cursor-pointer">
            Ouvrir le livre
          </Link>
          <Link href="/ambiance" className="bouton-fantome !min-h-10 cursor-pointer">
            Modifier la fiche
          </Link>
        </div>

        {/* Rappels de rayonnage */}
        {rappels.length > 0 && (
          <section aria-labelledby="titre-rappels">
            <h2 id="titre-rappels" className="sur-titre text-encre-300">
              Sur le même rayonnage
            </h2>
            <p className="text-xs text-encre-500 mt-1">
              Vos autres livres qui partagent au moins un genre avec celle-ci.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {rappels.map((r) => (
                <li key={r.id} className="rounded-xl border border-nuit-700/70 px-4 py-3">
                  <Link href={`/ambiance/${r.id}`} className="text-sm text-encre-200 hover:text-grenat-300">
                    {r.titre}
                  </Link>
                  <p className="text-[11px] text-encre-500 mt-0.5">
                    {r.partages.join(' · ')}
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
