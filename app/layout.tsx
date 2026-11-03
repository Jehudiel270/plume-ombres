import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CLASSES_POLICES } from '@/lib/polices';
import { SCRIPT_THEME } from '@/lib/theme';
import ProviderTheme from '@/components/ProviderTheme';
import FondAmbiance from '@/components/FondAmbiance';
import PanneauApparence from '@/components/PanneauApparence';
import BanniereAnnonce from '@/components/BanniereAnnonce';
import PWA from '@/components/PWA';
import SuiviVisites from '@/components/SuiviVisites';

export const metadata: Metadata = {
  title: {
    default: 'Plume d’Ombres — Traduction littéraire',
    template: '%s · Plume d’Ombres',
  },
  description:
    'Studio personnel de traduction littéraire pour la dark romance : import, découpage, traduction et réassemblage fidèle de vos textes.',
  // PWA — icône plein écran iOS (« Ajouter à l'écran d'accueil »)
  // et signal de nature d'application mobile.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Plume d’Ombres',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        url: '/icon-masque.png',
        sizes: '512x512',
        type: 'image/png',
        // Zone sûre 80 % : Android l'encadre sans la rogner.
        // (les métadonnées `purpose` hors schéma Next sont ignorées,
        // la variante maskable vit dans le manifest.)
      },
    ],
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  // Identique à `theme_color` du manifest (app/manifest.ts) et au fond
  // réel de la palette par défaut : nuit-950 = #0a0608.
  themeColor: '#0a0608',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RacineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning : le script anti-FOUC ci-dessous pose
    // data-palette / data-typo / --typo-* sur <html> AVANT l'hydratation.
    <html lang="fr" className={CLASSES_POLICES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
      </head>
      <body>
        <ProviderTheme>
          {/* Bandeau d'annonce (nouvelle adresse) — INERTE tant qu'il
              n'est pas activé dans lib/annonce.ts. Monté ici, dans le
              layout racine, il apparaît sur absolument toutes les pages. */}
          <BanniereAnnonce />
          {children}
          <FondAmbiance />
          {/* Apparence du site (palette + typographie) : le bouton
              flottant vit ici, donc il est présent sur TOUTES les pages —
              et le panneau s'ouvre aussi depuis un menu via l'événement
              plume:ouvrir-apparence. */}
          <PanneauApparence />
        </ProviderTheme>
        <PWA />
        {/* Mesure d'audience anonyme (aucun cookie) : une balise, un POST
            par page vue, rien sur l'identité du visiteur. */}
        <SuiviVisites />
      </body>
    </html>
  );
}
