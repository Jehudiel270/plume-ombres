import Link from 'next/link';
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

  // Chapitres en erreur (C5) : un seul aller-retour, restreint aux livres
  // de l'utilisateur (RLS), puis comptage en mémoire. On ne remonte au
  // client que le nombre par livre — jamais le texte des chapitres.
  const idsLivres = (livres ?? []).map((l) => l.id);
  const { data: chapitresEnErreur } = idsLivres.length
    ? await supabase
        .from('chapitres')
        .select('livre_id')
        .eq('statut', 'erreur')
        .in('livre_id', idsLivres)
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
          <h1 className="font-display text-3xl text-encre-100">
            Ma bibliothèque
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Vos romances t’attendent dans l’ombre. Importez, traduisez,
            savourez.
          </p>

          {/* Raccourcis d'espace : les pages favoris et compte ne sont pas
              dans la barre de navigation (garde-fou de périmètre). */}
          <nav
            aria-label="Raccourcis de mon espace"
            className="flex flex-wrap items-center gap-2 mt-4"
          >
            <Link href="/favoris" className="bouton-fantome !px-3 !py-1.5 text-xs">
              ★ Mes favoris
            </Link>
            <Link href="/compte" className="bouton-fantome !px-3 !py-1.5 text-xs">
              Mon compte
            </Link>
          </nav>
        </div>
        <BibliothequeClient
          livresInitiaux={(livres ?? []) as Livre[]}
          chapitresEnErreur={comptesErreur}
        />
      </main>
    </>
  );
}
