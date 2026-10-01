// not-found.tsx (C7) — page 404 à la charte.
// Rendue dans le layout racine (fond d'ambiance conservé) et utilisée
// aussi bien par notFound() que pour une URL qui ne correspond à rien.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page introuvable',
  description: 'Cette page n’existe pas (ou plus) dans le studio Plume d’Ombres.',
};

export default function PageIntrouvable() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="velours w-full max-w-lg p-8 text-center animate-fondu-monte">
        <p className="text-4xl mb-4 opacity-80" aria-hidden>
          🌒
        </p>
        <p className="sur-titre text-grenat-400">Erreur 404</p>
        <h1 className="font-display text-3xl sm:text-4xl text-encre-100 mt-3">
          Cette page s’est évanouie dans la nuit.
        </h1>
        <div className="liseret mx-auto mt-4" />
        <p className="text-encre-500 text-sm mt-5 leading-relaxed">
          L’adresse demandée n’existe pas, a changé de nom, ou le livre
          auquel elle renvoie ne vous appartient plus (chaque compte ne voit
          que ses propres textes).
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
          <Link href="/bibliotheque" className="bouton-principal">
            Ma bibliothèque
          </Link>
          <Link href="/" className="bouton-fantome">
            Retour à l’accueil
          </Link>
        </div>

        <p className="text-encre-500/70 text-[11px] mt-6 italic">
          Besoin d’aide ? La page FAQ répond aux questions les plus courantes.
        </p>
        <Link
          href="/faq"
          className="lien-discret text-[11px] underline mt-1 inline-block"
        >
          Consulter la FAQ
        </Link>
      </div>
    </main>
  );
}
