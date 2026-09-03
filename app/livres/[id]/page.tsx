import { notFound, redirect } from 'next/navigation';
import {
  utilisateurConnecte,
  creerClientServeur,
} from '@/lib/supabase/server';
import EspaceLivre from '@/components/EspaceLivre';
import BarreNavigation from '@/components/BarreNavigation';
import type { Chapitre, Livre } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PageLivre({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion');

  const supabase = await creerClientServeur();

  // RLS : renvoie null si le livre n'appartient pas à l'utilisateur.
  const { data: livre } = await supabase
    .from('livres')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!livre) notFound();

  const { data: chapitres } = await supabase
    .from('chapitres')
    .select('id, position, titre, statut')
    .eq('livre_id', id)
    .order('position', { ascending: true });

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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fondu-monte">
        <EspaceLivre
          livreInitial={livre as Livre}
          chapitresInitiaux={(chapitres ?? []) as Chapitre[]}
        />
      </main>
    </>
  );
}
