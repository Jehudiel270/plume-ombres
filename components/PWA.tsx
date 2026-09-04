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

export default function PWA() {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const evtRef = useState<EvenementInstall | null>(null);
  const [evt, setEvt] = evtRef;

  useEffect(() => {
    // Détection d'une installation déjà faite (standalone).
    const estStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (estStandalone) setInstalled(true);

    // Enregistrement du service worker (HTTPS requis ; localhost ok).
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js', { scope: '/' })
          .catch((e) => console.warn('SW non enregistré :', e));
      });
    }

    // Bouton d'installation.
    const surInstall = (e: Event) => {
      e.preventDefault();
      setEvt(e as unknown as EvenementInstall);
      setInstallable(true);
    };
    const surInstalle = () => {
      setInstalled(true);
      setInstallable(false);
    };
    window.addEventListener('beforeinstallprompt', surInstall);
    window.addEventListener('appinstalled', surInstalle);
    return () => {
      window.removeEventListener('beforeinstallprompt', surInstall);
      window.removeEventListener('appinstalled', surInstalle);
    };
  }, []);

  // Rendu nul si rien à montrer (desktop sans prompt, ou déjà installé).
  if (installed || !installable) return null;

  async function installer() {
    if (!evt) return;
    await evt.prompt();
    const choix = await evt.userChoice;
    if (choix.outcome === 'accepted') {
      setInstallable(false);
    }
    setEvt(null);
  }

  return (
    <button
      type="button"
      onClick={installer}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-grenat-700 hover:bg-grenat-600 text-white text-sm px-4 py-2.5 shadow-lg shadow-black/40 transition-all animate-fondu-monte cursor-pointer"
      title="Installer Plume d’Ombres comme application"
    >
      <span aria-hidden>⤓</span>
      Installer l'application
    </button>
  );
}