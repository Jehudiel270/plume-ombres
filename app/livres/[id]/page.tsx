import { notFound, redirect } from 'next/navigation';
import {
  utilisateurConnecte,
  creerClientServeur,
} from '@/lib/supabase/server';
import EspaceLivre from '@/components/EspaceLivre';
import AvertissementsLivre from '@/components/AvertissementsLivre';
import BarreNavigation from '@/components/BarreNavigation';
import {
  cleRepere,
  detecterReperes,
  type Avertissement,
  type Chapitre,
  type ClassificationAge,
  type Livre,
  type PropositionRepere,
} from '@/lib/types';

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

  // texte_source est nécessaire pour estimer le temps de lecture —
  // on le compte côté serveur puis on le RETIRE avant de passer les
  // chapitres au client (payload SSR mince).
  const { data: chapitres } = await supabase
    .from('chapitres')
    .select('id, position, titre, statut, texte_source')
    .eq('livre_id', id)
    .order('position', { ascending: true });

  const totalCaracteres = (chapitres ?? []).reduce(
    (somme, c) =>
      somme + ((c as { texte_source?: string }).texte_source?.length ?? 0),
    0
  );
  const chapitresLegers = (chapitres ?? []).map((chapitre) => {
    // texte_source ne sert qu'au comptage ci-dessus (payload SSR mince
    // côté client) : on l'écarte au passage.
    const { texte_source: _echappee, ...leger } = chapitre;
    void _echappee;
    return leger;
  });

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // ---------- Repères de contenu (avertissements / tropes) ----------
  // Requête tolérante : si la migration n'est pas encore appliquée, la
  // fiche reste utilisable (liste vide) au lieu de planter.
  const { data: avertissementsBruts } = await supabase
    .from('avertissements')
    .select('id, livre_id, categorie, libelle, spoiler, grave, origine, created_at')
    .eq('livre_id', id)
    .order('created_at', { ascending: true });
  const avertissements = (avertissementsBruts ?? []) as Avertissement[];

  const proprietaire = (livre as { proprietaire_id?: string }).proprietaire_id;
  const estProprietaire = proprietaire === utilisateur.id;
  const classification = ((livre as { classification_age?: ClassificationAge })
    .classification_age ?? 'non_classee') as ClassificationAge;

  // Propositions automatiques : détection par mots-clés sur le texte
  // source DÉJÀ en base. Jamais enregistrées sans validation explicite
  // (calculées uniquement pour le propriétaire).
  const corpus = (chapitres ?? [])
    .map((chapitre) => (chapitre as { texte_source?: string }).texte_source ?? '')
    .join('\n');
  const dejaPresents = new Set(avertissements.map((a) => cleRepere(a.libelle)));
  const propositions: PropositionRepere[] = estProprietaire
    ? detecterReperes(corpus).filter((p) => !dejaPresents.has(cleRepere(p.libelle)))
    : [];

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fondu-monte">
        <AvertissementsLivre
          livreId={id}
          titre={(livre as Livre).titre}
          classificationInitiale={classification}
          avertissementsInitiaux={avertissements}
          propositions={propositions}
          estProprietaire={estProprietaire}
        />
        <EspaceLivre
          livreInitial={livre as Livre}
          chapitresInitiaux={chapitresLegers as Chapitre[]}
          totalCaracteres={totalCaracteres}
        />
      </main>
    </>
  );
}
