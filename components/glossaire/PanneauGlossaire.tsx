'use client';

// ============================================================
// components/glossaire/PanneauGlossaire.tsx — Gestion du glossaire
// (F16). Sélecteur de livre, candidats proposés, table des entrées
// (édition en place, verrou, suppression) et formulaire d'ajout.
// Toutes les écritures passent par /api/glossaire, qui revalide
// l'interrupteur, la propriété du livre et la forme des données.
// ============================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CandidatGlossaire, CategorieGlossaire, EntreeGlossaire } from '@/lib/types';

export interface LivreGlossaire {
  id: string;
  titre: string;
  updated_at: string;
}

const CATEGORIES: readonly CategorieGlossaire[] = [
  'personnage',
  'lieu',
  'terme',
  'autre',
];

const LIBELLES_CATEGORIE: Record<CategorieGlossaire, string> = {
  personnage: 'Personnage',
  lieu: 'Lieu',
  terme: 'Terme',
  autre: 'Autre',
};

function SelecteurCategorie({
  valeur,
  onChange,
  id,
}: {
  valeur: CategorieGlossaire;
  onChange: (v: CategorieGlossaire) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      className="champ-sombre select-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-2.5 py-2 text-sm text-encre-100"
      value={valeur}
      onChange={(e) => onChange(e.target.value as CategorieGlossaire)}
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {LIBELLES_CATEGORIE[c]}
        </option>
      ))}
    </select>
  );
}

function BandeauMessage({ message }: { message: { ton: 'ok' | 'erreur'; texte: string } | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={
        'text-sm px-3 py-2 rounded-lg border ' +
        (message.ton === 'ok'
          ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
          : 'text-grenat-300 border-grenat-500/40 bg-grenat-500/10')
      }
    >
      {message.texte}
    </p>
  );
}

