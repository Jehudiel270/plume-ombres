'use client';

// ============================================================
// PanneauIaGraphe.tsx — GÉNÉRATION IA DE LA TOILE NARRATIVE
// (F25-IA), pour le PROPRIÉTAIRE du livre.
//
// · CHOIX DU NIVEAU DE DÉTAILS (essentiel / détaillé / exhaustif) :
//   chaque niveau ajuste ce que le modèle doit recenser ;
// · PALIER D'ANALYSE : « jusqu'au chapitre N » — l'IA ne reçoit que
//   le texte des chapitres lus (anti-spoilers par construction) ;
// · RÉVISION OBLIGATOIRE : la proposition arrive cochée par
//   éléments, on peut décocher chaque personnage / relation /
//   événement avant d'ajouter ;
// · CLÉS INVISIBLES : l'appel part vers notre serveur, qui consomme
//   le réservoir « Clés API » — aucune clé n'apparaît dans la page.
// ============================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Loader2, Sparkles, Wand2 } from 'lucide-react';

import { NIVEAUX_DETAIL, type NiveauDetailIa } from '@/lib/graphe-ia';

interface PersonnageP {
  nom: string;
  role: string;
  importance: number;
  description: string | null;
  premierePosition: number | null;
}
interface RelationP {
  nomOrigine: string;
  nomDestination: string;
  libelle: string;
  type: string;
  sens: string;
  intensite: number;
  etat: string | null;
  fiabilite: string;
  premierePosition: number | null;
}
interface EvenementP {
  position: number;
  genre: string;
  titre: string;
  texte: string | null;
  personnages: string[];
}
interface Proposition {
  personnages: PersonnageP[];
  relations: RelationP[];
  evenements: EvenementP[];
  jusquPosition: number;
  niveauDetail: NiveauDetailIa;
}

const LIBELLE_IMPORTANCE: Record<number, string> = { 3: 'principal', 2: 'notable', 1: 'secondaire' };

