'use client';

// ============================================================
// components/lecteur/PanneauxAide.tsx — Aide à la reprise (F10) et
// questions sur l'intrigue (F6), panneaux de la feuille du lecteur.
//
// Portage de la maquette (ReaderRecap.vue / ReaderQa.vue) adapté au
// projet réel : la maquette lisait des données de démonstration,
// ici chaque appel passe par /api/livres/[id]/assistance — le
// SERVEUR construit le contexte avec les chapitres ≤ position :
// rien de la suite ne peut fuiter. PREMIUM : les panneaux ne sont
// montés que si l'interrupteur `reprise` est ouvert.
// ============================================================

import { useState } from 'react';

interface ReponseAssistance {
  resume?: { contenu: string; jusquPosition: number; enCache: boolean } | null;
  reponse?: string;
  message?: string;
  erreur?: string;
}

async function appelerAssistance(
  livreId: string,
  corps: Record<string, unknown>
): Promise<{ ok: true; donnees: ReponseAssistance } | { ok: false; erreur: string }> {
  try {
    const reponse = await fetch(`/api/livres/${livreId}/assistance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as ReponseAssistance;
    if (!reponse.ok) {
      return {
        ok: false,
        erreur: donnees.erreur ?? 'L’aide à la lecture est indisponible.',
      };
    }
    return { ok: true, donnees };
  } catch {
    return { ok: false, erreur: 'Réseau indisponible.' };
  }
}

// ------------------------------------------------------------
// Résumé (F10) — portage de ReaderRecap
// ------------------------------------------------------------

export function PanneauResume({ livreId, chapitreLu }: { livreId: string; chapitreLu: number }) {
  const [enCours, setEnCours] = useState(false);
  const [resume, setResume] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const resumer = async () => {
    setEnCours(true);
    setErreur(null);
    const sortie = await appelerAssistance(livreId, { action: 'resume', chapitreLu });
    setEnCours(false);
    if (!sortie.ok) {
      setErreur(sortie.erreur);
      return;
    }
    setResume(sortie.donnees.resume?.contenu ?? sortie.donnees.message ?? null);
  };

  return (
    <div className="rounded-xl border border-nuit-700/70 bg-nuit-850/60 p-4">
      <p className="sur-titre text-encre-500 mb-1.5">Jusqu’au chapitre {chapitreLu}</p>
      {resume ? (
        <p className="font-display text-[17px] leading-relaxed text-encre-100 whitespace-pre-line">
          {resume}
        </p>
      ) : (
        <p className="text-sm text-encre-500 leading-relaxed">
          Un résumé discret de l’intrigue lue, pour reprendre sans replonger dans
          les chapitres passés.
        </p>
      )}
      <button
        type="button"
        onClick={resumer}
        disabled={enCours}
        className="bouton-fantome mt-3 min-h-10 text-xs disabled:opacity-40"
      >
        {enCours ? 'Résumé en préparation…' : resume ? 'Rafraîchir le résumé' : 'Préparer le résumé'}
      </button>
      {erreur && <p className="mt-2 text-xs text-grenat-300">{erreur}</p>}
      <p className="mt-3 text-xs text-encre-500">
        Ce résumé ne mentionne rien au-delà de votre chapitre lu.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Questions (F6) — portage de ReaderQa
// ------------------------------------------------------------

export function PanneauQuestions({ livreId, chapitreLu }: { livreId: string; chapitreLu: number }) {
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [reponse, setReponse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const demander = async () => {
    if (question.trim().length < 3 || enCours) return;
    setEnCours(true);
    setErreur(null);
    const sortie = await appelerAssistance(livreId, {
      action: 'question',
      question,
      chapitreLu,
    });
    setEnCours(false);
    if (!sortie.ok) {
      setErreur(sortie.erreur);
      return;
    }
    setReponse(sortie.donnees.reponse ?? null);
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-encre-500 leading-relaxed">
        Les réponses ne s’appuient que sur les {chapitreLu} premiers chapitres,
        ceux que vous avez lus.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void demander();
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Posez votre question"
          aria-label="Votre question"
          className="champ-sombre flex-1 min-w-0 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />
        <button
          type="submit"
          disabled={question.trim().length < 3 || enCours}
          className="bouton-principal min-h-11 px-4 text-xs disabled:opacity-40"
        >
          {enCours ? 'Réflexion…' : 'Demander'}
        </button>
      </form>
      {reponse && (
        <div className="rounded-xl border border-nuit-700/70 bg-nuit-850/60 p-4" aria-live="polite">
          <p className="text-sm leading-relaxed text-encre-200 whitespace-pre-line">
            {reponse}
          </p>
        </div>
      )}
      {erreur && <p className="text-xs text-grenat-300">{erreur}</p>}
      <p className="text-[11px] text-encre-500 italic leading-relaxed">
        Si la lecture ne l’a pas encore révélé, l’aide le dit plutôt que d’inventer.
      </p>
    </div>
  );
}
