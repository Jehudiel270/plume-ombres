'use client';

// Bouton « favori » : un cœur (plein ou vide) en surbrillance grenat
// quand le livre est dans les favoris. Accessible : bouton natif,
// aria-pressed, titre descriptif, focus clavier visible.
// Style aligné sur les cartes (BibliothequeClient.tsx) : nuit/grenat,
// tailles text-[11px], arrondis rrondus, focus visible au focus.

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/lib/useFavorites';

interface Props {
  /** Id du livre concerné (uuid public.livres.id). */
  livreId: string;
  /** Titre du livre — sert au titre accessible (optionnel : « ce livre »). */
  titre?: string;
  /**
   * Cas où le bouton est rendu dans un contexte qui gère déjà les
   * favoris (le hook est déjà chargé au-dessus) : passez le résultat
   * du hook pour éviter un second chargement Supabase.
   */
  hook?: Pick<ReturnType<typeof useFavorites>, 'isFavori' | 'toggleFavori' | 'estConnecte'>;
  /** Petit (cartes) ou normal — par défaut : petit, comme les carte. */
  taille?: 'sm' | 'md';
}

export default function BoutonFavori({ livreId, titre, hook, taille = 'sm' }: Props) {
  const propres = useFavorites();
  const favori = hook ?? propres;
  const [enCoursClic, setEnCoursClic] = useState(false);

  const actif = favori.isFavori(livreId);
  const libelleBase = titre ? `« ${titre} »` : 'ce livre';

  async function basculer(e: React.MouseEvent) {
    // Empêche la carte (parent) d'ouvrir le livre au même clic.
    e.stopPropagation();
    if (enCoursClic) return;
    setEnCoursClic(true);
    try {
      const { ok, erreur } = await favori.toggleFavori(livreId);
      if (!ok && erreur) {
        // Feedback discret mais visible : alert si l'UI refuse l'op.
        window.alert(erreur);
      }
    } finally {
      setEnCoursClic(false);
    }
  }

  return (
    <button
      type="button"
      onClick={basculer}
      disabled={enCoursClic}
      aria-pressed={actif}
      aria-label={actif ? `Retirer ${libelleBase} des favoris` : `Ajouter ${libelleBase} aux favoris`}
      title={actif ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={
        'inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 ' +
        'disabled:opacity-40 disabled:cursor-wait ' +
        (taille === 'sm' ? 'p-1.5 ' : 'p-2 ') +
        (actif
          ? 'text-grenat-400 bg-grenat-500/10 hover:bg-grenat-500/20'
          : 'text-encre-500 hover:text-grenat-300 hover:bg-grenat-500/10')
      }
    >
      <Heart
        strokeWidth={1.75}
        // plein quand favori, contour sinon
        fill={actif ? 'currentColor' : 'none'}
        className={
          (taille === 'sm' ? 'size-4 ' : 'size-5 ') +
          'transition-transform duration-300 ' +
          (actif ? '' : 'opacity-80')
        }
        aria-hidden
      />
    </button>
  );
}