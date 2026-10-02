'use client';

// ============================================================
// AvertissementsLivre.tsx — Repères de contenu d'une fiche livre
// (chantier W2 / idée E5).
//
// Rendus AVANT le lecteur (monté au-dessus d'EspaceLivre) :
//   1. classification d'âge + avertissements/tropes, spoilers masqués ;
//   2. si le livre est « sensible » (classification mature/explicite
//      ou au moins un avertissement grave), un écran d'avertissement
//      plein écran à valider par un clic — mémorisé pour la session ;
//   3. pour le propriétaire : édition (tags proposés + saisie libre)
//      et validation des propositions automatiques.
//
// Aucune proposition automatique n'est écrite sans action explicite.
// Motion : les classes d'animation sont neutralisées globalement par
// la règle `prefers-reduced-motion` de globals.css.
// ============================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AlertTriangle, Eye, EyeOff, ShieldAlert, Tag } from 'lucide-react';
import { creerClientNavigateur } from '@/lib/supabase/client';
import {
  CLASSIFICATIONS,
  classificationSensible,
  cleRepere,
  type Avertissement,
  type ClassificationAge,
  type NouveauRepere,
  type PropositionRepere,
} from '@/lib/types';
import EditeurAvertissements from '@/components/EditeurAvertissements';

const CLE_ACQUITTEMENT = 'plume:reperes-vus:';

/** Abonnement inerte : l'acquittement ne change pas en cours de vue. */
const ABONNEMENT_INERTE = () => () => {};

const COLONNES =
  'id, livre_id, categorie, libelle, spoiler, grave, origine, created_at';

interface Props {
  livreId: string;
  titre: string;
  classificationInitiale: ClassificationAge;
  avertissementsInitiaux: Avertissement[];
  /** Propositions issues du texte source — vide si non-propriétaire. */
  propositions: PropositionRepere[];
  estProprietaire: boolean;
}

