// ============================================================
// app/annonces/page.tsx — Journal des nouveautés (A21).
//
// Le compte rendu HONNÊTE de ce qui change sur la plateforme : les
// modules du chantier livrés, un par un, avec leur date. Aucune
// promesse hors périmètre, aucune mention de contenu traduit « par
// la plateforme » (l'atelier traduit pour le lecteur, chez lui).
// Page du SOCLE (maquette) : pas d'interrupteur, session ouverte.
// ============================================================

import {
  utilisateurConnecte,
  creerClientServeur,
} from '@/lib/supabase/server';

import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Nouveautés');

export const dynamic = 'force-dynamic';

interface Entree {
  date: string;
  titre: string;
  detail: string;
  etat: 'livre' | 'prepare';
}

const ENTREES: readonly Entree[] = [
  {
    date: '14 novembre 2026',
    titre: 'Le site reçoit ce que vous partagez',
    detail:
      'Depuis une application de votre téléphone, le menu « Partager » propose maintenant Plume d’Ombres : le passage, le lien ou le message arrive sur la page Partager, et vous décidez — le garder comme note ou comme citation (plafonnée à 40 mots) dans votre carnet, ou copier le lien pour l’import d’un fichier. Rien n’est enregistré sans votre confirmation.',
    etat: 'livre',
  },
  {
    date: '14 novembre 2026',
    titre: 'Le lecteur se porte à la main',
    detail:
      'Les outils de lecture tiennent dans un seul bouton, en bas à droite, qui déploie les commandes en arc de cercle : bilingue, écoute, carnet, résumé, questions, recherche, réglages, défilement et plein écran. La lecture à voix haute garde ses commandes pause et arrêt visibles pendant tout le défilement.',
    etat: 'livre',
  },
  {
    date: '14 novembre 2026',
    titre: 'Des pages pour chaque module ouvert',
    detail:
      'Défis, collections, clubs privés, calendrier de lecture, catalogue et genres : chaque interrupteur du tableau de bord mène désormais à une page réelle, construite sur vos données. Les modules restent fermés par défaut — les ouvrir est votre décision.',
    etat: 'livre',
  },
  {
    date: '14 novembre 2026',
    titre: 'Clubs privés : le salon',
    detail:
      'Un club se crée ou se rejoint avec un code de huit caractères. Le salon filtre les messages côté serveur selon la position de lecture de chacun : rien au-delà du chapitre lu, jamais.',
    etat: 'livre',
  },
  {
    date: '13 novembre 2026',
    titre: 'Portes d’entrée des modules',
    detail:
      'Un menu Atelier dans la navigation, un bandeau sur chaque livre : les modules ouverts sont annoncés là où vous vous trouvez, avec le livre déjà présélectionné quand la page l’accepte.',
    etat: 'livre',
  },
  {
    date: '13 novembre 2026',
    titre: 'Lecteur porté de la maquette',
    detail:
      'Sélection colorée en cinq encres, notes en place, surlignages rendus dans le texte et rouverts d’un clic, recherche fusionnée avec vos surlignages.',
    etat: 'livre',
  },
  {
    date: '12 novembre 2026',
    titre: 'Tableau de bord : interrupteurs et sections',
    detail:
      'Chaque module a son interrupteur, son plan minimal, son déploiement progressif et son journal. Les sections délégables aux administrateurs ont été élargies.',
    etat: 'livre',
  },
  {
    date: 'À venir',
    titre: 'Prochaines étapes du chantier',
    detail:
      'Réglages d’accessibilité et d’application regroupés, profil enrichi, partage en un geste, et la fiche d’ambiance encore plus descriptive. Le chantier continue, par petites étapes vérifiées.',
    etat: 'prepare',
  },
];

export default async function PageAnnonces() {
  const utilisateur = await utilisateurConnecte();
  const supabase = utilisateur ? await creerClientServeur() : null;
  let pseudo = '';
  let email = '';
  if (utilisateur && supabase) {
    email = utilisateur.email ?? '';
    const { data } = await supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', utilisateur.id)
      .maybeSingle();
    pseudo =
      (data as { pseudo?: string } | null)?.pseudo ||
      (email.split('@')[0] ?? 'Lecteur');
  }

  return (
    <>
      <BarreNavigation email={email} pseudo={pseudo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Nouveautés</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Le journal du chantier
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Ce qui change, quand ça change, pourquoi. Rien d’autre.
          </p>
        </header>

        <ol className="space-y-4">
          {ENTREES.map((e) => (
            <li key={e.titre} className="velours p-5 rounded-2xl">
              <div className="flex items-baseline gap-2">
                <p className="text-xs uppercase tracking-wider text-encre-500">
                  {e.date}
                </p>
                {e.etat === 'prepare' && (
                  <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[10px] text-encre-500">
                    En préparation
                  </span>
                )}
              </div>
              <h2 className="font-display text-lg text-encre-100 mt-1">{e.titre}</h2>
              <p className="mt-1.5 text-sm text-encre-400">{e.detail}</p>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
