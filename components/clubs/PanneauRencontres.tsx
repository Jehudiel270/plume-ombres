'use client';

// ============================================================
// PanneauRencontres.tsx — Rencontres du club (F11 v4) : en ligne
// (appel vocal) ou salon écrit, à venir et passées, avec bascule
// « Je participe » et compte de participants.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Trash2, Users } from 'lucide-react';

export interface RencontreClub {
  id: string;
  titre: string;
  prevuLe: string;
  mode: string;
  chapitres: string | null;
  passee: boolean;
  mienne: boolean;
  participants: number;
  jeParticipe: boolean;
}

const dateLongue = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function PanneauRencontres({
  clubId,
  aVenir,
  passees,
}: {
  clubId: string;
  aVenir: RencontreClub[];
  passees: RencontreClub[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [notification, setNotification] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [formulaire, setFormulaire] = useState(false);
  const [titre, setTitre] = useState('');
  const [prevuLe, setPrevuLe] = useState('');
  const [mode, setMode] = useState<'en ligne' | 'salon écrit'>('en ligne');

  const appeler = async (url: string, options: RequestInit) => {
    try {
      const reponse = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: reponse.ok, donnees };
    } catch {
      return { ok: false, donnees: { erreur: 'Réseau indisponible : réessayez.' } };
    }
  };

  const proposer = async () => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/rencontres`,
      {
        method: 'POST',
        body: JSON.stringify({ titre, prevuLe, mode }),
      }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Proposition refusée.',
      });
      return;
    }
    setFormulaire(false);
    setTitre('');
    setPrevuLe('');
    setMode('en ligne');
    setNotification({ ton: 'ok', texte: 'Rencontre proposée.' });
    router.refresh();
  };

  const basculer = async (rencontreId: string) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/rencontres/participation`,
      { method: 'POST', body: JSON.stringify({ rencontreId }) }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Participation refusée.',
      });
      return;
    }
    router.refresh();
  };

  const retirer = async (rencontreId: string) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(
        clubId
      )}/rencontres?rencontreId=${encodeURIComponent(rencontreId)}`,
      { method: 'DELETE' }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Retrait refusé.',
      });
      return;
    }
    setNotification({ ton: 'ok', texte: 'Rencontre retirée.' });
    router.refresh();
  };

  const ligne = (r: RencontreClub, aVenirLigne: boolean) => (
    <li key={r.id} className="velours flex flex-wrap items-center gap-3 rounded-xl p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-encre-100">{r.titre}</span>
          <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[11px] text-encre-400">
            {r.mode}
          </span>
        </div>
        <p className="text-xs text-encre-500 mt-0.5">{dateLongue(r.prevuLe)}</p>
        <p className="text-xs text-encre-400 mt-0.5 inline-flex items-center gap-1.5">
          <Users size={11} aria-hidden="true" />
          {r.participants} participant{r.participants > 1 ? 's' : ''}
          {r.chapitres ? ` · ${r.chapitres}` : ''}
        </p>
      </div>
      {aVenirLigne && (
        <button
          type="button"
          onClick={() => basculer(r.id)}
          disabled={enCours}
          aria-pressed={r.jeParticipe}
          className={`${r.jeParticipe ? 'bouton-principal' : 'bouton-fantome'} !min-h-9 text-xs disabled:opacity-40 cursor-pointer`}
        >
          {r.jeParticipe ? 'Je participe' : 'Participer'}
        </button>
      )}
      {r.mienne && (
        <button
          type="button"
          onClick={() => retirer(r.id)}
          disabled={enCours}
          title="Retirer cette rencontre"
          aria-label="Retirer cette rencontre"
          className="text-encre-500 hover:text-grenat-400 disabled:opacity-40 cursor-pointer"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  );

  return (
    <section aria-labelledby="titre-rencontres" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titre-rencontres" className="font-display text-xl text-encre-100">
            Rencontres du club
          </h2>
          <p className="text-xs text-encre-500 mt-1">
            En ligne (appel vocal) ou salon écrit, pour débattre de l’étape en
            cours. Les discussions respectent le plafond du club.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormulaire((v) => !v)}
          className="bouton-fantome min-h-10 text-sm inline-flex items-center gap-1.5 cursor-pointer"
        >
          <CalendarDays size={14} aria-hidden="true" /> Proposer une rencontre
        </button>
      </div>

      {notification && (
        <p
          role="status"
          className={`text-xs ${notification.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
        >
          {notification.texte}
        </p>
      )}

      {formulaire && (
        <form
          className="velours p-5 rounded-2xl space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            proposer();
          }}
        >
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre de la rencontre (ex. Rencontre — Étape 3)"
            className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            maxLength={120}
            required
          />
          <input
            type="datetime-local"
            value={prevuLe}
            onChange={(e) => setPrevuLe(e.target.value)}
            className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            required
          />
          <div
            role="group"
            aria-label="Format de la rencontre"
            className="flex gap-1.5"
          >
            {(['en ligne', 'salon écrit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 min-h-9 text-xs ${mode === m ? 'bouton-principal' : 'bouton-fantome'} cursor-pointer`}
              >
                {m === 'en ligne' ? 'En ligne' : 'Salon écrit'}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={enCours || !titre.trim() || !prevuLe}
            className="bouton-principal min-h-10 text-sm disabled:opacity-40 cursor-pointer"
          >
            Proposer
          </button>
        </form>
      )}

      {aVenir.length === 0 ? (
        <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
          Aucune rencontre prévue : proposez une date au groupe.
        </p>
      ) : (
        <ul className="space-y-2">{aVenir.map((r) => ligne(r, true))}</ul>
      )}

      {passees.length > 0 && (
        <div className="space-y-2">
          <h3 className="sur-titre text-encre-300">Passées</h3>
          <ul className="space-y-2">{passees.map((r) => ligne(r, false))}</ul>
        </div>
      )}
    </section>
  );
}
