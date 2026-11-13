'use client';

// ============================================================
// AssistanceLecture.tsx — Aide à la reprise (F10) et questions (F6),
// panneau du lecteur. PREMIUM : monté seulement si l'interrupteur
// `reprise` est ouvert (évalué côté serveur).
//
// La position « chapitreLu » = chapitre OUVERT (le lecteur l'a en
// cours) ; le serveur construit le contexte du modèle avec les
// chapitres ≤ position : rien de la suite ne peut fuiter.
// ============================================================

import { useState } from 'react';

interface Props {
  livreId: string;
  /** Position (1 → n) du chapitre ouvert. */
  chapitreLu: number;
}

interface ResumeReponse {
  resume?: { contenu: string; jusquPosition: number; enCache: boolean } | null;
  reponse?: string;
  message?: string;
  erreur?: string;
}

export default function AssistanceLecture({ livreId, chapitreLu }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState<'resume' | 'question' | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [reponse, setReponse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const appeler = async (action: 'resume' | 'question', texte?: string) => {
    setEnCours(action);
    setErreur(null);
    try {
      const reponseHttp = await fetch(`/api/livres/${livreId}/assistance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, question: texte, chapitreLu }),
      });
      const donnees = (await reponseHttp.json().catch(() => ({}))) as ResumeReponse;
      if (!reponseHttp.ok) {
        setErreur(donnees.erreur ?? 'L’aide à la lecture est indisponible.');
        return;
      }
      if (action === 'resume') {
        setResume(donnees.resume?.contenu ?? donnees.message ?? null);
      } else {
        setReponse(donnees.reponse ?? null);
      }
    } catch {
      setErreur('Réseau indisponible.');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title="Résumé de votre avancée et questions sur ce que vous avez lu"
        className={`min-h-11 text-xs px-2.5 ${ouvert ? 'bouton-principal' : 'bouton-fantome'}`}
      >
        Reprise
      </button>
      {ouvert && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] velours p-4 rounded-2xl shadow-2xl space-y-4"
          role="dialog"
          aria-label="Aide à la reprise"
        >
          {/* F10 — Résumé */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="sur-titre text-encre-300">Où en étiez-vous</h3>
              <button
                type="button"
                disabled={enCours !== null}
                onClick={() => appeler('resume')}
                className="bouton-fantome text-xs min-h-8 ml-auto"
              >
                {resume ? 'Rafraîchir' : 'Résumer'}
              </button>
            </div>
            {resume ? (
              <p className="text-xs text-encre-300 whitespace-pre-line leading-relaxed border-l-2 border-grenat-700 pl-2">
                {resume}
              </p>
            ) : (
              <p className="text-[11px] text-encre-500 italic">
                Un résumé discret de l’intrigue lue, pour reprendre sans
                replonger dans les chapitres passés.
              </p>
            )}
          </div>

          {/* F6 — Questions anti-spoilers */}
          <div className="space-y-2 border-t border-nuit-700/60 pt-3">
            <h3 className="sur-titre text-encre-300">Question sur l’intrigue</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Qui est… ? Pourquoi… ?"
                className="champ-sombre flex-1 min-w-0 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && question.trim() && enCours === null) {
                    void appeler('question', question);
                  }
                }}
              />
              <button
                type="button"
                disabled={enCours !== null || question.trim().length < 3}
                onClick={() => appeler('question', question)}
                className="bouton-principal min-h-9 text-xs disabled:opacity-40"
              >
                Demander
              </button>
            </div>
            {reponse && (
              <p className="text-xs text-encre-300 whitespace-pre-line leading-relaxed">
                {reponse}
              </p>
            )}
            <p className="text-[10px] text-encre-500 italic">
              Les réponses s’appuient uniquement sur les chapitres que vous avez
              déjà lus : si la lecture ne l’a pas encore révélé, l’aide le dit.
            </p>
          </div>

          {enCours !== null && (
            <p className="text-xs text-encre-500 animate-pouls-doux" role="status">
              {enCours === 'resume' ? 'Résumé en préparation…' : 'Réflexion…'}
            </p>
          )}
          {erreur && <p className="text-xs text-grenat-400">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
