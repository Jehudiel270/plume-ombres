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

/**
 * Recharge la page UNE SEULE FOIS par mise à jour (garde anti-boucle) :
 * sans ce garde-fou, un rechargement qui re-déclenche un `statechange`
 * ferait une boucle infinie.
 */
function rechargerPourMiseAJour(): void {
  try {
    const dernier = Number(sessionStorage.getItem('plume-derniere-maj') ?? '0');
    if (Date.now() - dernier < 15_000) return; // déjà rechargé à l'instant
    sessionStorage.setItem('plume-derniere-maj', String(Date.now()));
  } catch {
    // sessionStorage indisponible (navigation privée stricte) : on
    // recharge quand même, une fois.
  }
  window.location.reload();
}

export default function PWA() {
  const [evenement, setEvenement] = useState<EvenementInstall | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installe, setInstalle] = useState(estInstalleStandalone);
  // L'utilisateur a déjà dit « plus tard » : on ne le relance pas tout
  // seul. Le bouton reste accessible dans les réglages du compte.
  const [refuse, setRefuse] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('plume-install-reporte') === '1';
    } catch {
      return false;
    }
  });

  // Enregistrement du service worker + écoute des événements
  // d'installation (Chromium / Android). Le body de l'effet ne fait que
  // s'abonner à des événements système : aucun setState synchrone.
  useEffect(() => {
    let enregistrement: ServiceWorkerRegistration | null = null;

    if ('serviceWorker' in navigator) {
      // Surveille un nouveau service worker : dès qu'il est INSTALLÉ
      // alors qu'une version contrôlait déjà la page, on recharge pour
      // servir la nouvelle version (mise à jour automatique, sans que
      // l'utilisateur ait à fermer puis rouvrir l'application).
      const surveiller = (worker: ServiceWorker | null) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            rechargerPourMiseAJour();
          }
        });
      };

      let inscriptionLancee = false;
      const enregistrer = () => {
        if (inscriptionLancee) return;
        inscriptionLancee = true;
        navigator.serviceWorker
          .register('/service-worker.js', {
            scope: '/',
            // Le navigateur REVALIDE toujours le service worker : sans
            // cela, un cache HTTP agressif peut retarder une mise à jour.
            updateViaCache: 'none',
          })
          .then((reg) => {
            enregistrement = reg;
            if (reg.installing) surveiller(reg.installing);
            else if (reg.waiting && navigator.serviceWorker.controller) {
              rechargerPourMiseAJour();
            }
            reg.addEventListener('updatefound', () => surveiller(reg.installing));
          })
          .catch((e) => console.warn('SW non enregistré :', e));
      };

      // On n'attend PAS l'évènement `load` : certains navigateurs le
      // diffèrent indéfiniment quand des images sont chargées en
      // différé (« Load events are deferred »), ce qui empêchait
      // purement et simplement l'enregistrement du service worker.
      if (document.readyState !== 'loading') {
        enregistrer();
      } else {
        document.addEventListener('DOMContentLoaded', enregistrer, { once: true });
        window.addEventListener('load', enregistrer, { once: true });
        // Filet de sécurité : l'enregistrement ne doit jamais dépendre
        // d'un évènement qui peut ne pas venir.
        window.setTimeout(enregistrer, 4000);
      }

      // Recherche active d'une nouvelle version : au retour sur
      // l'onglet, et périodiquement (utile pour une application
      // installée qui reste ouverte des jours).
      const verifier = () => {
        enregistrement?.update().catch(() => undefined);
      };
      const surVisibilite = () => {
        if (document.visibilityState === 'visible') verifier();
      };
      document.addEventListener('visibilitychange', surVisibilite);
      const minuterie = window.setInterval(verifier, 15 * 60 * 1000);
      window.addEventListener('online', verifier);

      const surAjout = (e: Event) => {
        e.preventDefault();
        // Le réglage du compte réutilise le même événement différé.
        (window as unknown as { __plumeInstall?: Event }).__plumeInstall = e;
        window.dispatchEvent(new Event('plume-install-disponible'));
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
        window.clearInterval(minuterie);
        document.removeEventListener('visibilitychange', surVisibilite);
        window.removeEventListener('online', verifier);
        window.removeEventListener('beforeinstallprompt', surAjout);
        window.removeEventListener('appinstalled', surInstalle);
      };
    }

    const surAjout = (e: Event) => {
      e.preventDefault();
      // Le réglage du compte réutilise le même événement différé.
      (window as unknown as { __plumeInstall?: Event }).__plumeInstall = e;
      window.dispatchEvent(new Event('plume-install-disponible'));
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

  // Rendu nul si rien à montrer (desktop sans prompt, déjà installé,
  // ou l'utilisateur a déjà répondu « plus tard »).
  if (installe || !installable || refuse) return null;

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

  function reporter() {
    setRefuse(true);
    setInstallable(false);
    try {
      localStorage.setItem('plume-install-reporte', '1');
    } catch {
      // Navigation privée stricte : le bouton se cache pour cette visite.
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full bg-grenat-700 pl-4 pr-1.5 py-1.5 text-white text-sm shadow-lg shadow-black/40 animate-fondu-monte">
      <button
        type="button"
        onClick={installer}
        className="flex items-center gap-2 hover:underline cursor-pointer"
        title="Installer Plume d’Ombres comme application"
      >
        <span aria-hidden>⤓</span>
        Installer l&rsquo;application
      </button>
      <button
        type="button"
        onClick={reporter}
        aria-label="Fermer et installer plus tard (Réglages du compte)"
        title="Plus tard — installable depuis les réglages du compte"
        className="ml-1 rounded-full w-7 h-7 flex items-center justify-center hover:bg-grenat-600 text-white/80 hover:text-white cursor-pointer"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}