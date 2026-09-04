import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Lora } from 'next/font/google';
import './globals.css';
import FondAmbiance from '@/components/FondAmbiance';
import PWA from '@/components/PWA';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});

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
  themeColor: '#0b0709',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RacineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${playfair.variable} ${lora.variable}`}>
      <body>
        {children}
        <FondAmbiance />
        <PWA />
      </body>
    </html>
  );
}
