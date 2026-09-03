import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Lora } from 'next/font/google';
import './globals.css';

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
};

export const viewport: Viewport = {
  themeColor: '#0b0709',
};

export default function RacineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${playfair.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