export default function PanneauIaGraphe({
  livreId,
  positionMax,
}: {
  livreId: string;
  positionMax: number;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [niveau, setNiveau] = useState<NiveauDetailIa>('detaille');
  const [palier, setPalier] = useState<number>(positionMax);
  const [proposition, setProposition] = useState<Proposition | null>(null);

  const [occupe, setOccupe] = useState<'non' | 'genere' | 'applique'>('non');
  const [erreur, setErreur] = useState('');
  const [retour, setRetour] = useState('');

  // Sélections (tout coché par défaut).
  const [coches, setCoches] = useState<Record<string, boolean>>({});
  const [sections, setSections] = useState<Record<'personnages' | 'relations' | 'evenements', boolean>>({
    personnages: true,
    relations: true,
    evenements: true,
  });

  const [, demarrerTransition] = useTransition();

  const clePersonnage = (i: number) => `p${i}`;
  const cleRelation = (i: number) => `r${i}`;
  const cleEvenement = (i: number) => `e${i}`;

  const cocherTout = (p: Proposition) => {
    const suivant: Record<string, boolean> = {};
    p.personnages.forEach((_, i) => (suivant[clePersonnage(i)] = true));
    p.relations.forEach((_, i) => (suivant[cleRelation(i)] = true));
    p.evenements.forEach((_, i) => (suivant[cleEvenement(i)] = true));
    setCoches(suivant);
    setSections({ personnages: true, relations: true, evenements: true });
  };

  const generer = () => {
    setErreur('');
    setRetour('');
    setProposition(null);
    setOccupe('genere');
    demarrerTransition(async () => {
      try {
        const reponse = await fetch(`/api/livres/${livreId}/graphe/ia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'proposer', niveauDetail: niveau, chapitreLu: palier }),
        });
        const donnees = (await reponse.json()) as {
          erreur?: string;
          proposition?: Proposition;
        };
        if (!reponse.ok || !donnees.proposition) {
          setErreur(donnees.erreur ?? 'La génération a échoué.');
          return;
        }
        setProposition(donnees.proposition);
        cocherTout(donnees.proposition);
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      } finally {
        setOccupe('non');
      }
    });
  };

  const appliquer = () => {
    if (!proposition) return;
    setErreur('');
    setRetour('');
    setOccupe('applique');
    demarrerTransition(async () => {
      try {
        const corps = {
          action: 'appliquer',
          proposition: {
            ...proposition,
            personnages: proposition.personnages.filter((_, i) => coches[clePersonnage(i)]),
            relations: proposition.relations.filter(
              (_, i) => coches[cleRelation(i)] && sections.relations
            ),
            evenements: proposition.evenements.filter(
              (_, i) => coches[cleEvenement(i)] && sections.evenements
            ),
          },
        };
        const reponse = await fetch(`/api/livres/${livreId}/graphe/ia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const donnees = (await reponse.json()) as {
          erreur?: string;
          personnagesAjoutes?: number;
          relationsAjoutees?: number;
          evenementsAjoutes?: number;
        };
        if (!reponse.ok) {
          setErreur(donnees.erreur ?? 'L’ajout a échoué.');
          return;
        }
        setRetour(
          `Toile enrichie : ${donnees.personnagesAjoutes ?? 0} personnage(s), ` +
            `${donnees.relationsAjoutees ?? 0} relation(s), ${donnees.evenementsAjoutes ?? 0} événement(s).`
        );
        setProposition(null);
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      } finally {
        setOccupe('non');
      }
    });
  };

  const enCours = occupe !== 'non';
  const niv = NIVEAUX_DETAIL.find((n) => n.id === niveau) ?? NIVEAUX_DETAIL[1]!;

  return (
    <section className="velours rounded-2xl p-5 space-y-4" aria-label="Génération assistée par IA">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center gap-3 text-left cursor-pointer"
        aria-expanded={ouvert}
      >
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-grenat-900/60 text-grenat-300">
          <Wand2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="font-display text-encre-100 block">
            Générer la toile avec l’IA
          </span>
          <span className="text-xs text-encre-500">
            Analyse de vos chapitres lus, proposition révisable — les clés restent sur le serveur.
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-encre-500 transition-transform ${ouvert ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {ouvert && (
        <div className="space-y-5 border-t border-nuit-700/60 pt-4">
          {/* Niveaux de détails */}
          <fieldset className="space-y-2">
            <legend className="text-sm text-encre-300 mb-1">
              Niveau de détails attendu
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {NIVEAUX_DETAIL.map((d) => (
                <label
                  key={d.id}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    niveau === d.id
                      ? 'border-grenat-500 bg-grenat-950/40'
                      : 'border-nuit-700 hover:border-nuit-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="niveau-detail"
                    value={d.id}
                    checked={niveau === d.id}
                    onChange={() => setNiveau(d.id)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-sm text-encre-100">
                    {d.libelle}
                    {niveau === d.id && (
                      <Check className="h-4 w-4 text-grenat-300" aria-hidden="true" />
                    )}
                  </span>
                  <span className="block mt-1 text-xs text-encre-500 leading-snug">
                    {d.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Palier d'analyse */}
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm text-encre-300">
              Analyser jusqu’au chapitre
              <select
                value={palier}
                onChange={(e) => setPalier(Number(e.target.value))}
                disabled={enCours}
                className="champ-sombre ml-2 rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              >
                {Array.from({ length: positionMax }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={generer}
              disabled={enCours || positionMax === 0}
              className="bouton-principal min-h-10 text-sm cursor-pointer disabled:opacity-40 inline-flex items-center gap-2"
            >
              {occupe === 'genere' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {occupe === 'genere' ? 'Analyse en cours…' : 'Générer la proposition'}
            </button>
          </div>
          <p className="text-xs text-encre-500 italic">
            {niv.description} L’analyse porte uniquement sur les chapitres lus —
            jamais sur la suite. Comptez une à deux minutes selon le volume.
          </p>

          {erreur && (
            <p role="alert" className="rounded-lg border border-grenat-700/60 bg-grenat-950/40 px-4 py-2.5 text-sm text-grenat-200">
              {erreur}
            </p>
          )}
          {retour && (
            <p role="status" className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-200">
              {retour}
            </p>
          )}

          {/* Révision de la proposition */}
          {proposition && (
            <div className="space-y-4 rounded-xl border border-nuit-700 bg-nuit-900/50 p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-encre-200">
                  Proposition : {proposition.personnages.length} personnage(s),{' '}
                  {proposition.relations.length} relation(s),{' '}
                  {proposition.evenements.length} événement(s) — jusqu’au chapitre{' '}
                  {proposition.jusquPosition}.
                </p>
                <span className="text-xs text-encre-500">
                  Décochez ce que vous refusez, puis ajoutez.
                </span>
              </header>

              {/* Personnages */}
              {proposition.personnages.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-encre-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections.personnages}
                      onChange={(e) =>
                        setSections((s) => ({ ...s, personnages: e.target.checked }))
                      }
                      className="accent-grenat-500"
                    />
                    Personnages
                  </label>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {proposition.personnages.map((p, i) => (
                      <li key={i}>
                        <label
                          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                            coches[clePersonnage(i)]
                              ? 'border-nuit-700 bg-nuit-850'
                              : 'border-nuit-800 opacity-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!coches[clePersonnage(i)]}
                            onChange={(e) =>
                              setCoches((c) => ({ ...c, [clePersonnage(i)]: e.target.checked }))
                            }
                            className="mt-0.5 accent-grenat-500"
                          />
                          <span>
                            <span className="text-encre-100">{p.nom}</span>{' '}
                            <span className="text-xs text-encre-500">
                              ({LIBELLE_IMPORTANCE[p.importance] ?? 'notable'}
                              {p.premierePosition ? `, ch. ${p.premierePosition}` : ''})
                            </span>
                            {p.description && (
                              <span className="block text-xs text-encre-500 mt-0.5">
                                {p.description}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Relations */}
              {proposition.relations.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-encre-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections.relations}
                      onChange={(e) =>
                        setSections((s) => ({ ...s, relations: e.target.checked }))
                      }
                      className="accent-grenat-500"
                    />
                    Relations
                  </label>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {proposition.relations.map((r, i) => (
                      <li key={i}>
                        <label
                          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                            coches[cleRelation(i)]
                              ? 'border-nuit-700 bg-nuit-850'
                              : 'border-nuit-800 opacity-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!coches[cleRelation(i)]}
                            onChange={(e) =>
                              setCoches((c) => ({ ...c, [cleRelation(i)]: e.target.checked }))
                            }
                            className="mt-0.5 accent-grenat-500"
                          />
                          <span className="text-encre-200">
                            {r.nomOrigine} <span className="italic text-grenat-300">{r.libelle}</span>{' '}
                            {r.nomDestination}
                            <span className="block text-xs text-encre-500">
                              {r.type}
                              {r.fiabilite !== 'fait' ? ` · ${r.fiabilite}` : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Événements */}
              {proposition.evenements.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-encre-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections.evenements}
                      onChange={(e) =>
                        setSections((s) => ({ ...s, evenements: e.target.checked }))
                      }
                      className="accent-grenat-500"
                    />
                    Événements de la chronologie
                  </label>
                  <ul className="grid gap-1.5">
                    {proposition.evenements.map((e, i) => (
                      <li key={i}>
                        <label
                          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                            coches[cleEvenement(i)]
                              ? 'border-nuit-700 bg-nuit-850'
                              : 'border-nuit-800 opacity-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!coches[cleEvenement(i)]}
                            onChange={(ev) =>
                              setCoches((c) => ({ ...c, [cleEvenement(i)]: ev.target.checked }))
                            }
                            className="mt-0.5 accent-grenat-500"
                          />
                          <span className="text-encre-200">
                            <span className="text-xs text-encre-500">Ch. {e.position}</span>{' '}
                            {e.titre}
                            {e.personnages.length > 0 && (
                              <span className="block text-xs text-encre-500">
                                {e.personnages.join(', ')}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={appliquer}
                  disabled={enCours}
                  className="bouton-principal min-h-10 text-sm cursor-pointer disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {occupe === 'applique' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {occupe === 'applique' ? 'Ajout en cours…' : 'Ajouter la sélection à la toile'}
                </button>
                <button
                  type="button"
                  onClick={() => setProposition(null)}
                  disabled={enCours}
                  className="bouton-fantome min-h-10 text-sm cursor-pointer disabled:opacity-40"
                >
                  Écarter la proposition
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
