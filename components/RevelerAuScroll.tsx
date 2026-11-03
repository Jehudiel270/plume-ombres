'use client';

// ============================================================
// components/RevelerAuScroll.tsx — Apparition douce des blocs au
// défilement, côté public ET côté tableau de bord.
//
// PRINCIPE : aucun bloc n'est enveloppé dans un composant. Le serveur
// pose simplement l'attribut `data-reveler` sur un conteneur ; ce
// composant, monté une fois dans la mise en page racine, découvre ces
// éléments et leur applique la classe `.revele` quand ils entrent dans
// la fenêtre. Avantages :
//   · rien à exporter/importer dans les pages (donc aucun composant
//     serveur transformé en composant client par erreur) ;
//   · l'apparence vit dans globals.css et suit les 18 palettes ;
//   · fonctionne aussi pour les blocs ajoutés plus tard (changement
//     d'onglet, filtrage, pagination) grâce au MutationObserver.
//
// RESPECT DE L'UTILISATEUR : si `prefers-reduced-motion: reduce` ou
// l'économie de données est active, on pose `html[data-economie="1"]`
// et RIEN n'est animé (les blocs restent visibles, sans transition).
// ============================================================

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const CLASSE = 'revele';

export default function RevelerAuScroll() {
  const chemin = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connexion = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const economie =
      mouvementReduit.matches === true ||
      connexion?.saveData === true ||
      connexion?.effectiveType === '2g' ||
      connexion?.effectiveType === 'slow-2g';

    if (economie) {
      document.documentElement.dataset.economie = '1';
      return;
    }
    delete document.documentElement.dataset.economie;

    // Pas d'IntersectionObserver (navigateur ancien) : tout reste
    // visible, on n'anime simplement pas.
    if (typeof IntersectionObserver === 'undefined') return;

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          entree.target.classList.add(CLASSE);
          observateur.unobserve(entree.target);
        }
      },
      // Marge basse négative : le bloc se révèle quand il est franchement
      // entré dans l'écran, pas au ras du bord.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    function armer(racine: ParentNode = document) {
      const cibles = racine.querySelectorAll<HTMLElement>('[data-reveler]');
      for (const cible of cibles) {
        if (cible.classList.contains('reveler')) continue;
        cible.classList.add('reveler');
        // Déjà visible au chargement (haut de page) : révélation
        // immédiate mais animée, pour éviter un saut visuel.
        observateur.observe(cible);
      }
    }

    armer();

    // Filet de sécurité : si l'observateur ne se déclenche pas (navigateur
    // exotique, iframe de prévisualisation, onglet en arrière-plan), aucun
    // bloc ne doit rester invisible. Après 2,5 s, on révèle ce qui reste.
    const secours = setTimeout(() => {
      for (const reste of document.querySelectorAll<HTMLElement>('.reveler:not(.revele)')) {
        reste.classList.add(CLASSE);
      }
    }, 2500);

    // Blocs montés après coup (onglets, filtres, pagination).
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const mutations = new MutationObserver(() => {
      if (minuteur) clearTimeout(minuteur);
      minuteur = setTimeout(() => armer(), 80);
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observateur.disconnect();
      mutations.disconnect();
      if (minuteur) clearTimeout(minuteur);
      clearTimeout(secours);
    };
  }, [chemin]);

  return null;
}
