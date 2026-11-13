// ============================================================
// app/partager/page.tsx — Partager vers Plume d'Ombres (socle).
//
// Cible du partage système de l'application installée (PWA) :
// manifest.share_target pointe ici avec title / text / url. Depuis
// n'importe quelle application du téléphone, « Partager » offre
// Plume d'Ombres : le contenu arrive sur cette page, le lecteur
// décide — rien n'est enregistré sans sa confirmation.
//
// Deux destinations, fidèles à la maquette (zip plume-ombres-ui,
// pages/partager.vue + ShareImport.vue) :
//   * « Ajouter au carnet » : note ou citation (plafonnée à 40 mots)
//     rattachée à un livre du compte, envoyée à l'API du carnet (F2) ;
//   * « Importer une source » : le site traduit depuis des fichiers
//     (.txt / .md / .epub) importés dans la bibliothèque — pas de
//     faux formulaire de demande : le lien est copié et la route
//     d'import expliquée, honnêtement.
//
// Page du SOCLE : pas d'interrupteur, session ouverte (404 sinon).
// Les valeurs reçues sont bornées et traitées comme du texte brut.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauPartage from '@/components/partage/PanneauPartage';

export const metadata = prive('Partager vers Plume d\u2019Ombres');

export const dynamic = 'force-dynamic';

/** Bornes du contenu reçu (maquette : title 200, text 2000, url 500). */
const MAX_TITRE = 200;
const MAX_TEXTE = 2000;
const MAX_LIEN = 500;

function limite(valeur: unknown, max: number): string {
  if (Array.isArray(valeur)) valeur = valeur[0];
  return typeof valeur === 'string' ? valeur.slice(0, max) : '';
}

export default async function PagePartager({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const params = await searchParams;
  const titreRecu = limite(params.title, MAX_TITRE);
  const texteRecu = limite(params.text, MAX_TEXTE);
  let lienRecu = limite(params.url, MAX_LIEN);
  if (!lienRecu) {
    const trouve = texteRecu.match(/https?:\/\/[^\s]+/);
    if (trouve) lienRecu = trouve[0].slice(0, MAX_LIEN);
  }

  // Livres du compte (RLS « own »), du plus récemment modifié.
  const supabase = await creerClientServeur();
  const { data: livresBruts } = await supabase
    .from('livres')
    .select('id, titre')
    .order('updated_at', { ascending: false })
    .limit(100);
  const livres = (livresBruts ?? []) as { id: string; titre: string }[];

  // Identité affichée par la barre de navigation.
  const email = utilisateur.email ?? '';
  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (email.split('@')[0] ?? 'Lecteur');

  return (
    <>
      <BarreNavigation email={email} pseudo={pseudo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Partage</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Partager vers Plume d&rsquo;Ombres
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Un passage, un lien ou un message partagé depuis une autre application
            arrive ici : vous décidez de ce que vous en faites.
          </p>
        </header>

        <PanneauPartage
          titreRecu={titreRecu}
          texteRecu={texteRecu}
          lienRecu={lienRecu}
          livres={livres}
        />
      </main>
    </>
  );
}
