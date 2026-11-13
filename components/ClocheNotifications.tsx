'use client';

// ============================================================
// ClocheNotifications.tsx — cloche de notifications persistantes.
//
// Affiche une icône `Bell` avec une pastille du nombre de non-lues
// (masquée à 0). Le menu déroulant liste les dernières notifications
// (titre, corps, date relative en français, point pour les non-lues).
// Cliquer une entrée la marque lue et navigue vers son `lien` ;
// « Tout marquer comme lu » vide la pastille.
//
// Rafraîchissement sans state management externe : au montage, au
// retour de focus de l'onglet (visibilitychange) et toutes les 60 s
// tant que l'onglet est visible.
//
// Aucune couleur en dur : jetons du design system (.velours,
// encre-*, grenat-*, nuit-*) et icônes lucide-react.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { creerClientNavigateur } from '@/lib/supabase/client';
import {
  compterNotificationsNonLues,
  listerNotifications,
  marquerNotificationsLues,
  type Notification,
} from '@/lib/notifications';

/** Intervalle de rafraîchissement tant que l'onglet est visible. */
const INTERVALLE_MS = 60_000;

/** Date relative en français (« il y a 3 min », « hier »…). */
function dateRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - Date.now(); // négatif : dans le passé
  const abs = Math.abs(diff);
  const MINUTE = 60_000;
  const HEURE = 3_600_000;
  const JOUR = 86_400_000;
  const SEMAINE = 604_800_000;
  const MOIS = 2_592_000_000;
  const ANNEE = 31_536_000_000;

  if (abs < 45_000) return "à l'instant";
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (abs < HEURE) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < JOUR) return rtf.format(Math.round(diff / HEURE), 'hour');
  if (abs < SEMAINE) return rtf.format(Math.round(diff / JOUR), 'day');
  if (abs < MOIS) return rtf.format(Math.round(diff / SEMAINE), 'week');
  if (abs < ANNEE) return rtf.format(Math.round(diff / MOIS), 'month');
  return rtf.format(Math.round(diff / ANNEE), 'year');
}

/** Pastille de comptage (au plus « 99+ »). */
function Pastille({ nombre }: { nombre: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-grenat-500 text-white text-[10px] font-medium leading-none grid place-items-center shadow"
    >
      {nombre > 99 ? '99+' : nombre}
    </span>
  );
}

interface Props {
  /**
   * Affiche un libellé « Notifications » à côté de l'icône (entrée du
   * menu mobile). Par défaut : bouton icône compact (barre du haut).
   */
  avecLibelle?: boolean;
  className?: string;
}

