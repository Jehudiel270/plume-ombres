import type { Metadata } from 'next';

// ============================================================
// lib/metadata.ts — Métadonnées partagées.
//
// Les pages derrière la connexion ne doivent jamais être indexées :
// ni par Google, ni par les aperçus de lien. `robots.txt` les exclut
// déjà, mais un robots.txt n'empêche pas l'indexation d'une URL
// connue (lien partagé, pub, historique) : la balise `noindex` est
// la seule consigne opposable au robot.
// ============================================================

/** Métadonnées d'une page privée : titre simple, aucune indexation. */
export function prive(titre: string): Metadata {
  return {
    title: titre,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/** Métadonnées d'une page publique : URL canonique + partage social. */
export function public_(
  titre: string,
  description: string,
  chemin: string
): Metadata {
  const url = chemin.startsWith('/') ? chemin : `/${chemin}`;
  return {
    title: titre,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: 'Plume d’Ombres',
      title: `${titre} · Plume d’Ombres`,
      description,
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${titre} · Plume d’Ombres`,
      description,
    },
  };
}
