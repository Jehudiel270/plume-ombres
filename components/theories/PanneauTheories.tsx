'use client';

// ============================================================
// PanneauTheories.tsx — Théories personnelles (F8) + comparateur
// de cohérence (F19). Deux onglets :
//   · THÉORIES : hypothèses privées, statut traçant, étiquettes ;
//   · COMPARATEUR : comment mon terme a été rendu dans toute la
//     traduction (paires source ↔ traduit, bornées).
// Écritures via /api/theories ; le comparateur lit via GET sur la
// même route (interrupteur + plan revérifiés côté serveur).
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  libelleStatut,
  type PaireComparaison,
  type Theorie,
} from '@/lib/theories';

const STATUTS = ['ouverte', 'confirmee', 'infirmee'] as const;
type Statut = (typeof STATUTS)[number];

interface Props {
  livres: Array<{ id: string; titre: string }>;
  theories: Theorie[];
  livreId: string | null;
}

export default function PanneauTheories({ livres, theories, livreId }: Props) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<'theories' | 'comparateur'>('theories');

  // ---------- Théories ----------
  const [livreChoisi, setLivreChoisi] = useState(livreId ?? livres[0]?.id ?? '');
  const [titre, setTitre] = useState('');
  const [raisonnement, setRaisonnement] = useState('');
  const [etiquettes, setEtiquettes] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const appeler = async (
    methode: 'POST' | 'PATCH' | 'DELETE',
    corps: Record<string, unknown>
  ): Promise<boolean> => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/theories', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Échec de l’opération.' });
        return false;
      }
      return true;
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
      return false;
    } finally {
      setEnCours(false);
    }
  };

  const publier = async () => {
    if (await appeler('POST', { livreId: livreChoisi, titre, raisonnement, etiquettes })) {
      setTitre('');
      setRaisonnement('');
      setEtiquettes('');
      router.refresh();
    }
  };

  const trancher = async (id: string, statut: Statut) => {
    if (await appeler('PATCH', { id, statut })) router.refresh();
  };

  const supprimer = async (id: string) => {
    if (await appeler('DELETE', { id })) router.refresh();
  };

  // ---------- Comparateur ----------
  const [terme, setTerme] = useState('');
  const [paires, setPaires] = useState<PaireComparaison[] | null>(null);
  const [recherche, setRecherche] = useState(false);

  const comparer = async () => {
    setRecherche(true);
    setMessage(null);
    try {
      const parametres = new URLSearchParams({ livre: livreChoisi, terme });
      const reponse = await fetch(`/api/theories?${parametres.toString()}`);
      const donnees = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
        paires?: PaireComparaison[];
      };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Recherche impossible.' });
        setPaires(null);
        return;
      }
      setPaires(donnees.paires ?? []);
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
    } finally {
      setRecherche(false);
    }
  };

  if (livres.length === 0) {
    return (
      <p className="velours p-6 rounded-2xl text-sm text-encre-300">
        Importez d’abord un livre : les théories s’attachent à vos lectures.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1" role="tablist" aria-label="Onglets théories">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'theories'}
          onClick={() => setOnglet('theories')}
          className={`min-h-10 text-sm px-4 ${onglet === 'theories' ? 'bouton-principal' : 'bouton-fantome'}`}
        >
          Mes théories
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'comparateur'}
          onClick={() => setOnglet('comparateur')}
          className={`min-h-10 text-sm px-4 ${onglet === 'comparateur' ? 'bouton-principal' : 'bouton-fantome'}`}
        >
          Comparateur
        </button>
      </div>

      {message && (
        <p
          role="status"
          className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
        >
          {message.texte}
        </p>
      )}

      {onglet === 'theories' ? (
        <>
          {/* Nouvelle théorie */}
          <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-nouvelle-theorie">
            <h2 id="titre-nouvelle-theorie" className="sur-titre text-encre-300">
              Poser une hypothèse
            </h2>
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={livreChoisi}
              onChange={(e) => setLivreChoisi(e.target.value)}
              aria-label="Livre concerné"
            >
              {livres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titre}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Votre hypothèse en une phrase…"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <textarea
              value={raisonnement}
              onChange={(e) => setRaisonnement(e.target.value)}
              rows={3}
              placeholder="Sur quoi vous appuyez-vous ?"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <input
              type="text"
              value={etiquettes}
              onChange={(e) => setEtiquettes(e.target.value)}
              placeholder="Étiquettes séparées par des virgules (facultatif)"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <button
              type="button"
              disabled={enCours || titre.trim().length < 2 || !raisonnement.trim() || !livreChoisi}
              onClick={publier}
              className="bouton-principal min-h-11 text-sm disabled:opacity-40"
            >
              Consigner
            </button>
          </section>

          {/* Liste des théories */}
          {theories.length === 0 ? (
            <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
              Aucune théorie consignée. Elles restent dans votre atelier —
              personne d’autre ne les voit.
            </p>
          ) : (
            <ul className="space-y-4">
              {theories.map((t) => {
                const livre = livres.find((l) => l.id === t.livre_id);
                return (
                  <li key={t.id} className="velours p-5 rounded-2xl space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="sur-titre text-grenat-400">
                        {libelleStatut(t.statut)}
                      </span>
                      <span className="text-encre-500">{livre?.titre ?? 'Livre'}</span>
                      <span className="text-encre-500 ml-auto">
                        {new Date(t.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <h3 className="font-display text-lg text-encre-100">{t.titre}</h3>
                    <p className="text-sm text-encre-200 whitespace-pre-line">
                      {t.raisonnement}
                    </p>
                    {t.etiquettes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.etiquettes.map((e) => (
                          <span
                            key={e}
                            className="text-[11px] text-encre-400 border border-nuit-700 rounded-full px-2 py-0.5"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {STATUTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={enCours}
                          onClick={() => trancher(t.id, s)}
                          aria-pressed={t.statut === s}
                          className={`min-h-9 text-xs px-2.5 ${t.statut === s ? 'bouton-principal' : 'bouton-fantome'}`}
                        >
                          {libelleStatut(s)}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => supprimer(t.id)}
                        className="bouton-fantome min-h-9 text-xs text-grenat-400 ml-auto"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        /* Comparateur F19 */
        <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="titre-comparateur">
          <h2 id="titre-comparateur" className="sur-titre text-encre-300">
            Vérifier un terme dans toute la traduction
          </h2>
          <p className="text-xs text-encre-500 italic">
            Choisissez le livre, tapez le terme (source ou traduction) : le
            comparateur liste les passages concernés, dans l’ordre de lecture,
            pour vérifier la cohérence du rendu.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className="champ-sombre select-sombre flex-1 min-w-48 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={livreChoisi}
              onChange={(e) => setLivreChoisi(e.target.value)}
              aria-label="Livre à examiner"
            >
              {livres.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titre}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={terme}
              onChange={(e) => setTerme(e.target.value)}
              placeholder="Terme à vérifier : un nom, un surnom, une tournure…"
              className="champ-sombre flex-1 min-w-40 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <button
              type="button"
              disabled={recherche || terme.trim().length < 2}
              onClick={comparer}
              className="bouton-principal min-h-11 text-sm disabled:opacity-40"
            >
              Comparer
            </button>
          </div>

          {paires && (
            <div className="space-y-3">
              <p className="text-xs text-encre-500">
                {paires.length === 0
                  ? 'Aucun passage trouvé pour ce terme.'
                  : `${paires.length} passage${paires.length > 1 ? 's' : ''} trouvé${paires.length > 1 ? 's' : ''}.`}
              </p>
              {paires.map((p, i) => (
                <div
                  key={`${p.chapitreTitre}-${i}`}
                  className="rounded-xl border border-nuit-700/70 p-4 space-y-2"
                >
                  <p className="text-[11px] text-encre-500">{p.chapitreTitre}</p>
                  <p className="text-xs text-encre-500 italic">{p.source}</p>
                  <p className="text-sm text-encre-200">{p.traduit}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
