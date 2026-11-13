// ============================================================
// app/defis/page.tsx — Défis de lecture (F14).
//
// Objectifs PERSONNELS, non manipulateurs : la progression sort des
// compteurs réels du compte (chapitres découverts, livres traduits,
// jours de lecture), jamais saisie à la main. Une échéance passée
// n'enlève rien : le défi reste visible, « au repos ».
//
// GARDE SERVEUR : interrupteur `defis` évalué ICI — module fermé ou
// plan insuffisant → 404. Les données viennent du compte (RLS).
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { joursDistincts, type CompteursLecture, type Defi } from '@/lib/defis';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauDefis from '@/components/defis/PanneauDefis';

export const metadata = prive('Défis de lecture');

export const dynamic = 'force-dynamic';

export default async function PageDefis() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('defis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Compteurs RÉELS du compte : XP posée (chaque ligne = un chapitre
  // découvert, avec sa date) et livres entièrement traduits.
  const [xpLignes, livresTraduits] = await Promise.all([
    supabase
      .from('lectures_xp')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('livres')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'traduit'),
  ]);

  const horodatages = (xpLignes.data ?? []).map(
    (l) => (l as { created_at: string }).created_at
  );
  const compteurs: CompteursLecture = {
    chapitres: horodatages.length,
    livres: livresTraduits.count ?? 0,
    jours: joursDistincts(horodatages),
  };

  // Défis posés (RLS « own »).
  const { data: lignesDefis } = await supabase
    .from('defis')
    .select('id, titre, genre, cible, livre_id, echeance, termine_le, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  const defis: Defi[] = (lignesDefis ?? []).map((d) => {
    const ligne = d as Record<string, unknown>;
    return {
      id: String(ligne.id),
      titre: String(ligne.titre),
      genre: ligne.genre === 'livres' || ligne.genre === 'jours' ? ligne.genre : 'chapitres',
      cible: Number(ligne.cible) || 1,
      livreId: typeof ligne.livre_id === 'string' ? ligne.livre_id : null,
      echeance: typeof ligne.echeance === 'string' ? ligne.echeance : null,
      termineLe: typeof ligne.termine_le === 'string' ? ligne.termine_le : null,
      creeLe: String(ligne.created_at ?? ''),
    };
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
          <p className="sur-titre text-grenat-400">Défis de lecture</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Vos objectifs, à votre rythme
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Des objectifs d’atelier, jamais manipulateurs : la progression se
            calcule toute seule à partir de vos lectures réelles, rien ne
            baisse jamais, et une échéance dépassée ne retire rien — le défi
            reste là, au repos, sans reproche.
          </p>
        </header>

        <PanneauDefis defis={defis} compteurs={compteurs} />
      </main>
    </>
  );
}
