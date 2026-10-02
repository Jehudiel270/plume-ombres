'use client';

// Barre de navigation des pages PUBLIQUES (landing, tarifs, FAQ, pages
// légales). Distincte de BarreNavigation (espace connecté).
// Volontairement sans session : la page publique reste statique et rien
// ne s'affiche avant le rendu. Le bouton « Entrer » pointe vers
// /bibliotheque, qui redirige de lui-même vers /connexion si besoin.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ouvrirApparence } from '@/lib/theme';

const LIENS: { href: string; libelle: string }[] = [
  { href: '/tarifs', libelle: 'Tarifs' },
  { href: '/faq', libelle: 'FAQ' },
  { href: '/contact', libelle: 'Contact' },
];

export default function NavPublique() {
  const chemin = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  function lien(l: { href: string; libelle: string }) {
    const actif = chemin === l.href;
    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={() => setMenuOuvert(false)}
        aria-current={actif ? 'page' : undefined}
        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
          actif
            ? 'text-grenat-300 bg-grenat-500/10'
            : 'text-encre-300 hover:text-encre-100 hover:bg-white/[0.05]'
        }`}
      >
        {l.libelle}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-nuit-950/75 border-b border-nuit-700/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          onClick={() => setMenuOuvert(false)}
          className="flex items-center gap-2.5 group shrink-0"
          aria-label="Plume d’Ombres — accueil"
        >
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 sm:h-10 sm:w-10 object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="font-display text-lg sm:text-xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden md:flex items-center gap-1">
          {LIENS.map(lien)}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ouvrirApparence}
            className="bouton-fantome !px-3 !py-2 text-[13px]"
            title="Apparence du site (palette et typographie)"
          >
            <span aria-hidden="true">◐</span>
            <span className="hidden sm:inline">Apparence</span>
          </button>

          <Link href="/bibliotheque" className="bouton-principal !px-4 !py-2 text-[13px]">
            Entrer
          </Link>

          {/* Menu mobile : les 3 liens publics tiennent dans un
              dépliant (cibles tactiles ≥ 40 px). */}
          <button
            type="button"
            className="md:hidden bouton-fantome !px-3 !py-2 text-[13px]"
            aria-expanded={menuOuvert}
            aria-controls="menu-public"
            onClick={() => setMenuOuvert((o) => !o)}
          >
            <span aria-hidden>{menuOuvert ? '✕' : '☰'}</span>
            <span className="sr-only">
              {menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
            </span>
          </button>
        </div>
      </div>

      {menuOuvert && (
        <nav
          id="menu-public"
          aria-label="Navigation principale (mobile)"
          className="md:hidden border-t border-nuit-700/60 bg-nuit-950/95 px-4 py-3 flex flex-col gap-1 animate-fondu-monte"
        >
          {LIENS.map(lien)}
          <button
            type="button"
            onClick={() => {
              setMenuOuvert(false);
              ouvrirApparence();
            }}
            className="rounded-full px-3 py-1.5 text-sm text-left text-encre-300 hover:text-encre-100 hover:bg-white/[0.05] transition-colors"
          >
            Apparence<sup className="ml-1 text-grenat-300">◐</sup>
          </button>
        </nav>
      )}
    </header>
  );
}
