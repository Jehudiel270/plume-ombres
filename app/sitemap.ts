import type { MetadataRoute } from 'next';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://plumedombres.kodelyza.com').replace(
  /\/$/,
  ''
);

// Uniquement les pages réellement publiques : les espaces personnels
// sont protégés par le proxy et n'ont rien à faire dans un index.
const PAGES: Array<{ chemin: string; priorite: number; frequence: 'daily' | 'weekly' | 'monthly' | 'yearly' }> = [
  { chemin: '', priorite: 1, frequence: 'weekly' },
  { chemin: '/tarifs', priorite: 0.9, frequence: 'weekly' },
  { chemin: '/faq', priorite: 0.7, frequence: 'monthly' },
  { chemin: '/contact', priorite: 0.6, frequence: 'monthly' },
  { chemin: '/conditions', priorite: 0.4, frequence: 'yearly' },
  { chemin: '/confidentialite', priorite: 0.4, frequence: 'yearly' },
  { chemin: '/cookies', priorite: 0.3, frequence: 'yearly' },
  { chemin: '/mentions-legales', priorite: 0.3, frequence: 'yearly' },
  { chemin: '/remboursement', priorite: 0.3, frequence: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return PAGES.map((page) => ({
    url: `${BASE}${page.chemin}`,
    lastModified: maintenant,
    changeFrequency: page.frequence,
    priority: page.priorite,
  }));
}
