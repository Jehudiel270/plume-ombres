// ============================================================
// components/BanniereAnnonce.tsx — Bandeau d'annonce en haut du site.
//
// Rendu par le layout RACINE : la bannière apparaît donc partout
// (pages publiques, espace connecté, administration) sans modifier une
// seule page.
//
// INERTE PAR DÉFAUT (voir lib/annonce.ts) : elle ne s'affiche que si
// elle est explicitement activée ET que son URL est valide.
//
// Accessibilité : élément <aside> étiqueté, lien focusable avec anneau
// de focus visible, texte centré et repliable sur mobile. Aucune
// couleur codée en dur : uniquement les jetons du thème.
// ============================================================

import { ANNONCE, annonceVisible } from '@/lib/annonce';

export default function BanniereAnnonce() {
  if (!annonceVisible()) return null;

  return (
    <aside
      aria-label="Annonce"
      className="relative z-40 border-b border-grenat-500/40 bg-grenat-500/10 backdrop-blur-sm"
    >
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm text-encre-200 sm:px-6">
        <span>{ANNONCE.texte}</span>
        <a
          href={ANNONCE.url}
          className="rounded-full px-2 py-1 font-medium text-grenat-300 underline underline-offset-4 outline-none transition-colors hover:text-grenat-200 focus-visible:ring-2 focus-visible:ring-grenat-400 focus-visible:ring-offset-2 focus-visible:ring-offset-nuit-950"
        >
          {ANNONCE.libelleLien}
        </a>
      </p>
    </aside>
  );
}
