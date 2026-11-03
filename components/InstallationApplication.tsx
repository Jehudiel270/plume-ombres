'use client';

// ============================================================
// components/InstallationApplication.tsx — Installer l'application
// plus tard, depuis les réglages du compte.
//
// Le bandeau flottant peut être fermé (« × ») : l'installation reste
// possible ici. Sur Chromium/Android on réutilise l'événement
// `beforeinstallprompt` capturé par PWA.tsx (exposé sur window).
// Sur iOS et Firefox, aucun événement n'existe : on donne la marche
// à suivre au lieu de simuler un bouton qui ne ferait rien.
// ============================================================

import { useEffect, useState } from 'react';

interface EvenementInstall {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type FenetreAvecInstall = Window & { __plumeInstall?: EvenementInstall | null };

export default function InstallationApplication() {
  const [installe, setInstalle] = useState(false);
  const [disponible, setDisponible] = useState(false);
  const [conseil, setConseil] = useState<string | null>(null);

  useEffect(() => {
    const fenetre = window as FenetreAvecInstall;
    const maj = () => setDisponible(Boolean(fenetre.__plumeInstall));
    const surInstalle = () => setInstalle(true);

    setInstalle(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );
    maj();

    window.addEventListener('plume-install-disponible', maj);
    window.addEventListener('appinstalled', surInstalle);
    return () => {
      window.removeEventListener('plume-install-disponible', maj);
      window.removeEventListener('appinstalled', surInstalle);
    };
  }, []);

  async function installer() {
    const fenetre = window as FenetreAvecInstall;
    const evenement = fenetre.__plumeInstall;
    if (!evenement) {
      const ua = navigator.userAgent;
      if (/iphone|ipad|ipod/i.test(ua)) {
        setConseil('Sur iPhone : bouton Partager, puis « Sur l’écran d’accueil ».');
      } else if (/firefox/i.test(ua)) {
        setConseil('Sur Firefox : menu ⋮, puis « Installer » (ou « Ajouter à l’écran d’accueil » sur Android).');
      } else {
        setConseil('Depuis le navigateur : icône d’installation dans la barre d’adresse, ou menu ⋮ → « Installer Plume d’Ombres ».');
      }
      return;
    }

    setConseil(null);
    await evenement.prompt();
    const choix = await evenement.userChoice;
    fenetre.__plumeInstall = null;
    setDisponible(false);
    if (choix.outcome === 'accepted') {
      setInstalle(true);
      try {
        localStorage.removeItem('plume-install-reporte');
      } catch {
        // Sans stockage local : rien à nettoyer.
      }
    }
  }

  if (installe) {
    return (
      <p className="text-sm text-encre-400 mt-4">
        ✅ L’application est installée sur cet appareil — vous la retrouvez sur votre écran d’accueil
        ou dans vos applications.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={installer}
        className="lien-discret underline text-sm cursor-pointer"
      >
        {disponible ? 'Installer l’application sur cet appareil' : 'Comment installer l’application ?'}
      </button>
      {conseil && <p className="text-encre-500 text-xs mt-2">{conseil}</p>}
    </div>
  );
}
