'use client';

// ============================================================
// EditeurAvertissements.tsx — Saisie/édition des repères de
// contenu par le PROPRIÉTAIRE du livre (chantier W2 / E5).
//
// Composant volontairement présentationnel : toute écriture
// Supabase est déléguée à AvertissementsLivre via les callbacks.
//   * classification d'âge (liste fermée) ;
//   * ajout d'un avertissement/trope : libellés proposés
//     (autocomplétion <datalist>) OU saisie libre ;
//   * validation des propositions automatiques (cases à cocher,
//     décochées par défaut : rien n'est appliqué silencieusement) ;
//   * suppression et bascule spoiler/grave des repères existants.
// ============================================================

import { useState } from 'react';
import { Eye, EyeOff, Plus, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import {
  CATALOGUE_AVERTISSEMENTS,
  CATALOGUE_TROPES,
  CLASSIFICATIONS,
  type Avertissement,
  type CategorieRepere,
  type ClassificationAge,
  type NouveauRepere,
  type PropositionRepere,
} from '@/lib/types';

const CLASSE_CHAMP =
  'rounded-lg border border-nuit-700 bg-nuit-900 px-3 py-2 text-sm text-encre-100 ' +
  'outline-none focus:border-grenat-400 focus:ring-2 focus:ring-grenat-500/40';

const CLASSE_BOUTON =
  'inline-flex items-center gap-1.5 rounded-full border border-nuit-700 bg-nuit-850 ' +
  'px-3 py-1.5 text-[11px] text-encre-300 transition-colors hover:border-grenat-400 ' +
  'hover:text-encre-100 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-grenat-400 disabled:opacity-50';

interface Props {
  classification: ClassificationAge;
  onChangerClassification: (classification: ClassificationAge) => void;
  avertissements: Avertissement[];
  propositions: PropositionRepere[];
  occupe: boolean;
  onAjouter: (repere: NouveauRepere) => void;
  onAjouterPropositions: (liste: PropositionRepere[]) => void;
  onSupprimer: (id: string) => void;
  onBasculerChamp: (repere: Avertissement, champ: 'spoiler' | 'grave') => void;
}

export default function EditeurAvertissements({
  classification,
  onChangerClassification,
  avertissements,
  propositions,
  occupe,
  onAjouter,
  onAjouterPropositions,
  onSupprimer,
  onBasculerChamp,
}: Props) {
  const [categorie, setCategorie] = useState<CategorieRepere>('avertissement');
  const [libelle, setLibelle] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [grave, setGrave] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const catalogue =
    categorie === 'avertissement' ? CATALOGUE_AVERTISSEMENTS : CATALOGUE_TROPES;

  function soumettreAjout(e: React.FormEvent) {
    e.preventDefault();
    if (!libelle.trim() || occupe) return;
    onAjouter({
      libelle: libelle.trim(),
      categorie,
      spoiler,
      grave: categorie === 'avertissement' ? grave : false,
      origine: 'manuel',
    });
    setLibelle('');
    setSpoiler(false);
    setGrave(false);
  }

  function basculerSelection(cle: string) {
    setSelection((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  }

  function validerPropositions() {
    if (selection.size === 0 || occupe) return;
    const retenues = propositions.filter((p) =>
      selection.has(`${p.categorie}:${p.libelle}`)
    );
    onAjouterPropositions(retenues);
    setSelection(new Set());
  }

  return (
    <details className="group rounded-carte border border-nuit-700 bg-nuit-900/70">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm
          text-encre-300 transition-colors hover:text-encre-100"
      >
        <ShieldAlert className="size-4 text-grenat-400" aria-hidden="true" />
        <span className="font-medium">Gérer les repères de contenu</span>
        <span className="ml-auto text-[11px] text-encre-500">
          propriétaire
        </span>
      </summary>

      <div className="flex flex-col gap-5 border-t border-nuit-700 px-4 py-4">
        {/* ---------- Classification d'âge ---------- */}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-encre-300">Classification d&apos;âge</span>
          <select
            className={CLASSE_CHAMP}
            value={classification}
            disabled={occupe}
            onChange={(e) =>
              onChangerClassification(e.target.value as ClassificationAge)
            }
          >
            {(Object.keys(CLASSIFICATIONS) as ClassificationAge[]).map((cle) => (
              <option key={cle} value={cle}>
                {CLASSIFICATIONS[cle].libelle}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-encre-500">
            {CLASSIFICATIONS[classification].aide}
          </span>
        </label>

        {/* ---------- Ajout manuel ---------- */}
        <form onSubmit={soumettreAjout} className="flex flex-col gap-2.5">
          <span className="text-sm text-encre-300">Ajouter un repère</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={CLASSE_CHAMP}
              value={categorie}
              disabled={occupe}
              aria-label="Catégorie du repère"
              onChange={(e) => setCategorie(e.target.value as CategorieRepere)}
            >
              <option value="avertissement">Avertissement</option>
              <option value="trope">Trope</option>
            </select>

            <input
              className={`${CLASSE_CHAMP} min-w-[14rem] flex-1`}
              list="catalogue-reperes"
              value={libelle}
              disabled={occupe}
              placeholder="Libellé libre ou proposé…"
              aria-label="Libellé du repère"
              onChange={(e) => setLibelle(e.target.value)}
            />
            <datalist id="catalogue-reperes">
              {catalogue.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>

            <button type="submit" className={CLASSE_BOUTON} disabled={occupe}>
              <Plus className="size-3.5" aria-hidden="true" />
              Ajouter
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[12px] text-encre-300">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-grenat-500"
                checked={spoiler}
                disabled={occupe}
                onChange={(e) => setSpoiler(e.target.checked)}
              />
              Spoiler (libellé masqué par défaut)
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-grenat-500"
                checked={grave}
                disabled={occupe || categorie === 'trope'}
                onChange={(e) => setGrave(e.target.checked)}
              />
              Grave (déclenche l&apos;écran d&apos;avertissement)
            </label>
          </div>
        </form>

        {/* ---------- Propositions automatiques ---------- */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-sm text-encre-300">
            <Sparkles className="size-4 text-violet-rom-300" aria-hidden="true" />
            Propositions automatiques
            <span className="text-[11px] text-encre-500">
              (à valider — rien n&apos;est enregistré sans votre accord)
            </span>
          </span>

          {propositions.length === 0 ? (
            <p className="text-[12px] text-encre-500">
              Aucune proposition détectée dans le texte source.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {propositions.map((p) => {
                  const cle = `${p.categorie}:${p.libelle}`;
                  return (
                    <li key={cle}>
                      <label className="inline-flex items-center gap-2 text-[12px] text-encre-100">
                        <input
                          type="checkbox"
                          className="accent-grenat-500"
                          checked={selection.has(cle)}
                          disabled={occupe}
                          onChange={() => basculerSelection(cle)}
                        />
                        <span>{p.libelle}</span>
                        <span className="rounded-pilule border border-nuit-700 px-1.5 text-[10px] text-encre-500">
                          {p.categorie === 'trope' ? 'trope' : 'avertissement'}
                        </span>
                        <span className="text-[11px] text-encre-500">
                          {p.occurrences} occurrence{p.occurrences > 1 ? 's' : ''}
                        </span>
                        {p.grave && (
                          <span className="text-[10px] text-grenat-400">grave</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div>
                <button
                  type="button"
                  className={CLASSE_BOUTON}
                  disabled={occupe || selection.size === 0}
                  onClick={validerPropositions}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Ajouter la sélection ({selection.size})
                </button>
              </div>
            </>
          )}
        </div>

        {/* ---------- Repères existants ---------- */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-encre-300">
            Repères enregistrés ({avertissements.length})
          </span>
          {avertissements.length === 0 ? (
            <p className="text-[12px] text-encre-500">Aucun repère pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {avertissements.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-nuit-700
                    bg-nuit-850 px-2.5 py-1.5 text-[12px] text-encre-100"
                >
                  <span>{a.libelle}</span>
                  <span className="rounded-pilule border border-nuit-700 px-1.5 text-[10px] text-encre-500">
                    {a.categorie}
                  </span>

                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-nuit-700
                      px-2 py-0.5 text-[10px] text-encre-300 hover:border-grenat-400"
                    disabled={occupe}
                    aria-pressed={a.spoiler}
                    onClick={() => onBasculerChamp(a, 'spoiler')}
                  >
                    {a.spoiler ? (
                      <EyeOff className="size-3" aria-hidden="true" />
                    ) : (
                      <Eye className="size-3" aria-hidden="true" />
                    )}
                    spoiler
                  </button>

                  {a.categorie === 'avertissement' && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-nuit-700
                        px-2 py-0.5 text-[10px] text-encre-300 hover:border-grenat-400"
                      disabled={occupe}
                      aria-pressed={a.grave}
                      onClick={() => onBasculerChamp(a, 'grave')}
                    >
                      grave
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-nuit-700
                      px-2 py-0.5 text-[10px] text-encre-300 hover:border-grenat-400 hover:text-grenat-300"
                    disabled={occupe}
                    aria-label={`Supprimer ${a.libelle}`}
                    onClick={() => onSupprimer(a.id)}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
