'use client';

// ============================================================
// components/lecteur/PanneauEcouter.tsx — Panneau « Écouter ce
// chapitre » (F9), portage de la maquette (ReaderTts.vue) :
//   * Play / Pause / Stop avec l'état annoncé en clair
//     (« Paragraphe X sur Y ») ;
//   * vitesse en boutons segmentés, voix de l'appareil (françaises
//     d'abord), message d'échec de synthèse ;
//   * AUCUN envoi de texte à un serveur : la synthèse est locale.
//
// Le contrôle (useVoix) appartient au lecteur : ce panneau n'est
// qu'une vue. Le paragraphe en cours est surligné dans le texte.
// ============================================================

import { Pause, Play, Square } from 'lucide-react';

import { VITESSES, type ControleVoix } from './useVoix';

const LIBELLES_VITESSE = (v: number) => `×${String(v).replace('.', ',')}`;

export default function PanneauEcouter({ voix }: { voix: ControleVoix }) {
  return (
    <div className="space-y-5">
      <section aria-label="Lecture à voix haute">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-display text-lg text-encre-100">Voix de l’appareil</h3>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
            Gratuit
          </span>
        </div>

        {!voix.disponible ? (
          <p className="rounded-lg border border-nuit-700 bg-nuit-850 p-3 text-sm text-encre-400">
            La lecture à voix haute n’est pas disponible sur ce navigateur ou cet
            appareil. Le texte reste lisible normalement ; essayez un autre
            navigateur pour activer la synthèse vocale.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-encre-500">
              La voix de votre appareil lit le chapitre. Aucun texte n’est envoyé
              à un serveur.
            </p>

            <div className="flex items-center gap-2">
              {voix.statut === 'lecture' ? (
                <button
                  type="button"
                  onClick={voix.mettreEnPause}
                  aria-label="Mettre la lecture en pause"
                  className="bouton-principal grid h-11 w-11 place-items-center !px-0"
                >
                  <Pause size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={voix.demarrer}
                  disabled={voix.total === 0}
                  aria-label={
                    voix.statut === 'pause'
                      ? 'Reprendre la lecture'
                      : 'Lancer la lecture'
                  }
                  className="bouton-principal grid h-11 w-11 place-items-center !px-0 disabled:opacity-40"
                >
                  <Play size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={voix.arreter}
                disabled={voix.statut === 'arret'}
                aria-label="Arrêter la lecture"
                className="bouton-fantome grid h-11 w-11 place-items-center !px-0 disabled:opacity-35"
              >
                <Square size={14} aria-hidden="true" />
              </button>
              <span
                className="ml-1 text-[13px] text-encre-400 tabular-nums"
                aria-live="polite"
              >
                {voix.statut === 'arret'
                  ? 'À l’arrêt'
                  : voix.statut === 'pause'
                    ? 'En pause'
                    : `Paragraphe ${voix.index + 1} sur ${voix.total}`}
              </span>
            </div>

            {/* Vitesse — boutons segmentés (maquette). */}
            <div className="mt-5">
              <p className="mb-2 text-[13px] text-encre-400">Vitesse</p>
              <div
                role="radiogroup"
                aria-label="Vitesse de lecture"
                className="flex flex-wrap gap-1"
              >
                {VITESSES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={voix.vitesse === v}
                    onClick={() => voix.changerVitesse(v)}
                    className={`min-h-10 flex-1 rounded-lg border px-2 text-xs transition-colors cursor-pointer ${
                      voix.vitesse === v
                        ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
                        : 'border-nuit-700 text-encre-500 hover:text-encre-300'
                    }`}
                  >
                    {LIBELLES_VITESSE(v)}
                  </button>
                ))}
              </div>
            </div>

            {/* Voix — sélection locale, conservée d'une séance à l'autre. */}
            <div className="mt-4">
              <label
                htmlFor="voix-ecouter"
                className="mb-1.5 block text-[13px] text-encre-400"
              >
                Voix
              </label>
              <select
                id="voix-ecouter"
                className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
                value={voix.voixPreferee ?? ''}
                onChange={(e) => voix.changerVoix(e.target.value)}
              >
                <option value="">Voix par défaut de l’appareil</option>
                {voix.voix.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              {voix.voix.filter((v) => v.lang.toLowerCase().startsWith('fr')).length ===
                0 && (
                <p className="mt-1 text-xs text-encre-500">
                  Aucune voix française détectée : la voix par défaut de l’appareil
                  sera utilisée.
                </p>
              )}
            </div>

            {voix.echec && (
              <p className="mt-3 text-sm text-grenat-300" role="alert">
                La lecture s’est interrompue. Relancez-la ou choisissez une autre
                voix.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
