// ============================================================
// app/clubs/page.tsx — Clubs de lecture PRIVÉS (F11).
//
// Décision de l'administrateur (12/11/2026) : clubs PRIVÉS entre
// comptes inscrits — rejoint par code d'invitation, aucune page
// publique, aucun texte de chapitre partagé. Chaque salon applique
// un plafond anti-spoilers CÔTÉ SERVEUR (n° de chapitre maximal,
// masqué au-delà de la position de lecture déclarée).
//
// GARDE SERVEUR : interrupteur `clubs` évalué ICI — fermé → 404.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauClubs from '@/components/clubs/PanneauClubs';

export const metadata = prive('Clubs de lecture');

export const dynamic = 'force-dynamic';

export default async function PageClubs() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('clubs', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Mes clubs (RLS « own » sur les adhésions).
  const { data: adhesions } = await supabase
    .from('clubs_membres')
    .select(
      'position_lecture, clubs ( id, titre, description, code_invitation, createur_id, livres ( titre ) )'
    )
    .eq('utilisateur_id', utilisateur.id)
    .order('rejoins_le', { ascending: true })
    .limit(20);

  type Ligne = {
    position_lecture: number;
    clubs: {
      id: string;
      titre: string;
      description: string | null;
      code_invitation: string;
      createur_id: string;
      livres: { titre: string } | null;
    } | null;
  };

  const clubs = ((adhesions ?? []) as unknown as Ligne[])
    .filter((l) => l.clubs)
    .map((l) => ({
      id: l.clubs!.id,
      titre: l.clubs!.titre,
      description: l.clubs!.description,
      codeInvitation: l.clubs!.code_invitation,
      estCreateur: l.clubs!.createur_id === utilisateur.id,
      livreTitre: l.clubs!.livres?.titre ?? null,
      positionLecture: l.position_lecture,
    }));

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
          <p className="sur-titre text-grenat-400">Clubs de lecture</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Petits cercles privés
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Des cercles PRIVÉS entre comptes inscrits : on entre avec un code
            d’invitation, jamais par une page publique. Aucun texte de chapitre
            n’y circule — seulement vos propos, et tout message lié à
            l’intrigue reste invisible pour qui n’a pas encore lu ce chapitre.
          </p>
        </header>

        <PanneauClubs clubs={clubs} />

        <p className="text-xs text-encre-500">
          Un club n’apparaît nulle part en public. Le code d’invitation se
          partage de main à main ; vous pouvez quitter un cercle à tout moment
          depuis son salon.
        </p>
      </main>
    </>
  );
}
