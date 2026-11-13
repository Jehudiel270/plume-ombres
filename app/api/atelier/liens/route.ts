// ============================================================
// app/api/atelier/liens/route.ts — Portes d'entrée GLOBALES des
// modules ouverts du lecteur.
//
// Correctif « pages manquantes » : un module activé au tableau de
// bord doit être TROUVABLE partout, pas seulement dans la fiche
// d'un livre. La barre de navigation interroge cette route (une
// fois par session) et affiche l'entrée « Atelier ».
//
// Le SERVEUR est l'autorité : chaque lien n'est renvoyé que si
// l'interrupteur du module est ouvert pour CE compte (module fermé
// → absent de la réponse, comme si la page n'existait pas). La
// route ne renvoie AUCUN contenu de lecture — des liens, rien de plus.
// ============================================================

import { NextResponse } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Modules à PAGE GLOBALE (le graphe narratif est par livre : il
 *  reste lié depuis la fiche du livre). */
const PAGES_ATIELIER: Array<{
  cle: string;
  href: string;
  libelle: string;
  detail: string;
}> = [
  {
    cle: 'carnet',
    href: '/carnet',
    libelle: 'Carnet de lecture',
    detail: 'Notes, citations et surlignages de vos lectures',
  },
  {
    cle: 'theories',
    href: '/theories',
    libelle: 'Théories & comparateur',
    detail: 'Hypothèses privées et vérification des traductions',
  },
  {
    cle: 'progression',
    href: '/progression',
    libelle: 'Progression',
    detail: 'XP, rangs et badges de lecture',
  },
  {
    cle: 'ambiance',
    href: '/ambiance',
    libelle: 'Ambiance',
    detail: 'Genres, tropes et atmosphère de vos livres',
  },
  {
    cle: 'glossaire',
    href: '/glossaire',
    libelle: 'Glossaire',
    detail: 'Noms propres et lexique de vos livres',
  },
  {
    cle: 'univers',
    href: '/univers',
    libelle: 'Univers',
    detail: 'Sagas, ordre des tomes, anti-spoilers par tome',
  },
  {
    cle: 'cartes',
    href: '/cartes',
    libelle: 'Cartes de lecture',
    detail: 'Visuels de citation, extraits bornés et attribués',
  },
  {
    cle: 'defis',
    href: '/defis',
    libelle: 'Défis de lecture',
    detail: 'Objectifs personnels, progression calculée, rien de punitif',
  },
  {
    cle: 'clubs',
    href: '/clubs',
    libelle: 'Clubs de lecture',
    detail: 'Cercles privés entre inscrits, anti-spoilers par chapitre',
  },
  {
    cle: 'collections',
    href: '/collections',
    libelle: 'Collections',
    detail: 'Vos listes privées : à relire, série du moment…',
  },
  {
    cle: 'calendrier',
    href: '/calendrier',
    libelle: 'Calendrier de lecture',
    detail: 'Vos chapitres découverts par jour, votre série, vos échéances',
  },
  {
    cle: 'catalogue_public',
    href: '/catalogue',
    libelle: 'Catalogue',
    detail: 'Votre bibliothèque présentée comme une librairie, filtrable',
  },
];

export async function GET(): Promise<NextResponse> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const codePlan = planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT;

  const verdicts = await Promise.all(
    PAGES_ATIELIER.map((page) =>
      verifierAccesModule(page.cle, {
        utilisateurId: utilisateur.id,
        codePlan,
      })
        .then((m) => ({ page, ouvert: m.ouvert }))
        .catch(() => ({ page, ouvert: false }))
    )
  );

  const liens = verdicts
    .filter((v) => v.ouvert)
    .map((v) => v.page);

  return NextResponse.json(
    { liens },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