export default function ClocheNotifications({
  avecLibelle = false,
  className = '',
}: Props) {
  const routeur = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    try {
      const supabase = creerClientNavigateur();
      const [liste, compteur] = await Promise.all([
        listerNotifications(supabase, { limite: 20 }),
        compterNotificationsNonLues(supabase),
      ]);
      setNotifications(liste);
      setNonLues(compteur);
    } catch {
      /* silencieux : la cloche ne doit jamais casser la navigation */
    }
  }, []);

  // Montage + retour de focus de l'onglet + intervalle 60 s (onglet visible).
  useEffect(() => {
    let annule = false;

    const chargerSiVisible = () => {
      if (document.visibilityState === 'visible') void charger();
    };

    // Chargement initial : IIFE asynchrone (pattern toléré par les règles
    // React Compiler — aucun setState dans le corps SYNCHRONE de l'effet).
    const supabase = creerClientNavigateur();
    (async () => {
      const [liste, compteur] = await Promise.all([
        listerNotifications(supabase, { limite: 20 }),
        compterNotificationsNonLues(supabase),
      ]);
      if (annule) return;
      setNotifications(liste);
      setNonLues(compteur);
    })().catch(() => {
      /* silencieux : la cloche ne doit jamais casser la navigation */
    });

    document.addEventListener('visibilitychange', chargerSiVisible);
    const minuterie = window.setInterval(chargerSiVisible, INTERVALLE_MS);
    return () => {
      annule = true;
      document.removeEventListener('visibilitychange', chargerSiVisible);
      window.clearInterval(minuterie);
    };
  }, [charger]);

  // Fermeture au clic extérieur / Échap (même motif que le menu utilisateur).
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: PointerEvent) => {
      if (!zoneRef.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('pointerdown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('pointerdown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  const ouvrirNotification = useCallback(
    async (n: Notification) => {
      setOuvert(false);
      if (!n.lu) {
        // Optimiste : la pastille et le point disparaissent tout de suite.
        setNotifications((liste) =>
          liste.map((x) => (x.id === n.id ? { ...x, lu: true } : x))
        );
        setNonLues((c) => Math.max(0, c - 1));
        try {
          const supabase = creerClientNavigateur();
          await marquerNotificationsLues(supabase, [n.id]);
        } catch {
          /* silencieux : le marquage se rattrapera au prochain rafraîchissement */
        }
      }
      if (n.lien) routeur.push(n.lien);
    },
    [routeur]
  );

  const toutMarquerLu = useCallback(async () => {
    setOuvert(false);
    if (nonLues === 0) return;
    setNotifications((liste) => liste.map((x) => ({ ...x, lu: true })));
    setNonLues(0);
    try {
      const supabase = creerClientNavigateur();
      await marquerNotificationsLues(supabase, null);
    } catch {
      /* silencieux */
    }
  }, [nonLues]);

  const ariaLabel =
    nonLues > 0
      ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}`
      : 'Notifications';

  return (
    <div ref={zoneRef} className="relative">
      {avecLibelle ? (
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={ouvert}
          aria-controls="cloche-notifications"
          aria-label={ariaLabel}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left text-encre-300 hover:text-encre-100 hover:bg-white/[0.05] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-grenat-400 ${className}`}
        >
          <span className="relative shrink-0">
            <Bell size={18} aria-hidden="true" className="opacity-80" />
            {nonLues > 0 && <Pastille nombre={nonLues} />}
          </span>
          <span className="truncate">Notifications</span>
          {nonLues > 0 && (
            <span className="ml-auto rounded-full bg-grenat-500/15 px-2 py-0.5 text-[11px] text-grenat-300">
              {nonLues}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={ouvert}
          aria-controls="cloche-notifications"
          aria-label={ariaLabel}
          title="Notifications"
          className={`relative w-10 h-10 rounded-full grid place-items-center border border-transparent hover:border-nuit-700 hover:bg-white/[0.04] text-encre-300 hover:text-encre-100 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-grenat-400 ${className}`}
        >
          <Bell size={20} aria-hidden="true" />
          {nonLues > 0 && <Pastille nombre={nonLues} />}
        </button>
      )}

      {ouvert && (
        <div
          id="cloche-notifications"
          role="menu"
          aria-label="Notifications"
          className="velours absolute right-0 top-full mt-2 z-40 w-[min(22rem,calc(100vw-2rem))] max-h-[min(70vh,26rem)] overflow-y-auto p-2 text-left animate-fondu-monte"
        >
          <div
            role="presentation"
            className="flex items-center justify-between gap-2 px-3 pt-2 pb-1"
          >
            <span className="text-[10px] uppercase tracking-[0.22em] text-encre-500">
              Notifications
            </span>
            {nonLues > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={toutMarquerLu}
                className="rounded-md px-2 py-1 text-[11px] text-grenat-300 hover:text-grenat-400 hover:bg-white/[0.05] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-grenat-400"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p role="presentation" className="px-3 py-6 text-center text-sm text-encre-500">
              Aucune notification
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => void ouvrirNotification(n)}
                className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-grenat-400"
              >
                <span className="mt-1.5 shrink-0" aria-hidden="true">
                  <span
                    className={`block w-2 h-2 rounded-full ${
                      n.lu ? 'bg-nuit-700' : 'bg-grenat-500'
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm truncate ${
                      n.lu ? 'text-encre-300' : 'text-encre-100 font-medium'
                    }`}
                  >
                    {n.titre}
                  </span>
                  {n.corps && (
                    <span className="mt-0.5 block text-xs text-encre-500 line-clamp-2">
                      {n.corps}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-encre-500">
                    {dateRelative(n.cree_le)}
                  </span>
                </span>
              </button>
            ))
          )}

          {/* La page complète : historique au-delà des 20 dernières. */}
          <a
            role="menuitem"
            href="/notifications"
            className="mt-1 block border-t border-nuit-700/60 px-3 py-2.5 text-center text-[11px] text-grenat-300 hover:text-grenat-400 hover:bg-white/[0.05] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-grenat-400"
          >
            Voir toutes les notifications
          </a>
        </div>
      )}
    </div>
  );
}
