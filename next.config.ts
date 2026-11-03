import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// ------------------------------------------------------------
// Turbopack refuse de résoudre un `node_modules` situé HORS de la racine
// du projet. C'est exactement notre cas : les worktrees git partagent un
// seul `node_modules` (jonction NTFS vers `dark-romance-integration/`),
// situé dans le dossier PARENT du projet.
//
// La documentation Next prescrit alors `turbopack.root` = dossier parent
// du projet ET des dépendances liées. On ne l'active QUE si ce dossier
// parent contient réellement le node_modules partagé : en production
// (Vercel), la condition est fausse et la configuration reste celle par
// défaut.
const dossierParent = path.resolve(process.cwd(), '..');
const racinePartagee = existsSync(
  path.join(dossierParent, 'dark-romance-integration', 'node_modules')
)
  ? dossierParent
  : null;

// ------------------------------------------------------------
// Politique de sécurité du contenu (CSP).
//
// Choix assumés :
// - `script-src 'unsafe-inline'` : Next injecte son amorçage de page en
//   ligne (données RSC). Sans nonce par requête (impossible en statique
//   sans middleware), c'est le compromis standard. Tout le reste du
//   périmètre est verrouillé : aucun script distant n'est autorisé.
// - `'unsafe-eval'` uniquement en développement (React Refresh / Turbopack).
// - `connect-src` limité à notre origine et à Supabase (REST + realtime WSS).
//   L'API FedaPay n'est JAMAIS appelée depuis le navigateur : la clé
//   secrète reste côté serveur, donc pas d'origine api.fedapay.com ici.
// - `frame-ancestors 'none'` : le site ne peut pas être encadré (anti
//   clickjacking), doublé de X-Frame-Options pour les vieux navigateurs.
const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self' https://*.fedapay.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.fedapay.com",
  'upgrade-insecure-requests',
].join('; ');

const entetesSecurite = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Le site n'est servi qu'en HTTPS (Vercel). On ordonne au navigateur de
  // refuser toute connexion non chiffrée pendant un an, sous-domaines inclus.
  // Pas de `preload` : l'inscription dans les listes des navigateurs est une
  // décision d'exploitation, réversible difficilement.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  // Ne plus annoncer la pile technique dans les réponses HTTP.
  poweredByHeader: false,
  ...(racinePartagee ? { turbopack: { root: racinePartagee } } : {}),
  async headers() {
    return [
      { source: '/:path*', headers: entetesSecurite },
      // Les fichiers du dossier public peuvent être mis en cache longtemps :
      // leur nom ne change pas, mais ils ne doivent jamais être exécutés.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
