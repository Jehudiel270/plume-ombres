'use client';

// Bibliothèque : grille des livres + zone d'import + suppression.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Livre } from '@/lib/types';
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

  async function supprimer(livre: Livre) {
    if (
      !window.confirm(
        `Supprimer définitivement « ${livre.titre} » ainsi que ses chapitres et sa traduction ?`
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
        <div className="velours p-10 text-center animate-fondu-monte">
          <p className="text-4xl mb-3">🖋️</p>
          <p className="text-encre-300 font-display text-xl">
            Votre bibliothèque est encore vide
          </p>
          <p className="text-encre-500 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Importez un premier manuscrit : le découpage en chapitres et en
            segments est automatique, la traduction se lance en un clic et
            peut être reprise à tout moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {livres.map((livre, i) => (
            <article
              key={livre.id}
              className="velours p-5 flex flex-col gap-3 hover:border-grenat-700 transition-colors animate-fondu-monte group cursor-pointer"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => routeur.push(`/livres/${livre.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-encre-100 leading-snug group-hover:text-grenat-300 transition-colors line-clamp-2">
                    {livre.titre}
                  </h3>
                  {livre.auteur && (
                    <p className="text-encre-500 text-xs mt-0.5 italic">
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

              <p className="text-[11px] text-encre-500">
                {livre.langue_source.toUpperCase()} →{' '}
                {livre.langue_cible.toUpperCase()} · {livre.nom_fichier}
              </p>

              <div className="flex items-center justify-between text-[11px] text-encre-500 mt-auto pt-2 border-t border-nuit-700/60">
                <span>Ajouté le {dateCourte(livre.created_at)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    supprimer(livre);
                  }}
                  disabled={suppression === livre.id}
                  className="text-encre-500 hover:text-grenat-400 transition-colors cursor-pointer disabled:opacity-40"
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