export default function AvertissementsLivre({
  livreId,
  titre,
  classificationInitiale,
  avertissementsInitiaux,
  propositions,
  estProprietaire,
}: Props) {
  const supabaseRef = useRef(creerClientNavigateur());

  const [avertissements, setAvertissements] = useState(avertissementsInitiaux);
  const [classification, setClassification] = useState(classificationInitiale);
  const [spoilersVisibles, setSpoilersVisibles] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sensibleInitial =
    classificationSensible(classificationInitiale) ||
    avertissementsInitiaux.some((a) => a.grave);

  // Écran d'avertissement : rendu côté serveur quand le livre est
  // sensible, puis retiré si l'acquittement de la session est présent.
  const dejaAcquitte = useSyncExternalStore(
    ABONNEMENT_INERTE,
    () => {
      try {
        return window.sessionStorage.getItem(CLE_ACQUITTEMENT + livreId) === '1';
      } catch {
        return false;
      }
    },
    () => false
  );
  const [acquitteDansLaVue, setAcquitteDansLaVue] = useState(false);
  const verrouVisible = sensibleInitial && !dejaAcquitte && !acquitteDansLaVue;

  const acquitter = useCallback(() => {
    try {
      window.sessionStorage.setItem(CLE_ACQUITTEMENT + livreId, '1');
    } catch {
      // Stockage indisponible (navigation privée stricte) : l'écran
      // reste masqué pour cette vue.
    }
    setAcquitteDansLaVue(true);
  }, [livreId]);

  useEffect(() => {
    if (!verrouVisible) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') acquitter();
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [verrouVisible, acquitter]);

  // ---------- Écritures (RLS : seules les lignes du propriétaire) ----------

  async function ajouterRepere(repere: NouveauRepere) {
    if (occupe) return;
    const libelle = repere.libelle.trim();
    if (!libelle) return;
    if (avertissements.some((a) => cleRepere(a.libelle) === cleRepere(libelle))) {
      setMessage('Ce repère est déjà présent.');
      return;
    }
    setOccupe(true);
    setMessage(null);
    const { data, error } = await supabaseRef.current
      .from('avertissements')
      .insert({ livre_id: livreId, ...repere, libelle })
      .select(COLONNES)
      .single();
    setOccupe(false);
    if (error || !data) {
      setMessage(error?.message ?? 'Ajout impossible.');
      return;
    }
    setAvertissements((precedent) => [...precedent, data as Avertissement]);
    setMessage('Repère ajouté.');
  }

  async function ajouterPropositions(liste: PropositionRepere[]) {
    if (occupe || liste.length === 0) return;
    setOccupe(true);
    setMessage(null);
    const lignes = liste.map((p) => ({
      livre_id: livreId,
      libelle: p.libelle,
      categorie: p.categorie,
      spoiler: false,
      grave: p.grave,
      origine: 'suggestion_acceptee' as const,
    }));
    const { data, error } = await supabaseRef.current
      .from('avertissements')
      .insert(lignes)
      .select(COLONNES);
    setOccupe(false);
    if (error || !data) {
      setMessage(error?.message ?? 'Ajout des propositions impossible.');
      return;
    }
    setAvertissements((precedent) => [...precedent, ...(data as Avertissement[])]);
    setMessage(
      `${data.length} proposition${data.length > 1 ? 's' : ''} validée${data.length > 1 ? 's' : ''}.`
    );
  }

  async function supprimerRepere(id: string) {
    if (occupe) return;
    setOccupe(true);
    setMessage(null);
    const { error } = await supabaseRef.current
      .from('avertissements')
      .delete()
      .eq('id', id);
    setOccupe(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setAvertissements((precedent) => precedent.filter((a) => a.id !== id));
  }

  async function basculerChamp(
    repere: Avertissement,
    champ: 'spoiler' | 'grave'
  ) {
    if (occupe) return;
    const valeur = !repere[champ];
    setOccupe(true);
    setMessage(null);
    const { error } = await supabaseRef.current
      .from('avertissements')
      .update({ [champ]: valeur })
      .eq('id', repere.id);
    setOccupe(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setAvertissements((precedent) =>
      precedent.map((a) => (a.id === repere.id ? { ...a, [champ]: valeur } : a))
    );
  }

  async function changerClassification(nouvelle: ClassificationAge) {
    const ancienne = classification;
    setClassification(nouvelle);
    setOccupe(true);
    setMessage(null);
    const { error } = await supabaseRef.current
      .from('livres')
      .update({ classification_age: nouvelle })
      .eq('id', livreId);
    setOccupe(false);
    if (error) {
      setClassification(ancienne);
      setMessage(error.message);
    }
  }

  // ---------- Affichage ----------

  const avertissementsSeuls = avertissements.filter(
    (a) => a.categorie === 'avertissement'
  );
  const tropesSeuls = avertissements.filter((a) => a.categorie === 'trope');
  const nbSpoilers = avertissements.filter((a) => a.spoiler).length;
  const classement = CLASSIFICATIONS[classification];

  function pastille(a: Avertissement) {
    const masque = a.spoiler && !spoilersVisibles;
    return (
      <li
        key={a.id}
        className="inline-flex items-center gap-1.5 rounded-pilule border border-nuit-700
          bg-nuit-850 px-2.5 py-1 text-[12px] text-encre-100"
      >
        {a.grave && (
          <span
            className="size-1.5 rounded-full bg-grenat-500"
            aria-hidden="true"
            title="Avertissement grave"
          />
        )}
        {masque ? (
          <span className="italic text-encre-500" title="Libellé masqué (spoiler)">
            Spoiler masqué
          </span>
        ) : (
          <span>{a.libelle}</span>
        )}
      </li>
    );
  }

  return (
    <>
      {/* ---------- Écran d'avertissement (livre sensible) ---------- */}
      {verrouVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-nuit-950/95
            p-4 backdrop-blur-sm animate-fondu-monte"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="titre-verrou-reperes"
          aria-describedby="texte-verrou-reperes"
        >
          <div
            className="w-full max-w-lg rounded-carte border border-grenat-700
              bg-nuit-900 p-6 shadow-[var(--ombre-carte)]"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-6 shrink-0 text-grenat-400" aria-hidden="true" />
              <h2 id="titre-verrou-reperes" className="font-display text-lg text-encre-100">
                Contenu sensible — « {titre} »
              </h2>
            </div>

            <p
              id="texte-verrou-reperes"
              className="mt-4 text-sm leading-relaxed text-encre-300"
            >
              Ce livre est classé{' '}
              <strong className="text-grenat-300">{classement.libelle}</strong>
              {avertissements.some((a) => a.grave) && (
                <>
                  {' '}
                  et signale au moins un avertissement grave
                </>
              )}
              . Vérifiez les repères ci-dessous avant de continuer.
            </p>

            <ul className="mt-4 flex flex-wrap gap-1.5">
              {avertissements
                .filter((a) => a.grave && !(a.spoiler && !spoilersVisibles))
                .map((a) => (
                  <li
                    key={a.id}
                    className="rounded-pilule border border-grenat-700 bg-grenat-700/20
                      px-2.5 py-1 text-[12px] text-encre-100"
                  >
                    {a.libelle}
                  </li>
                ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                autoFocus
                onClick={acquitter}
                className="rounded-pilule bg-grenat-600 px-4 py-2 text-sm font-medium text-white
                  transition-colors hover:bg-grenat-500 focus-visible:outline
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-grenat-300"
              >
                J&apos;ai lu et je comprends — continuer
              </button>
              <Link
                href="/bibliotheque"
                className="text-[13px] text-encre-500 underline-offset-4 hover:text-encre-300 hover:underline"
              >
                Retour à la bibliothèque
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Bloc de repères de la fiche ---------- */}
      <section
        aria-label="Repères de contenu"
        className="mb-6 rounded-carte border border-nuit-700 bg-nuit-900/60 px-4 py-4"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <ShieldAlert className="size-4 text-grenat-400" aria-hidden="true" />
          <h2 className="text-sm font-medium text-encre-100">Repères de contenu</h2>
          <span
            className={`rounded-pilule border px-2.5 py-0.5 text-[11px] ${
              classement.sensible
                ? 'border-grenat-600 bg-grenat-700/25 text-grenat-300'
                : 'border-nuit-700 bg-nuit-850 text-encre-300'
            }`}
          >
            {classement.libelle}
          </span>

          {nbSpoilers > 0 && (
            <button
              type="button"
              onClick={() => setSpoilersVisibles((v) => !v)}
              aria-pressed={spoilersVisibles}
              className="ml-auto inline-flex items-center gap-1.5 rounded-pilule border
                border-nuit-700 bg-nuit-850 px-2.5 py-1 text-[11px] text-encre-300
                transition-colors hover:border-grenat-400 hover:text-encre-100"
            >
              {spoilersVisibles ? (
                <EyeOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
              {spoilersVisibles
                ? 'Masquer les spoilers'
                : `Afficher les spoilers (${nbSpoilers})`}
            </button>
          )}
        </div>

        {avertissements.length === 0 ? (
          <p className="mt-3 text-[12px] text-encre-500">
            {estProprietaire
              ? 'Aucun repère renseigné pour ce livre.'
              : "Le propriétaire n'a pas renseigné de repères."}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {avertissementsSeuls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-encre-500">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Avertissements
                </span>
                <ul className="flex flex-wrap gap-1.5">
                  {avertissementsSeuls.map(pastille)}
                </ul>
              </div>
            )}
            {tropesSeuls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-encre-500">
                  <Tag className="size-3" aria-hidden="true" />
                  Tropes
                </span>
                <ul className="flex flex-wrap gap-1.5">
                  {tropesSeuls.map(pastille)}
                </ul>
              </div>
            )}
          </div>
        )}

        {estProprietaire && (
          <div className="mt-4">
            <EditeurAvertissements
              classification={classification}
              onChangerClassification={changerClassification}
              avertissements={avertissements}
              propositions={propositions}
              occupe={occupe}
              onAjouter={ajouterRepere}
              onAjouterPropositions={ajouterPropositions}
              onSupprimer={supprimerRepere}
              onBasculerChamp={basculerChamp}
            />
          </div>
        )}

        {message && (
          <p role="status" className="mt-2 text-[12px] text-encre-500">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
