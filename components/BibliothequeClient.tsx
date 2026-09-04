'use client';

// Bibliothèque : grille des livres + zone d'import + suppression.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Livre } from '@/lib/types';
import { assainirProgression } from '@/lib/progression';
import type { ProgressionLecture } from '@/lib/progression';
import { CLEF_PROGRESSION } from '@/lib/progression';
import { creerClientNavigateur } from '@/lib/supabase/client';
import ZoneImport from './ZoneImport';

const ETIQUETTES_STATUT: Record<Livre['statut'], string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'Erreurs à reprendre',
};

const COULEURS_STATUT: Record<Livre['statut'], string> = {
  importe: 'bg-encre-500/15 text-encre-300',
  pret: 'bg-violet-rom-500/15 text-violet-rom-300',
  en_traduction: 'bg-grenat-500/15 text-grenat-300 animate-pouls-doux',
  traduit: 'bg-emerald-500/15 text-emerald-300',
  erreur: 'bg-amber-500/15 text-amber-300',
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  livresInitiaux: Livre[];
}

export default function BibliothequeClient({ livresInitiaux }: Props) {
  const routeur = useRouter();
  const [livres, setLivres] = useState<Livre[]>(livresInitiaux);
  const [suppression, setSuppression] = useState<string | null>(null);
  // Points de lecture mémorisés (localStorage) — lus côté client seulement
  // pour afficher le badge « Reprendre… » sur chaque carte.
  const [progressions, setProgressions] = useState<
    Record<string, ProgressionLecture>
  >({});

  useEffect(() => {
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      if (!brut) return;
      const p = assainirProgression(JSON.parse(brut));
      if (p) setProgressions({ [p.livreId]: p });
    } catch {
      /* stockage indisponible : pas de badge */
    }
  }, []);

  async function supprimer(livre: Livre) {
    if (
      !window.confirm(
        `Définitivement ? « ${livre.titre} » ne murmura plus.`
      )
    ) {
      return;
    }
    setSuppression(livre.id);
    const supabase = creerClientNavigateur();
    const { error } = await supabase.from('livres').delete().eq('id', livre.id);
    setSuppression(null);
    if (error) {
      window.alert(`Suppression impossible : ${error.message}`);
      return;
    }
    setLivres((l) => l.filter((x) => x.id !== livre.id));
    routeur.refresh();
  }

  return (
    <div className="space-y-8">
      <ZoneImport />

      {livres.length === 0 ? (
        <div className="velours p-12 text-center animate-fondu-monte">
          <p className="text-5xl mb-4 opacity-80">🖋️</p>
          <p className="text-encre-100 font-display text-2xl">
            Une page blanche vous tend les bras.
          </p>
          <p className="text-encre-500 text-sm mt-3 max-w-md mx-auto leading-relaxed italic">
            Déposez un premier manuscrit ci-dessus et laissez l’encre couler :
            le découpage, la traduction et la reprise sont automatiques.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {livres.map((livre, i) => (
            <article
              key={livre.id}
              className="carte-livre animate-fondu-monte group cursor-pointer"
              style={{ animationDelay: `${i * 60}ms` }}
              tabIndex={0}
              aria-label={`Ouvrir « ${livre.titre} »`}
              onClick={() => routeur.push(`/livres/${livre.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  routeur.push(`/livres/${livre.id}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-encre-100 leading-snug group-hover:text-grenat-300 transition-colors line-clamp-2">
                    {livre.titre}
                  </h3>
                  {livre.auteur && (
                    <p className="text-encre-500 text-xs mt-0.5 italic truncate">
                      {livre.auteur}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 ${COULEURS_STATUT[livre.statut]}`}
                >
                  {ETIQUETTES_STATUT[livre.statut]}
                </span>
              </div>

              <p className="text-[11px] text-encre-500 break-all min-w-0">
                {livre.langue_source.toUpperCase()} →{' '}
                {livre.langue_cible.toUpperCase()} · {livre.nom_fichier}
              </p>

              {progressions[livre.id] && (
                <div className="min-w-0">
                  <p
                    className="text-[11px] text-grenat-300/90 flex items-center gap-1.5"
                    title="Où vous en étiez la dernière fois"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-grenat-400 animate-pouls-doux shrink-0" />
                    Reprendre :{' '}
                    <span className="truncate">
                      {progressions[livre.id].libelle || 'lecture'}
                    </span>{' '}
                    · {Math.round(progressions[livre.id].ratio * 100)} %
                  </p>
                  {/* Barre de reprise : lecture d'un coup d'œil, mobile inclus */}
                  <div
                    className="mt-1.5 h-1 rounded-full bg-nuit-700/70 overflow-hidden"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-grenat-600 to-grenat-400"
                      style={{
                        width: `${Math.round(
                          progressions[livre.id].ratio * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-[11px] text-encre-500 mt-auto pt-2 border-t border-nuit-700/60">
                <span className="truncate min-w-0">
                  Ajouté le {dateCourte(livre.created_at)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    supprimer(livre);
                  }}
                  disabled={suppression === livre.id}
                  className="text-encre-500 hover:text-grenat-400 transition-colors cursor-pointer disabled:opacity-40 shrink-0 px-2 py-1 rounded-md hover:bg-grenat-500/10"
                  title="Supprimer le livre"
                >
                  {suppression === livre.id ? '…' : 'Supprimer'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
