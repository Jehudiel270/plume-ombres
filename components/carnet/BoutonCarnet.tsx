'use client';

// ============================================================
// BoutonCarnet.tsx — Prendre une note / citer un passage depuis le
// lecteur (F2). La SÉLECTION courante du chapitre est capturée telle
// quelle ; un passage vide → note libre seule. L'écriture passe par
// /api/carnet (interrupteur, plan et plafonds revérifiés côté
// serveur) : ce bouton n'écrit jamais la base directement.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TypeCarnet } from '@/lib/carnet';

const LIBELLES: Record<TypeCarnet, string> = {
  note: 'Note',
  citation: 'Citation',
  surlignage: 'Surlignage',
};

interface Props {
  livreId: string;
  chapitreId: string | null;
  chapitreTitre: string | null;
}

export default function BoutonCarnet({ livreId, chapitreId, chapitreTitre }: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [extrait, setExtrait] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [type, setType] = useState<TypeCarnet>('citation');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const ouvrirFormulaire = () => {
    const selection = (window.getSelection()?.toString() ?? '').trim();
    setExtrait(selection);
    setType(selection ? 'citation' : 'note');
    setMessage(null);
    setOuvert((o) => !o);
  };

  const enregistrer = async () => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/carnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livreId,
          chapitreId,
          type,
          extrait,
          annotation,
          chapitreTitre,
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Échec de l’enregistrement.' });
        return;
      }
      setMessage({ ton: 'ok', texte: 'Conservé dans votre carnet.' });
      setExtrait('');
      setAnnotation('');
      router.refresh();
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={ouvrirFormulaire}
        aria-expanded={ouvert}
        className={`min-h-11 text-xs px-2.5 ${ouvert ? 'bouton-principal' : 'bouton-fantome'}`}
        title="Prendre une note ou citer un passage (le texte sélectionné est repris)"
      >
        Carnet
      </button>
      {ouvert && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] velours p-4 rounded-2xl shadow-2xl space-y-3"
          role="dialog"
          aria-label="Ajouter au carnet"
        >
          {extrait && (
            <p className="text-xs text-encre-500 italic line-clamp-3 border-l-2 border-grenat-700 pl-2">
              « {extrait.slice(0, 240)}
              {extrait.length > 240 ? '…' : ''} »
            </p>
          )}
          <div className="flex gap-1" role="group" aria-label="Type d'entrée">
            {(Object.keys(LIBELLES) as TypeCarnet[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={`flex-1 min-h-9 text-xs ${type === t ? 'bouton-principal' : 'bouton-fantome'}`}
              >
                {LIBELLES[t]}
              </button>
            ))}
          </div>
          <textarea
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            placeholder="Votre note (facultative avec un passage sélectionné)…"
            rows={3}
            className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
          />
          {message && (
            <p
              role="status"
              className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
            >
              {message.texte}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={enregistrer}
              className="bouton-principal flex-1 min-h-10 text-sm disabled:opacity-40"
            >
              Conserver
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="bouton-fantome min-h-10 text-sm"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