export default function PanneauGlossaire({
  livres,
  livreId,
  entrees: entreesInitiales,
  candidats: candidatsInitiaux,
}: {
  livres: LivreGlossaire[];
  livreId: string | null;
  entrees: EntreeGlossaire[];
  candidats: CandidatGlossaire[];
}) {
  const router = useRouter();
  const [entrees, setEntrees] = useState(entreesInitiales);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [enCours, setEnCours] = useState(false);

  // Formulaire d'ajout.
  const [source, setSource] = useState('');
  const [traduction, setTraduction] = useState('');
  const [categorie, setCategorie] = useState<CategorieGlossaire>('personnage');
  const [verrouillee, setVerrouillee] = useState(true);

  // Traductions en cours de saisie pour les candidats (clé = source).
  const [traductionsCandidats, setTraductionsCandidats] = useState<
    Record<string, string>
  >({});

  // Édition en place.
  const [editionId, setEditionId] = useState<number | null>(null);
  const [editionSource, setEditionSource] = useState('');
  const [editionTraduction, setEditionTraduction] = useState('');
  const [editionCategorie, setEditionCategorie] = useState<CategorieGlossaire>('autre');

  // Candidats écartés par l'utilisateur (client uniquement).
  const [candidatsEcartes, setCandidatsEcartes] = useState<Set<string>>(new Set());
  const candidatsAffiches = candidatsInitiaux.filter(
    (c) => !candidatsEcartes.has(c.source)
  );

  async function appeler(
    methode: 'POST' | 'PATCH' | 'DELETE',
    corps: Record<string, unknown>
  ): Promise<boolean> {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/glossaire', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
        entree?: EntreeGlossaire;
      };
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
  }

  async function ajouter(
    sourceTexte: string,
    traductionTexte: string,
    cat: CategorieGlossaire,
    verrou: boolean
  ): Promise<boolean> {
    if (!livreId) return false;
    const ok = await appeler('POST', {
      livreId,
      source: sourceTexte,
      traduction: traductionTexte,
      categorie: cat,
      verrouillee: verrou,
    });
    if (!ok) return false;
    setMessage({ ton: 'ok', texte: `« ${sourceTexte.trim()} » enregistré.` });
    router.refresh();
    return true;
  }

  if (livres.length === 0) {
    return (
      <p className="velours p-6 rounded-2xl text-sm text-encre-300">
        Importez d’abord un livre : le glossaire accompagne vos traductions.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sélecteur de livre */}
      <section className="velours p-5 rounded-2xl space-y-2" aria-labelledby="titre-livre-glossaire">
        <h2 id="titre-livre-glossaire" className="sur-titre text-encre-300">
          Livre concerné
        </h2>
        <label className="block text-xs text-encre-500">
          Vos livres
          <select
            className="champ-sombre select-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            value={livreId ?? ''}
            onChange={(e) => {
              const valeur = e.target.value;
              router.push(valeur ? `/glossaire?livre=${valeur}` : '/glossaire');
            }}
          >
            <option value="">Choisir un livre…</option>
            {livres.map((l) => (
              <option key={l.id} value={l.id}>
                {l.titre}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!livreId ? (
        <p className="text-sm text-encre-500 italic">
          Choisissez un livre pour voir et gérer son glossaire.
        </p>
      ) : (
        <>
          <BandeauMessage message={message} />

          {/* Candidats détectés automatiquement */}
          {candidatsAffiches.length > 0 && (
            <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="titre-candidats">
              <h2 id="titre-candidats" className="sur-titre text-encre-300">
                Propositions détectées dans le texte
              </h2>
              <p className="text-xs text-encre-500">
                Noms propres récurrents relevés dans les premiers chapitres. La
                traduction ne se devine jamais : à vous de la fixer.
              </p>
              <ul className="space-y-3">
                {candidatsAffiches.map((candidat) => (
                  <li
                    key={candidat.source}
                    className="rounded-xl border border-nuit-700 bg-nuit-900/40 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-encre-100">
                        {candidat.source}
                      </span>
                      <span className="text-xs text-encre-500">
                        {candidat.occurrences} occurrence
                        {candidat.occurrences > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xs text-encre-500 italic truncate">
                      « {candidat.exemple} »
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        className="champ-sombre flex-1 min-w-40 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                        placeholder="Traduction imposée…"
                        value={traductionsCandidats[candidat.source] ?? ''}
                        onChange={(e) =>
                          setTraductionsCandidats((t) => ({
                            ...t,
                            [candidat.source]: e.target.value,
                          }))
                        }
                        aria-label={`Traduction de ${candidat.source}`}
                      />
                      <button
                        type="button"
                        disabled={enCours}
                        className="bouton-principal min-h-11 text-sm"
                        onClick={async () => {
                          const cle = candidat.source;
                          const trad = (traductionsCandidats[cle] ?? '').trim();
                          if (!trad) {
                            setMessage({
                              ton: 'erreur',
                              texte: 'Donnez d’abord la traduction imposée.',
                            });
                            return;
                          }
                          const ok = await ajouter(candidat.source, trad, 'autre', false);
                          if (ok) {
                            setCandidatsEcartes((s) => new Set(s).add(candidat.source));
                            setTraductionsCandidats((t) => {
                              const copie = { ...t };
                              delete copie[cle];
                              return copie;
                            });
                          }
                        }}
                      >
                        Ajouter
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        className="bouton-fantome min-h-11 text-sm"
                        onClick={() =>
                          setCandidatsEcartes((s) => new Set(s).add(candidat.source))
                        }
                      >
                        Ignorer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Formulaire d'ajout */}
          <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="titre-ajout">
            <h2 id="titre-ajout" className="sur-titre text-encre-300">
              Ajouter un terme
            </h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
              <label className="block text-xs text-encre-500">
                Terme source
                <input
                  type="text"
                  className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="ex. Kaelen"
                />
              </label>
              <label className="block text-xs text-encre-500">
                Traduction imposée
                <input
                  type="text"
                  className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
                  value={traduction}
                  onChange={(e) => setTraduction(e.target.value)}
                  placeholder="ex. Kaelen (invariant)"
                />
              </label>
              <SelecteurCategorie valeur={categorie} onChange={setCategorie} />
              <button
                type="button"
                disabled={enCours || !source.trim() || !traduction.trim()}
                className="bouton-principal min-h-12 text-sm disabled:opacity-40"
                onClick={async () => {
                  const ok = await ajouter(source, traduction, categorie, verrouillee);
                  if (ok) {
                    setSource('');
                    setTraduction('');
                  }
                }}
              >
                Enregistrer
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-encre-300">
              <input
                type="checkbox"
                className="size-4"
                checked={verrouillee}
                onChange={(e) => setVerrouillee(e.target.checked)}
              />
              Verrouillée (jamais remplacée par une suggestion automatique)
            </label>
          </section>

          {/* Table des entrées */}
          <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="titre-entrees">
            <h2 id="titre-entrees" className="sur-titre text-encre-300">
              {entrees.length} entrée{entrees.length > 1 ? 's' : ''}
            </h2>
            {entrees.length === 0 ? (
              <p className="text-sm text-encre-500 italic">
                Aucun terme pour l’instant : les traductions à venir respecteront
                le glossaire que vous construisez ici.
              </p>
            ) : (
              <ul className="divide-y divide-nuit-700/60">
                {entrees.map((entree) => (
                  <li key={entree.id} className="py-3 space-y-2">
                    {editionId === entree.id ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto] items-end">
                        <input
                          type="text"
                          className="champ-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                          value={editionSource}
                          onChange={(e) => setEditionSource(e.target.value)}
                          aria-label="Terme source"
                        />
                        <input
                          type="text"
                          className="champ-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                          value={editionTraduction}
                          onChange={(e) => setEditionTraduction(e.target.value)}
                          aria-label="Traduction imposée"
                        />
                        <SelecteurCategorie
                          valeur={editionCategorie}
                          onChange={setEditionCategorie}
                        />
                        <button
                          type="button"
                          disabled={enCours}
                          className="bouton-principal min-h-11 text-sm"
                          onClick={async () => {
                            const ok = await appeler('PATCH', {
                              id: entree.id,
                              source: editionSource,
                              traduction: editionTraduction,
                              categorie: editionCategorie,
                            });
                            if (ok) {
                              setEntrees((es) =>
                                es.map((e) =>
                                  e.id === entree.id
                                    ? {
                                        ...e,
                                        source: editionSource.trim(),
                                        traduction: editionTraduction.trim(),
                                        categorie: editionCategorie,
                                      }
                                    : e
                                )
                              );
                              setEditionId(null);
                              setMessage({ ton: 'ok', texte: 'Entrée mise à jour.' });
                            }
                          }}
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          className="bouton-fantome min-h-11 text-sm"
                          onClick={() => setEditionId(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-encre-100">
                            <span className="font-display">{entree.source}</span>
                            <span className="text-encre-500"> → </span>
                            {entree.traduction}
                          </p>
                          <p className="text-xs text-encre-500">
                            {LIBELLES_CATEGORIE[entree.categorie]}
                            {entree.verrouillee ? ' · verrouillée' : ''}
                            {entree.occurrences > 0
                              ? ` · ${entree.occurrences} occurrence${entree.occurrences > 1 ? 's' : ''}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={enCours}
                            title={
                              entree.verrouillee
                                ? 'Déverrouiller (les suggestions pourront la remplacer)'
                                : 'Verrouiller (jamais remplacée par une suggestion)'
                            }
                            aria-pressed={entree.verrouillee}
                            className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9"
                            onClick={async () => {
                              const ok = await appeler('PATCH', {
                                id: entree.id,
                                verrouillee: !entree.verrouillee,
                              });
                              if (ok) {
                                setEntrees((es) =>
                                  es.map((e) =>
                                    e.id === entree.id
                                      ? { ...e, verrouillee: !e.verrouillee }
                                      : e
                                  )
                                );
                              }
                            }}
                          >
                            {entree.verrouillee ? 'Déverrouiller' : 'Verrouiller'}
                          </button>
                          <button
                            type="button"
                            disabled={enCours}
                            className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9"
                            onClick={() => {
                              setEditionId(entree.id);
                              setEditionSource(entree.source);
                              setEditionTraduction(entree.traduction);
                              setEditionCategorie(entree.categorie);
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            disabled={enCours}
                            className="bouton-fantome !px-2.5 !py-1.5 text-xs min-h-9 text-grenat-300"
                            onClick={async () => {
                              const ok = await appeler('DELETE', { id: entree.id });
                              if (ok) {
                                setEntrees((es) => es.filter((e) => e.id !== entree.id));
                                setMessage({ ton: 'ok', texte: 'Entrée supprimée.' });
                              }
                            }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
