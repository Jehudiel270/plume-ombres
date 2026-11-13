'use client';

// ============================================================
// PanneauUnivers.tsx — Gestion des univers (F17) : création,
// renommage, ordre des tomes, retrait, suppression. Écritures via
// /api/univers (interrupteur + plan Illimité revérifiés serveur).
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  univers: Array<{
    id: string;
    titre: string;
    description: string | null;
    tomes: Array<{ livreId: string; titre: string; position: number }>;
  }>;
  livresDisponibles: Array<{ id: string; titre: string }>;
}

export default function PanneauUnivers({ univers, livresDisponibles }: Props) {
  const router = useRouter();
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const appeler = async (corps: Record<string, unknown>): Promise<boolean> => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/univers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Opération impossible.' });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
      return false;
    } finally {
      setEnCours(false);
    }
  };

  const creer = async () => {
    if (await appeler({ action: 'creer', titre, description })) {
      setTitre('');
      setDescription('');
    }
  };

  const supprimer = async (id: string) => {
    if (await appeler({ action: 'supprimer', id })) {
      setMessage({ ton: 'ok', texte: 'Univers supprimé (les livres restent intacts).' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Création */}
      <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-creer-univers">
        <h2 id="titre-creer-univers" className="sur-titre text-encre-300">
          Nouvel univers
        </h2>
        <input
          type="text"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre de la saga…"
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (facultative)…"
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />
        <button
          type="button"
          disabled={enCours || titre.trim().length === 0}
          onClick={creer}
          className="bouton-principal min-h-10 text-sm disabled:opacity-40"
        >
          Créer
        </button>
      </section>

      {message && (
        <p
          role="status"
          className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
        >
          {message.texte}
        </p>
      )}

      {/* Liste des univers */}
      {univers.length === 0 ? (
        <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
          Aucun univers encore : créez une saga et rattachez vos tomes.
        </p>
      ) : (
        <ul className="space-y-5">
          {univers.map((u) => (
            <li key={u.id} className="velours p-5 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg text-encre-100">{u.titre}</span>
                <span className="text-xs text-encre-500 ml-auto">
                  {u.tomes.length} tome{u.tomes.length > 1 ? 's' : ''}
                </span>
              </div>
              {u.description && (
                <p className="text-xs text-encre-400 italic">{u.description}</p>
              )}

              <ol className="space-y-1.5">
                {u.tomes.map((t, index) => (
                  <li
                    key={t.livreId}
                    className="flex flex-wrap items-center gap-2 text-sm border border-nuit-700/60 rounded-xl px-3 py-2"
                  >
                    <span className="text-grenat-400 text-xs w-6">T{index + 1}</span>
                    <span className="text-encre-100">{t.titre}</span>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => appeler({ action: 'retirer', id: u.id, livreId: t.livreId })}
                      className="bouton-fantome text-xs min-h-8 ml-auto text-grenat-400"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
                {u.tomes.length === 0 && (
                  <li className="text-xs text-encre-500 italic">
                    Aucun tome rattaché — choisissez un livre ci-dessous.
                  </li>
                )}
              </ol>

              <div className="flex flex-wrap gap-2 border-t border-nuit-700/60 pt-3">
                <select
                  className="champ-sombre select-sombre flex-1 min-w-48 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                  defaultValue=""
                  onChange={(e) => {
                    const livreId = e.target.value;
                    if (livreId) {
                      void appeler({
                        action: 'ajouter',
                        id: u.id,
                        livreId,
                        position: u.tomes.length + 1,
                      });
                      e.currentTarget.value = '';
                    }
                  }}
                  aria-label={`Ajouter un tome à ${u.titre}`}
                >
                  <option value="">Ajouter un tome…</option>
                  {livresDisponibles.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.titre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => supprimer(u.id)}
                  className="bouton-fantome min-h-10 text-xs text-grenat-400"
                >
                  Supprimer l’univers
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
