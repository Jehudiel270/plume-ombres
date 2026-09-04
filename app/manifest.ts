// ============================================================
// manifest.ts — Web Manifest (PWA) — convention Next 16.
// Rend le site INSTALLABLE sur mobile (Android / iOS) :
// « Ajouter à l'écran d'accueil » → icône + standalone.
// Gratuit : aucune dépendance, servi par Vercel.
// ============================================================
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Plume d’Ombres — Traducteur de romans',
    short_name: 'Plume d’Ombres',
    description:
      'Traduction et lecture de romans sombres — import EPUB/PDF, lecture confortable, exports.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0a12',
    theme_color: '#16101f',
    lang: 'fr',
    categories: ['books', 'reading', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-masque.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}