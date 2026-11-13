// ============================================================
// app/carnet/page.tsx — Carnet de lecture (F2).
//
// Notes, citations et surlignages pris depuis le lecteur, gérés ici :
// filtres, annotation, suppression, export portable (F24).
//
// GARDE SERVEUR : interrupteur `carnet` évalué ICI
// (verifierAccesModule) — module fermé → 404, comme si la page
// n'existait pas. L'autorisation d'export (F24) est calculée côté
// serveur à partir du plan effectif, jamais côté client.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { niveauPlanDepuisCode, ORDRE_PLAN } from '@/lib/fonctionnalites/registre';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { listerCarnet } from '@/lib/carnet';
import type { EntreeCarnet } from '@/lib/carnet';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauCarnet from '@/components/carnet/PanneauCarnet';

export const metadata = prive('Carnet de lecture');

export const dynamic = 'force-dynamic';

export default async function PageCarnet({
  searchParams,
}: {
  searchParams: Promise<{ livre?: string }>;
}) {
  const { livre: paramLivre } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('carnet', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  // Livres du compte (RLS « own »), du plus récemment modifié.
  const { data: livresBruts } = await supabase
    .from('livres')
    .select('id, titre')
    .order('updated_at', { ascending: false })
    .limit(100);
  const livres = (livresBruts ?? []) as { id: string; titre: string }[];

  // Export F24 : réservé aux plans payants (décision côté serveur,
  // même hiérarchie que les interrupteurs : Passionné et au-delà).
  const niveau = niveauPlanDepuisCode(planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT);
  const exportAutorise = ORDRE_PLAN[niveau] >= ORDRE_PLAN.passionne;

  // Carnet du compte : tout, ou filtré par livre si le paramètre est
  // un livre du compte (RLS « own »).
  const livreId =
    paramLivre && livres.some((l) => l.id === paramLivre) ? paramLivre : null;
  const entrees: EntreeCarnet[] = await listerCarnet(supabase, {
    livreId,
  }).catch(() => []);

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
          <h1 className="font-display text-3xl text-encre-100 mt-2">Carnet</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Vos notes, citations et surlignages, pris pendant la lecture. Ils
            restent dans votre atelier — l’export portable n’emporte jamais le
            texte intégral de l’œuvre.
          </p>
        </header>

        <PanneauCarnet
          livres={livres}
          entrees={entrees}
          livreId={livreId}
          exportAutorise={exportAutorise}
        />
      </main>
    </>
  );
}
