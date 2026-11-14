'use client';

// ============================================================
// BoutonSuivi.tsx — « Je suis cette œuvre » (A7/A22, variante
// atelier). Posé sur la fiche du livre et la fiche d'ambiance : le
// suivi alimente la page /suivis (agenda des sorties réelles, état
// de traduction) — rien d'exposé à des tiers.
//
// Accessible : bouton natif, aria-pressed, libellé descriptif,
// état en attente, retour d'erreur explicite.
// ============================================================

import { useState } from 'react';
import { Bookmark } from 'lucide-react';

interface Props {
  /** Id du livre (uuid public.livres.id). */
  livreId: string;
  /** État initial (lu côté serveur par la page qui rend le bouton). */
  suiviInitial: boolean;
  /** Titre du livre — sert au libellé accessible. */
  titre?: string;
}

export default function BoutonSuivi({ livreId, suiviInitial, titre }: Props) {
  const [suivi, setSuivi] = useState(suiviInitial);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const libelle = titre ? `« ${titre} »` : 'cette œuvre';

  async function basculer() {
    if (enCours) return;
    setEnCours(true);
    setErreur('');
    const cible = !suivi;
    try {
      const reponse = cible
        ? await fetch('/api/suivis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ livreId }),
          })
        : await fetch(`/api/suivis?livreId=${encodeURIComponent(livreId)}`, {
            method: 'DELETE',
          });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
        setErreur(corps.erreur ?? 'Opération refusée.');
      } else {
        setSuivi(cible);
      }
    } catch {
      setErreur('Réseau indisponible : réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={basculer}
        disabled={enCours}
        aria-pressed={suivi}
        aria-label={suivi ? `Ne plus suivre ${libelle}` : `Suivre ${libelle}`}
        title={suivi ? 'Ne plus suivre cette œuvre' : 'Suivre cette œuvre (agenda des sorties)'}
        className={
          'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs transition-colors cursor-pointer ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 ' +
          'disabled:opacity-40 disabled:cursor-wait ' +
          (suivi
            ? 'text-grenat-300 bg-grenat-500/10 border border-grenat-500/40 hover:bg-grenat-500/20'
            : 'bouton-fantome')
        }
      >
        <Bookmark
          strokeWidth={1.75}
          fill={suivi ? 'currentColor' : 'none'}
          className="size-3.5"
          aria-hidden
        />
        {suivi ? 'Œuvre suivie' : 'Suivre cette œuvre'}
      </button>
      {erreur && (
        <span role="status" className="text-[11px] text-grenat-400">
          {erreur}
        </span>
      )}
    </span>
  );
}
