'use client';

// ============================================================
// FondAmbiance.tsx — le décor de fond « nuit d'encre ».
//
// Ce composant ne dessine PLUS de WebGL. L'ancien canvas + shader
// produisait des taches lumineuses jugées « bizarres » (boules de
// bokeh au centre, patchwork sur la palette claire) et coûtait une
// boucle requestAnimationFrame permanente. Le décor est désormais
// une simple pile de dégradés CSS (voir FondAmbiance.module.css) :
//   · brume et braises, nuit d'orage, encre, sang et or, papier
//     clair — chaque teinte vient des jetons de la palette,
//   · un voile de brume qui dérive lentement (transform, GPU),
//   · grain fin et vignette douce.
//
// Le décor est TOUJOURS peint, sans attendre le JS (pas de flash) ;
// le JS ne fait qu'une chose : poser html[data-fond="anime|fixe"]
// pour couper la dérive quand c'est plus économe :
//   · prefers-reduced-motion,
//   · navigator.connection.saveData ou réseau « 2g »,
//   · batterie faible (déchargée, ≤ 20 %).
// (La préférence de mouvement coupe aussi l'animation par CSS pur,
// avant même l'hydratation.)
//
// Coût : 0 dépendance, 0 requête, 0 télémétrie, 0 boucle d'animation.
// ============================================================

import { useEffect } from 'react';
import styles from './FondAmbiance.module.css';

/** Décide s'il faut animer le décor ou le laisser figé. */
async function modeAffichage(): Promise<'anime' | 'fixe'> {
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduit) return 'fixe';

  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData === true) return 'fixe';
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return 'fixe';

  // Batterie : l'API est non standard — on l'utilise si présente.
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ charging: boolean; level: number }>;
  };
  if (typeof nav.getBattery === 'function') {
    try {
      const b = await nav.getBattery();
      if (!b.charging && b.level <= 0.2) return 'fixe';
    } catch {
      /* refus : on continue en animé */
    }
  }
  return 'anime';
}

export default function FondAmbiance() {
  useEffect(() => {
    const racine = document.documentElement;
    let annule = false;

    const poser = () => {
      void modeAffichage().then((mode) => {
        if (!annule) racine.dataset.fond = mode;
      });
    };

    poser();

    // La préférence de mouvement peut changer en cours de session.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const surChangement = () => poser();
    mq.addEventListener('change', surChangement);

    return () => {
      annule = true;
      mq.removeEventListener('change', surChangement);
    };
  }, []);

  return (
    <div className={styles.decor} data-decor-fond aria-hidden="true">
      <div className={styles.brume} />
      <div className={styles.grain} />
      <div className={styles.vignette} />
    </div>
  );
}
