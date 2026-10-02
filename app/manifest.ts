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
    // Non bloquant : aucune orientation forcée — un lecteur peut tourner
    // son appareil (le viewport n'est jamais verrouillé).
    orientation: 'any',
    // Mêmes couleurs que le viewport (app/layout.tsx) et que le fond réel
    // de la palette par défaut (nuit-950 = #0a0608) : plus d'écart
    // manifest ↔ viewport (relevé à l'audit, tâche C9).
    background_color: '#0a0608',
    theme_color: '#0a0608',
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