'use client';

// ============================================================
// PanneauSondages.tsx — Sondages du club (F11 v4). Création
// (question + 2 à 4 options), vote unique, répartition visible
// après le vote ou à la clôture — jamais avant : les résultats ne
// poussent personne à voter en suivant.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

import { MAX_OPTIONS_SONDAGE } from '@/lib/clubs';

export interface SondageClub {
  id: string;
  question: string;
  fermeLe: string;
  ouvert: boolean;
  mien: boolean;
  parMoi: boolean;
  monOption: string | null;
  total: number;
  options: Array<{ id: string; label: string; position: number }>;
  repartition: Record<string, number>;
}

const dateCourte = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function PanneauSondages({
  clubId,
  sondages,
}: {
  clubId: string;
  sondages: SondageClub[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [notification, setNotification] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [formulaire, setFormulaire] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const appeler = async (url: string, optionsRequete: RequestInit) => {
    try {
      const reponse = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...optionsRequete,
      });
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: reponse.ok, donnees };
    } catch {
      return { ok: false, donnees: { erreur: 'Réseau indisponible : réessayez.' } };
    }
  };

  const creer = async () => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/sondages`,
      {
        method: 'POST',
        body: JSON.stringify({
          question,
          options: options.filter((o) => o.trim()),
        }),
      }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Création refusée.',
      });
      return;
    }
    setFormulaire(false);
    setQuestion('');
    setOptions(['', '']);
    setNotification({ ton: 'ok', texte: 'Sondage publié.' });
    router.refresh();
  };

  const voter = async (sondageId: string, optionId: string) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/sondages/vote`,
      { method: 'POST', body: JSON.stringify({ sondageId, optionId }) }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Vote refusé.',
      });
      return;
    }
    setNotification({ ton: 'ok', texte: 'Vote enregistré.' });
    router.refresh();
  };

  const retirer = async (sondageId: string) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/sondages?sondageId=${encodeURIComponent(
        sondageId
      )}`,
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
    setNotification({ ton: 'ok', texte: 'Sondage retiré.' });
    router.refresh();
  };

  return (
    <section aria-labelledby="titre-sondages" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titre-sondages" className="font-display text-xl text-encre-100">
            Sondages du club
          </h2>
          <p className="text-xs text-encre-500 mt-1">
            Formats de rencontre, rythme de lecture, personnage à analyser : le
            groupe décide ensemble. Les résultats s’affichent après votre vote.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormulaire((v) => !v)}
          className="bouton-fantome min-h-10 text-sm inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} aria-hidden="true" /> Nouveau sondage
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
            creer();
          }}
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Votre question (200 caractères au plus)"
            className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            maxLength={200}
            required
          />
          {options.map((o, i) => (
            <input
              key={i}
              type="text"
              value={o}
              onChange={(e) =>
                setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
              }
              placeholder={`Option ${i + 1}${i > 1 ? ' (facultative)' : ''}`}
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              maxLength={120}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {options.length < MAX_OPTIONS_SONDAGE && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ''])}
                className="bouton-fantome !min-h-9 text-xs cursor-pointer"
              >
                Ajouter une option
              </button>
            )}
            <button
              type="submit"
              disabled={enCours || !question.trim() || options.filter((o) => o.trim()).length < 2}
              className="bouton-principal min-h-10 text-sm disabled:opacity-40 cursor-pointer"
            >
              Publier
            </button>
          </div>
        </form>
      )}

      {sondages.length === 0 ? (
        <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
          Aucun sondage pour l’instant : proposez-en un au groupe.
        </p>
      ) : (
        <ul className="space-y-4">
          {sondages.map((s) => {
            const montreResultats = s.parMoi || !s.ouvert;
            return (
              <li key={s.id} className="velours p-5 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-display text-lg text-encre-100 flex-1">{s.question}</h3>
                  {s.mien && (
                    <button
                      type="button"
                      onClick={() => retirer(s.id)}
                      disabled={enCours}
                      title="Retirer ce sondage"
                      aria-label="Retirer ce sondage"
                      className="text-encre-500 hover:text-grenat-400 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-encre-500">
                  {s.ouvert ? `Ouvert jusqu’au ${dateCourte(s.fermeLe)}` : `Clos le ${dateCourte(s.fermeLe)}`}
                  {' · '}
                  {s.total} vote{s.total > 1 ? 's' : ''}
                </p>
                <div className="space-y-2">
                  {s.options.map((o) => {
                    const votes = s.repartition[o.id] ?? 0;
                    const pourcentage =
                      montreResultats && s.total > 0
                        ? Math.round((votes / s.total) * 100)
                        : 0;
                    const monChoix = s.monOption === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={enCours || !s.ouvert || s.parMoi}
                        aria-pressed={monChoix}
                        onClick={() => voter(s.id, o.id)}
                        className={`relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm disabled:cursor-default cursor-pointer ${
                          monChoix ? 'border-grenat-400' : 'border-nuit-700 hover:border-nuit-600'
                        }`}
                      >
                        {montreResultats && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 bg-grenat-400/15"
                            style={{ width: `${pourcentage}%` }}
                          />
                        )}
                        <span className="relative flex justify-between gap-3 text-encre-200">
                          <span>
                            {o.label}
                            {monChoix && (
                              <span className="ml-2 text-xs text-grenat-400">Votre choix</span>
                            )}
                          </span>
                          {montreResultats && <span className="tnum">{pourcentage} %</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!s.parMoi && s.ouvert && (
                  <p className="text-xs text-encre-500">
                    Les résultats s’affichent après votre vote.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
