// ============================================================
// PWA.tsx — Enregistrement du service worker + bouton d'installation.
//
// - Le service worker (/service-worker.js, servi tel quel depuis
//   /public) est enregistré une fois au chargement : lecture
//   hors-ligne + app shell instantanée.
// - Bouton « Installer l'application » : intercepte
//   `beforeinstallprompt` (Chromium / Android). Sur iOS, le
//   navigateur propose « Ajouter à l'écran d'accueil » via le
//   menu Partager — pas d'événement capturable, le bouton ne
//   s'affiche donc pas (et on n'invente pas un faux contrôle).
// Gratuit : zéro dépendance.
// ============================================================
'use client';

import { useEffect, useState } from 'react';

interface EvenementInstall {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Détection « déjà installée » (standalone) — initialisation paresseuse,
 *  lue une seule fois au premier rendu : pas de setState synchrone dans
 *  un effet (pattern exigé par les règles React Compiler, v7). */
function estInstalleStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function PWA() {
  const [evenement, setEvenement] = useState<EvenementInstall | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installe, setInstalle] = useState(estInstalleStandalone);

  // Enregistrement du service worker + écoute des événements
  // d'installation (Chromium / Android). Le body de l'effet ne fait que
  // s'abonner à des événements système : aucun setState synchrone.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js', { scope: '/' })
          .catch((e) => console.warn('SW non enregistré :', e));
      });
    }
    const surAjout = (e: Event) => {
      e.preventDefault();
      setEvenement(e as unknown as EvenementInstall);
      setInstallable(true);
    };
    const surInstalle = () => {
      setInstalle(true);
      setInstallable(false);
    };
    window.addEventListener('beforeinstallprompt', surAjout);
    window.addEventListener('appinstalled', surInstalle);
    return () => {
      window.removeEventListener('beforeinstallprompt', surAjout);
      window.removeEventListener('appinstalled', surInstalle);
    };
  }, []);

  // Rendu nul si rien à montrer (desktop sans prompt, ou déjà installé).
  if (installe || !installable) return null;

  async function installer() {
    if (!evenement) return;
    await evenement.prompt();
    const choix = await evenement.userChoice;
    if (choix.outcome === 'accepted') {
      setInstalle(true);
      setInstallable(false);
    }
    setEvenement(null);
  }

  return (
    <button
      type="button"
      onClick={installer}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-grenat-700 hover:bg-grenat-600 text-white text-sm px-4 py-2.5 shadow-lg shadow-black/40 transition-all animate-fondu-monte cursor-pointer"
      title="Installer Plume d’Ombres comme application"
    >
      <span aria-hidden>⤓</span>
      Installer l&rsquo;application
    </button>
  );
}