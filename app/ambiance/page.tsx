// ============================================================
// app/ambiance/page.tsx — Fiches d'ambiance enrichies (F5).
//
// GARDE SERVEUR : interrupteur `ambiance` évalué ICI — module fermé
// → 404. Complète les avertissements de contenu existants (socle) :
// genres, tropes, intensité, posés par le propriétaire du livre.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  INTENSITES,
  chargerAmbiances,
  libelleIntensite,
} from '@/lib/ambiance';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import FicheLivreAmbiance from '@/components/ambiance/FicheLivreAmbiance';

export const metadata = prive('Fiches d’ambiance');

export const dynamic = 'force-dynamic';

export default async function PageAmbiance() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('ambiance', {
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

  // Fiches existantes.
  const fiches = await chargerAmbiances(supabase).catch(() => new Map());

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
          <p className="sur-titre text-grenat-400">Atelier</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Ambiance</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Genres, tropes et intensité, livre par livre — pour se souvenir du
            ton d’une œuvre avant de la reprendre. Complète les avertissements
            de contenu, ne les remplace pas.
          </p>
        </header>

        {livres.length === 0 ? (
          <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
            Importez d’abord un livre : la fiche d’ambiance accompagne vos
            œuvres.
          </p>
        ) : (
          <ul className="space-y-5">
            {livres.map((l) => (
              <FicheLivreAmbiance
                key={l.id}
                livre={l}
                genresInitiaux={fiches.get(l.id)?.genres ?? []}
                tropesInitiaux={fiches.get(l.id)?.tropes ?? []}
                intensiteInitiale={fiches.get(l.id)?.intensite ?? 3}
                intensites={[...INTENSITES]}
                libelleIntensite={libelleIntensite}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
