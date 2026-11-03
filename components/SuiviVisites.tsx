'use client';

// ============================================================
// components/SuiviVisites.tsx — Balise d'audience, sans cookie.
//
// Montée une seule fois dans le layout racine. À chaque changement de
// page, elle envoie un événement minimal à /api/track :
//   chemin, domaine d'origine du lien, identifiant de session aléatoire.
//
// L'identifiant vit dans sessionStorage : il disparaît à la fermeture de
// l'onglet et n'est relié à aucun compte. Aucun cookie, aucun stockage
// persistant, aucun script tiers.
// ============================================================

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const CLE_SESSION = 'plume-visite';

function identifiantSession(): string | null {
  try {
    const existant = window.sessionStorage.getItem(CLE_SESSION);
    if (existant && /^[A-Za-z0-9_-]{8,64}$/.test(existant)) return existant;
    const neuf =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2).padEnd(16, '0');
    window.sessionStorage.setItem(CLE_SESSION, neuf);
    return neuf;
  } catch {
    // Navigation privée ou stockage bloqué : on renonce à mesurer plutôt
    // que de recourir à une empreinte.
    return null;
  }
}

export default function SuiviVisites() {
  const chemin = usePathname();

  useEffect(() => {
    // L'exploitant consulte son propre tableau de bord : le compter
    // fausserait l'audience réelle.
    if (chemin.startsWith('/admin')) return;

    const visiteur = identifiantSession();
    if (!visiteur) return;

    const corps = JSON.stringify({
      chemin,
      referent: document.referrer || null,
      visiteur,
    });

    // sendBeacon : la mesure ne retarde jamais la navigation et survit au
    // changement de page.
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const envoye = navigator.sendBeacon(
        '/api/track',
        new Blob([corps], { type: 'application/json' })
      );
      if (envoye) return;
    }

    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corps,
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {});
  }, [chemin]);

  return null;
}
