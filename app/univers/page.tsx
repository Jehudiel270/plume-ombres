// ============================================================
// app/univers/page.tsx — Univers multi-tomes (F17, Illimité).
//
// GARDE SERVEUR : interrupteur `univers` évalué ICI — module fermé
// OU plan < Illimité → 404. Sagas PRIVÉES : listées, créées, liées
// aux livres du compte (RLS « own »).
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauUnivers from '@/components/univers/PanneauUnivers';

export const metadata = prive('Univers');

export const dynamic = 'force-dynamic';

export interface UniversListe {
  id: string;
  titre: string;
  description: string | null;
  tomes: Array<{ livreId: string; titre: string; position: number }>;
}

export default async function PageUnivers() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé OU plan insuffisant → 404.
  const module = await verifierAccesModule('univers', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  // Univers du compte + tomes + livres disponibles (RLS « own »).
  const [universBruts, livresBruts] = await Promise.all([
    supabase
      .from('univers')
      .select('id, titre, description')
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase.from('livres').select('id, titre').order('updated_at', { ascending: false }).limit(100),
  ]);
  const universListe = (universBruts.data ?? []) as Array<{
    id: string;
    titre: string;
    description: string | null;
  }>;

  const { data: tomesBruts } = await supabase
    .from('univers_livres')
    .select('univers_id, livre_id, position')
    .order('position', { ascending: true })
    .limit(500);
  const titresLivres = new Map(
    ((livresBruts.data ?? []) as Array<{ id: string; titre: string }>).map((l) => [l.id, l.titre])
  );

  const univers: UniversListe[] = universListe.map((u) => ({
    id: u.id,
    titre: u.titre,
    description: u.description,
    tomes: ((tomesBruts ?? []) as Array<{
      univers_id: string;
      livre_id: string;
      position: number;
    }>)
      .filter((t) => t.univers_id === u.id)
      .map((t) => ({
        livreId: t.livre_id,
        titre: titresLivres.get(t.livre_id) ?? 'Livre retiré',
        position: t.position,
      }))
      .sort((a, b) => a.position - b.position),
  }));

  const livresDisponibles = ((livresBruts.data ?? []) as Array<{ id: string; titre: string }>).map(
    (l) => ({ id: l.id, titre: l.titre })
  );

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
          <p className="sur-titre text-grenat-400">Sagas</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Univers</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Regroupez vos tomes en sagas, dans l’ordre de lecture. Chaque
            univers reste dans votre atelier.
          </p>
        </header>

        <PanneauUnivers univers={univers} livresDisponibles={livresDisponibles} />
        <p className="text-[11px] text-encre-500">
          Le détail d’un tome s’ouvre depuis sa fiche (via le{' '}
          <Link href="/bibliotheque" className="underline hover:text-encre-300">
            livre
          </Link>
          ) — l’ordre des tomes reste visible ici, sans divulgation de contenu.
        </p>
      </main>
    </>
  );
}
