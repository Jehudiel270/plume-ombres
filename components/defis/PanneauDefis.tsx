'use client';

// ============================================================
// components/defis/PanneauDefis.tsx — Interface des défis (F14).
//
// Création (titre, type, cible, échéance facultative), progression
// AFFICHÉE depuis les compteurs réels du compte (aucune saisie
// manuelle : impossible de tricher, impossible de régresser),
// modification du titre / de la cible / de l'échéance, suppression.
// Vouvoiement, aucun emoji, aucune relance.
// ============================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  etatDefi,
  GENRES_DEFIS,
  LIBELLES_GENRE,
  type CompteursLecture,
  type Defi,
  type EtatDefi,
} from '@/lib/defis';

const STYLE_ETAT: Record<EtatDefi, string> = {
  en_cours: 'border-nuit-700',
  atteint: 'border-grenat-600/70 velours',
  au_repos: 'border-nuit-800 opacity-70',
};

const LIBELLE_ETAT: Record<EtatDefi, string> = {
  en_cours: 'En cours',
  atteint: 'Atteint',
  au_repos: 'Au repos (échéance passée)',
};

export default function PanneauDefis({
  defis,
  compteurs,
}: {
  defis: Defi[];
  compteurs: CompteursLecture;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState('');
  const [ouvrirFormulaire, setOuvrirFormulaire] = useState(defis.length === 0);
  const [titre, setTitre] = useState('');
  const [genre, setGenre] = useState<(typeof GENRES_DEFIS)[number]>('chapitres');
  const [cible, setCible] = useState('10');
  const [echeance, setEcheance] = useState('');

  const aujourdHuiISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const envoyer = (corps: Record<string, unknown>, methode: 'POST' | 'PATCH' | 'DELETE', apres?: () => void) => {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch('/api/defis', {
          method: methode,
          headers: { 'Content-Type': 'application/json' },
          ...(methode === 'DELETE'
            ? undefined
            : { body: JSON.stringify(corps) }),
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
      setErreur('Donnez un titre à votre défi.');
      return;
    }
    envoyer(
      { titre, genre, cible: Number(cible), echeance: echeance || undefined },
      'POST',
      () => {
        setTitre('');
        setEcheance('');
        setOuvrirFormulaire(false);
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Compteurs réels — d'où vient la progression. */}
      <section className="velours p-5 rounded-2xl" aria-label="Compteurs du compte">
        <h2 className="sur-titre text-encre-300">Vos compteurs réels</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3 text-sm text-encre-200">
          <li className="rounded-xl border border-nuit-700/70 px-4 py-3">
            <span className="block text-2xl font-display text-encre-100">{compteurs.chapitres}</span>
            chapitres découverts
          </li>
          <li className="rounded-xl border border-nuit-700/70 px-4 py-3">
            <span className="block text-2xl font-display text-encre-100">{compteurs.livres}</span>
            livres terminés
          </li>
          <li className="rounded-xl border border-nuit-700/70 px-4 py-3">
            <span className="block text-2xl font-display text-encre-100">{compteurs.jours}</span>
            jours de lecture
          </li>
        </ul>
      </section>

      {erreur && (
        <p role="alert" className="rounded-lg border border-grenat-700/60 bg-grenat-950/40 px-4 py-2.5 text-sm text-grenat-200">
          {erreur}
        </p>
      )}

      {/* Création */}
      {ouvrirFormulaire ? (
        <section className="velours p-5 rounded-2xl space-y-3" aria-label="Nouveau défi">
          <h2 className="sur-titre text-encre-300">Nouveau défi</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-encre-400">
              Titre
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                maxLength={120}
                placeholder="Vingt chapitres avant Noël"
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
            <label className="block text-sm text-encre-400">
              Ce que l’on compte
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value as (typeof GENRES_DEFIS)[number])}
                className="champ-sombre select-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              >
                {GENRES_DEFIS.map((g) => (
                  <option key={g} value={g}>
                    {LIBELLES_GENRE[g]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-encre-400">
              Cible (1 à 1000)
              <input
                type="number"
                min={1}
                max={1000}
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
            <label className="block text-sm text-encre-400">
              Échéance (facultative)
              <input
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
                className="champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={creer}
              disabled={enCours}
              className="bouton-principal cursor-pointer disabled:opacity-50"
            >
              Poser le défi
            </button>
            {defis.length > 0 && (
              <button
                type="button"
                onClick={() => setOuvrirFormulaire(false)}
                className="bouton-fantome cursor-pointer"
              >
                Annuler
              </button>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOuvrirFormulaire(true)}
          className="bouton-fantome cursor-pointer"
        >
          Poser un nouveau défi
        </button>
      )}

      {/* Liste */}
      {defis.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
          Aucun défi pour l’instant. Un défi n’engage rien : c’est un repère,
          pas une obligation.
        </p>
      ) : (
        <ul className="space-y-3">
          {defis.map((d) => {
            const { etat, valeur, part } = etatDefi(d, compteurs, aujourdHuiISO);
            return (
              <li key={d.id} className={`p-4 rounded-2xl border ${STYLE_ETAT[etat]}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-encre-100">
                      {d.titre}{' '}
                      <span className="ml-1 text-xs text-encre-500">
                        · {LIBELLE_ETAT[etat]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-encre-500">
                      {LIBELLES_GENRE[d.genre]} : {valeur} sur {d.cible}
                      {d.echeance ? ` · échéance le ${d.echeance}` : ''}
                    </p>
                    <div
                      className="mt-2 h-2 rounded-full bg-nuit-800 overflow-hidden"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-grenat-600"
                        style={{ width: `${Math.round(part * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const prochain = window.prompt('Nouveau titre du défi', d.titre);
                        if (prochain && prochain.trim()) {
                          envoyer({ id: d.id, titre: prochain }, 'PATCH');
                        }
                      }}
                      className="bouton-fantome !min-h-8 !px-2 text-xs cursor-pointer"
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${d.titre} » ?`)) {
                          envoyerDelete(d.id);
                        }
                      }}
                      className="rounded-lg px-2 py-1 text-xs text-grenat-300 hover:bg-white/[0.06] cursor-pointer"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  function envoyerDelete(id: string) {
    setErreur('');
    demarrer(async () => {
      try {
        const reponse = await fetch(`/api/defis?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!reponse.ok) {
          const donnees = (await reponse.json()) as { erreur?: string };
          setErreur(donnees.erreur ?? 'Suppression refusée.');
          return;
        }
        router.refresh();
      } catch {
        setErreur('Réseau indisponible : réessayez.');
      }
    });
  }
}
