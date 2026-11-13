'use client';

// ============================================================
// components/collections/PanneauCollections.tsx — Interface des
// collections personnelles (A14/F22) : créer, renommer, décrire,
// ranger des livres, retirer, supprimer. Listes PRIVÉES.
// ============================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface CollectionClient {
  id: string;
  titre: string;
  description: string | null;
  livres: Array<{ id: string; titre: string }>;
}

export interface LivreBibliotheque {
  id: string;
  titre: string;
  auteur: string | null;
}

export default function PanneauCollections({
  collections,
  bibliotheque,
}: {
  collections: CollectionClient[];
  bibliotheque: LivreBibliotheque[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState('');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [ajoutOuvert, setAjoutOuvert] = useState<string | null>(null);
  const [choixLivre, setChoixLivre] = useState('');

  const envoyer = (corps: Record<string, unknown>, apres?: () => void) => {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const donnees = (await reponse.json()) as { erreur?: string };
        if (!reponse.ok) {
          setErreur(donnees.erreur ?? 'Opération refusée.');
          return;
        }
        apres?.();
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  };

  const creer = () => {
    if (!titre.trim()) {
      setErreur('Donnez un titre à la collection.');
      return;
    }
    envoyer(
      { action: 'creer', titre, description: description || undefined },
      () => {
        setTitre('');
        setDescription('');
      }
    );
  };

  return (
    <div className="space-y-6">
      {erreur && (
        <p
          role="alert"
          className="rounded-lg border border-grenat-700/60 bg-grenat-950/40 px-4 py-2.5 text-sm text-grenat-200"
        >
          {erreur}
        </p>
      )}

      <section className="velours p-5 rounded-2xl space-y-3" aria-label="Nouvelle collection">
        <h2 className="sur-titre text-encre-300">Nouvelle collection</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-encre-400">
            Titre
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              maxLength={120}
              placeholder="À relire cet hiver"
              className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
          </label>
          <label className="block text-sm text-encre-400">
            Description (facultative)
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              placeholder="Pourquoi cette liste existe"
              className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={creer}
          disabled={enCours}
          className="bouton-principal cursor-pointer disabled:opacity-50"
        >
          Créer la collection
        </button>
      </section>

      {collections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
          Aucune collection pour l’instant. Une collection, c’est votre
          rayonnage : des livres de VOTRE bibliothèque, rangés à votre façon.
        </p>
      ) : (
        <ul className="space-y-4">
          {collections.map((col) => (
            <li key={col.id} className="velours p-5 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg text-encre-100">{col.titre}</h3>
                  {col.description && (
                    <p className="mt-0.5 text-xs text-encre-500">{col.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const prochain = window.prompt('Nouveau titre', col.titre);
                      if (prochain && prochain.trim()) {
                        envoyer({ action: 'renommer', id: col.id, titre: prochain });
                      }
                    }}
                    className="bouton-fantome !min-h-8 !px-2 text-xs cursor-pointer"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${col.titre} » et son rangement ?`)) {
                        envoyer({ action: 'supprimer', id: col.id });
                      }
                    }}
                    className="rounded-lg px-2 py-1 text-xs text-grenat-300 hover:bg-white/[0.06] cursor-pointer"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              <ol className="mt-3 space-y-1.5">
                {col.livres.map((livre, i) => (
                  <li
                    key={livre.id}
                    className="flex items-center gap-2 rounded-lg border border-nuit-700/70 px-3 py-2 text-sm text-encre-200"
                  >
                    <span className="text-xs text-encre-500 w-5">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{livre.titre}</span>
                    <button
                      type="button"
                      onClick={() => envoyer({ action: 'retirer', id: col.id, livreId: livre.id })}
                      className="text-xs text-grenat-300 hover:bg-white/[0.06] rounded-lg px-2 py-1 cursor-pointer"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
                {col.livres.length === 0 && (
                  <li className="text-xs text-encre-500 px-3 py-2">
                    Collection vide : ajoutez un livre de votre bibliothèque.
                  </li>
                )}
              </ol>

              {ajoutOuvert === col.id ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block text-sm text-encre-400 flex-1 min-w-48">
                    Livre à ranger
                    <select
                      value={choixLivre}
                      onChange={(e) => setChoixLivre(e.target.value)}
                      className="champ-sombre select-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                    >
                      <option value="">Choisir dans la bibliothèque…</option>
                      {bibliotheque
                        .filter((l) => !col.livres.some((c) => c.id === l.id))
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.titre}
                            {l.auteur ? ` — ${l.auteur}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!choixLivre || enCours}
                    onClick={() => {
                      envoyer(
                        { action: 'ajouter', id: col.id, livreId: choixLivre },
                        () => {
                          setChoixLivre('');
                          setAjoutOuvert(null);
                        }
                      );
                    }}
                    className="bouton-principal !min-h-10 cursor-pointer disabled:opacity-40"
                  >
                    Ranger
                  </button>
                  <button
                    type="button"
                    onClick={() => setAjoutOuvert(null)}
                    className="bouton-fantome !min-h-10 cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setChoixLivre('');
                    setAjoutOuvert(col.id);
                  }}
                  className="mt-3 bouton-fantome !min-h-9 text-xs cursor-pointer"
                >
                  Ajouter un livre
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
