'use client';

// ============================================================
// components/admin/ModaleConfirmation.tsx — Boîte de confirmation
// RÉUTILISABLE, accessible, pour toute action destructrice du
// panneau d'administration (ex. retirer un abonnement).
//
// Accessibilité : role="dialog" + aria-modal, titre relié par
// aria-labelledby, fermeture à Échap, piège de focus entre les deux
// boutons, focus initial sur « Annuler » (le choix sûr) et restitution
// du focus à l'élément déclencheur. Aucune animation propre : le
// respect de prefers-reduced-motion est déjà garanti globalement.
// ============================================================

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  ouvert: boolean;
  titre: string;
  description: string;
  /** Libellé du bouton de confirmation (action). */
  libelleConfirmer: string;
  /** Action en cours : boutons désactivés, libellé « … en cours ». */
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

export default function ModaleConfirmation({
  ouvert,
  titre,
  description,
  libelleConfirmer,
  enCours = false,
  onConfirmer,
  onAnnuler,
}: Props) {
  const annulerRef = useRef<HTMLButtonElement>(null);
  const confirmerRef = useRef<HTMLButtonElement>(null);
  const boiteRef = useRef<HTMLDivElement>(null);
  const declencheur = useRef<Element | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    declencheur.current = document.activeElement;
    // Focus sur le choix sûr : annuler.
    annulerRef.current?.focus();

    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onAnnuler();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = [annulerRef.current, confirmerRef.current].filter(
          (el): el is HTMLButtonElement => el !== null && !el.disabled
        );
        if (focusables.length === 0) return;
        const premier = focusables[0];
        const dernier = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    }

    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('keydown', surTouche);
      const el = declencheur.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, [ouvert, onAnnuler]);

  if (!ouvert) return null;
  // Rendu dans un PORTAIL attaché à <body> : le panneau est monté dans
  // <main class="animate-fondu-monte">, dont l'animation crée un contexte
  // d'empilement SOUS l'en-tête collant — sans portail, la barre de
  // navigation resterait cliquable au-dessus de l'overlay.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6"
      // Le clic sur le fond annule ; le clic dans la boîte ne le fait pas.
      onClick={(e) => {
        if (e.target === e.currentTarget) onAnnuler();
      }}
    >
      <div className="absolute inset-0 bg-nuit-950/70 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={boiteRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modale-confirmation-titre"
        aria-describedby="modale-confirmation-desc"
        className="velours relative w-full max-w-md p-5 sm:p-6"
      >
        <h3
          id="modale-confirmation-titre"
          className="font-display text-lg text-encre-100"
        >
          {titre}
        </h3>
        <div className="liseret mt-3" />
        <p id="modale-confirmation-desc" className="text-encre-300 text-sm mt-3">
          {description}
        </p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            ref={annulerRef}
            type="button"
            onClick={onAnnuler}
            disabled={enCours}
            className="bouton-fantome w-full sm:w-auto"
          >
            Annuler
          </button>
          <button
            ref={confirmerRef}
            type="button"
            onClick={onConfirmer}
            disabled={enCours}
            className="bouton-principal w-full sm:w-auto"
          >
            {enCours ? 'En cours…' : libelleConfirmer}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
