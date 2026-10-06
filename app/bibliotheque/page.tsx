import Link from 'next/link';
import { redirect } from 'next/navigation';
import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import BarreNavigation from '@/components/BarreNavigation';
import BibliothequeClient from '@/components/BibliothequeClient';
import type { Livre, Segment, StatutChapitre } from '@/lib/types';
import { chapitreEntierementTraduit } from '@/lib/types';

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

  // Chapitres à reprendre (C5 / P1.3) : un seul aller-retour sur les
  // chapitres (RLS), puis comptage en mémoire. On ne remonte au client
  // que le NOMBRE par livre — jamais le texte des chapitres.
  const idsLivres = (livres ?? []).map((l) => l.id);
  const { data: chapitres } = idsLivres.length
    ? await supabase
        .from('chapitres')
        .select('id, livre_id, statut')
        .in('livre_id', idsLivres)
    : { data: [] as { id: string; livre_id: string; statut: StatutChapitre }[] };

  const chapitresListe = (chapitres ?? []) as {
    id: string;
    livre_id: string;
    statut: StatutChapitre;
  }[];

  // Chapitre → livre : pour rapporter un défaut au bon livre.
  const livreDuChapitre = new Map<string, string>();
  const enDefaut = new Set<string>();
  const comptesErreur: Record<string, number> = {};

  // 1) Chapitres en erreur : statut posé par le moteur, lui-même adossé à
  //    `chapitreEntierementTraduit()` — aucune règle de complétude locale.
  for (const c of chapitresListe) {
    livreDuChapitre.set(c.id, c.livre_id);
    if (c.statut === 'erreur') {
      enDefaut.add(c.id);
      comptesErreur[c.livre_id] = (comptesErreur[c.livre_id] ?? 0) + 1;
    }
  }

  // 2) Chapitres marqués « traduit » alors qu'ils gardent un trou : on ne
  //    remonte QUE les segments en défaut (statut ≠ 'fait'), donc la
  //    requête reste bornée — jamais tout le livre. `chapitreEntierementTraduit()`
  //    (lib/types.ts) tranche la complétude : une seule règle, partagée.
  const idsTraduits = chapitresListe
    .filter((c) => c.statut === 'traduit' && !enDefaut.has(c.id))
    .map((c) => c.id);

  if (idsTraduits.length > 0) {
    const { data: segmentsEnDefaut } = await supabase
      .from('segments')
      .select('*')
      .in('chapitre_id', idsTraduits)
      .neq('statut', 'fait');

    const parChapitre = new Map<string, Segment[]>();
    for (const segment of (segmentsEnDefaut ?? []) as Segment[]) {
      const liste = parChapitre.get(segment.chapitre_id) ?? [];
      liste.push(segment);
      parChapitre.set(segment.chapitre_id, liste);
    }

    // Un chapitre sans segment en défaut n'apparaît pas ici : il est dit
    // complet (c'est le cas normal). Dès qu'un segment ne l'est pas,
    // `chapitreEntierementTraduit()` le déclare incomplet.
    for (const [chapitreId, segments] of parChapitre) {
      if (chapitreEntierementTraduit(segments)) continue;
      const livreId = livreDuChapitre.get(chapitreId);
      if (livreId) comptesErreur[livreId] = (comptesErreur[livreId] ?? 0) + 1;
    }
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
