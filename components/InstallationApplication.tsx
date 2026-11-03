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

import { useState, useSyncExternalStore } from 'react';

interface EvenementInstall {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type FenetreAvecInstall = Window & { __plumeInstall?: EvenementInstall | null };

const MODE_STANDALONE = '(display-mode: standalone)';
const EVENEMENT_DISPONIBLE = 'plume-install-disponible';

// Lecture directe de l'état du navigateur (mode d'affichage, événement
// d'installation capté par PWA.tsx) : `useSyncExternalStore` remplace l'effet
// qui appelait setState au montage — pas de rendu en cascade, et l'état reste
// abonné aux changements extérieurs.
function lireInstallee(): boolean {
  return (
    window.matchMedia(MODE_STANDALONE).matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function lireDisponible(): boolean {
  return Boolean((window as FenetreAvecInstall).__plumeInstall);
}

function abonner(rappel: () => void): () => void {
  const media = window.matchMedia(MODE_STANDALONE);
  media.addEventListener('change', rappel);
  window.addEventListener('appinstalled', rappel);
  window.addEventListener(EVENEMENT_DISPONIBLE, rappel);
  return () => {
    media.removeEventListener('change', rappel);
    window.removeEventListener('appinstalled', rappel);
    window.removeEventListener(EVENEMENT_DISPONIBLE, rappel);
  };
}

export default function InstallationApplication() {
  const dejaInstallee = useSyncExternalStore(abonner, lireInstallee, () => false);
  const disponible = useSyncExternalStore(abonner, lireDisponible, () => false);
  // Installation acceptée à l'instant : le mode d'affichage ne bascule qu'au
  // prochain lancement de l'application, on garde donc une trace locale.
  const [justeInstallee, setJusteInstallee] = useState(false);
  const [conseil, setConseil] = useState<string | null>(null);
  const installe = dejaInstallee || justeInstallee;

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
    // Prévient les abonnés (le bouton repasse en « Comment installer ? »).
    window.dispatchEvent(new Event(EVENEMENT_DISPONIBLE));
    if (choix.outcome === 'accepted') {
      setJusteInstallee(true);
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
