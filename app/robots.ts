import type { MetadataRoute } from 'next';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://plumedombres.kodelyza.com').replace(
  /\/$/,
  ''
);

// Sans ce fichier, /robots.txt tombait dans la protection du proxy et
// répondait une redirection vers /connexion : les robots d'indexation
// (et les vérificateurs de Facebook/Google Ads) n'y voyaient rien.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/compte',
          '/bibliotheque',
          '/favoris',
          '/paiement',
          '/abonnement',
          '/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
