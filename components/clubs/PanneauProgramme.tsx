'use client';

// ============================================================
// PanneauProgramme.tsx — Programme de lecture par étapes (F11 v4).
// Quatre chapitres par semaine, un focus de discussion, étapes
// déverrouillées par le staff. Le plafond de discussion suit la
// dernière étape OUVERTE, croisé avec la position de chacun.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, Plus } from 'lucide-react';

import { CHAPITRES_PAR_ETAPE } from '@/lib/clubs';

export interface EtapeClub {
  numero: number;
  chapitreDe: number;
  chapitreA: number;
  focus: string;
  debloqueLe: string | null;
  ouverte: boolean;
}

export default function PanneauProgramme({
  clubId,
  etapes,
  dernierChapitreDebloque,
  maPosition,
  totalChapitres,
  estStaff,
}: {
  clubId: string;
  etapes: EtapeClub[];
  dernierChapitreDebloque: number | null;
  maPosition: number;
  totalChapitres: number;
  estStaff: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [notification, setNotification] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

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

  const agir = async (url: string, options: RequestInit, confirmation: string) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(url, options);
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Action refusée.',
      });
      return;
    }
    setNotification({ ton: 'ok', texte: confirmation });
    router.refresh();
  };

  const generer = () =>
    agir(
      `/api/clubs/${encodeURIComponent(clubId)}/etapes`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'generer',
          totalChapitres,
          parEtape: CHAPITRES_PAR_ETAPE,
        }),
      },
      'Programme posé : la première étape est ouverte.'
    );

  const ouvrirEtape = (numero: number) =>
    agir(
      `/api/clubs/${encodeURIComponent(clubId)}/etapes`,
      { method: 'PATCH', body: JSON.stringify({ numero }) },
      'Étape ouverte : la discussion s’y étend.'
    );

  // Première étape verrouillée (celle que le staff peut ouvrir) et
  // dernière ouverte (l'étape « en cours » du club).
  const prochaine = etapes.find((e) => !e.ouverte);
  const numeroEnCours = etapes.reduce<number | null>(
    (max, e) => (e.ouverte ? Math.max(max ?? 0, e.numero) : max),
    null
  );

  return (
    <section aria-labelledby="titre-programme" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titre-programme" className="font-display text-xl text-encre-100">
            Programme de lecture
          </h2>
          <p className="text-xs text-encre-500 mt-1">
            {CHAPITRES_PAR_ETAPE} chapitres par semaine, avec un focus de discussion.
            {dernierChapitreDebloque !== null && (
              <> Discussion ouverte jusqu’au chapitre {dernierChapitreDebloque}.</>
            )}
            {dernierChapitreDebloque !== null && maPosition < dernierChapitreDebloque && (
              <> Votre position ({maPosition}) reste le plafond de VOS lectures.</>
            )}
          </p>
        </div>
        {estStaff && (
          <button
            type="button"
            onClick={generer}
            disabled={enCours || totalChapitres < 1}
            className="bouton-fantome min-h-10 text-sm inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Plus size={14} aria-hidden="true" />
            {etapes.length === 0
              ? `Poser le programme (${CHAPITRES_PAR_ETAPE} ch./semaine)`
              : 'Refaire le programme'}
          </button>
        )}
      </div>

      {notification && (
        <p
          role="status"
          className={`text-xs ${notification.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
        >
          {notification.texte}
        </p>
      )}

      {etapes.length === 0 ? (
        <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
          {estStaff
            ? 'Posez le programme : le club lit par étapes, quatre chapitres par semaine.'
            : 'Le staff du club n’a pas encore posé de programme de lecture.'}
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {etapes.map((e) => {
              const passee = e.ouverte && e.numero !== numeroEnCours;
              const enCoursEtape = e.numero === numeroEnCours;
              return (
                <li
                  key={e.numero}
                  className="velours flex items-center gap-4 rounded-xl p-4"
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm ${
                      passee || enCoursEtape
                        ? 'border-or-ros-300/40 bg-or-ros-300/10 text-or-ros-300'
                        : 'border-nuit-700 text-encre-500'
                    }`}
                  >
                    {passee ? <Check size={16} /> : e.numero}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-encre-100">
                        Étape {e.numero} · chapitres {e.chapitreDe} à {e.chapitreA}
                      </span>
                      {passee && (
                        <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[11px] text-encre-500">
                          Terminée
                        </span>
                      )}
                      {enCoursEtape && (
                        <span className="rounded-full border border-or-ros-300/40 bg-or-ros-300/10 px-2 py-0.5 text-[11px] text-or-ros-300">
                          En cours
                        </span>
                      )}
                      {!e.ouverte && (
                        <span className="rounded-full border border-nuit-700 px-2 py-0.5 text-[11px] text-encre-500 inline-flex items-center gap-1">
                          <Lock size={9} aria-hidden="true" /> Verrouillée
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-encre-400 mt-0.5">
                      {e.ouverte ? e.focus : 'Discussion ouverte quand l’étape précédente est terminée.'}
                    </p>
                  </div>
                  {estStaff && !e.ouverte && e.numero === prochaine?.numero && (
                    <button
                      type="button"
                      onClick={() => ouvrirEtape(e.numero)}
                      disabled={enCours}
                      className="bouton-principal !min-h-9 text-xs disabled:opacity-40 cursor-pointer"
                    >
                      Ouvrir l’étape
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-encre-500">
            Le rythme du groupe ne force personne : vos messages au-delà de votre
            position de lecture restent à vous, jamais imposés aux autres — et
            réciproquement.
          </p>
        </>
      )}
    </section>
  );
}
