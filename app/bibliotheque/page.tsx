import { redirect } from 'next/navigation';
import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import BarreNavigation from '@/components/BarreNavigation';
import BibliothequeClient from '@/components/BibliothequeClient';
import type { Livre } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Bibliotheque() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion');

  const supabase = await creerClientServeur();

  const [{ data: livres }, { data: profil }] = await Promise.all([
    supabase
      .from('livres')
      .select('*')
      .eq('proprietaire_id', utilisateur.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', utilisateur.id)
      .maybeSingle(),
  ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <div>
          <h1 className="font-display text-3xl text-encre-100">
            Ma bibliothèque
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3">
            {pseudo}, tes romances t’attendent. Importe un livre, traduis-le,
            savoure-le.
          </p>
        </div>
        <BibliothequeClient livresInitiaux={(livres ?? []) as Livre[]} />
      </main>
    </>
  );
}
