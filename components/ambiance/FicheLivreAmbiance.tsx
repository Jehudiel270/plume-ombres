'use client';

// ============================================================
// FicheLivreAmbiance.tsx — Édition en place de la fiche d'ambiance
// d'un livre (F5). Écriture via server action (module revérifié
// côté serveur), retour d'état local immédiat.
// ============================================================

import { useState, useTransition } from 'react';

import type { Intensite } from '@/lib/ambiance';
import { enregistrerFiche } from '@/app/ambiance/actions';

interface Props {
  livre: { id: string; titre: string };
  genresInitiaux: string[];
  tropesInitiaux: string[];
  intensiteInitiale: Intensite;
  intensites: readonly Intensite[];
  libelleIntensite: (i: Intensite) => string;
}

export default function FicheLivreAmbiance({
  livre,
  genresInitiaux,
  tropesInitiaux,
  intensiteInitiale,
  intensites,
  libelleIntensite,
}: Props) {
  const [enAttente, demarrer] = useTransition();
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [intensite, setIntensite] = useState<Intensite>(intensiteInitiale);

  const action = (formData: FormData) => {
    demarrer(async () => {
      const resultat = await enregistrerFiche(formData);
      setMessage(
        resultat.ok
          ? { ton: 'ok', texte: 'Fiche d’ambiance enregistrée.' }
          : { ton: 'erreur', texte: resultat.erreur ?? 'Enregistrement impossible.' }
      );
    });
  };

  return (
    <li className="velours p-5 rounded-2xl">
      <form action={action} className="space-y-3">
        <input type="hidden" name="livreId" value={livre.id} />
        <input type="hidden" name="intensite" value={intensite} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-encre-100">{livre.titre}</span>
          <span className="text-xs text-encre-500 ml-auto">
            Intensité : {libelleIntensite(intensite)}
          </span>
        </div>

        <div className="flex gap-1" role="group" aria-label={`Intensité de ${livre.titre}`}>
          {intensites.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIntensite(i)}
              aria-pressed={intensite === i}
              title={libelleIntensite(i)}
              className={`flex-1 min-h-9 text-xs ${intensite === i ? 'bouton-principal' : 'bouton-fantome'}`}
            >
              {i}
            </button>
          ))}
        </div>

        <input
          type="text"
          name="genres"
          defaultValue={genresInitiaux.join(', ')}
          placeholder="Genres, séparés par des virgules (gothique, dark academia…)"
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />
        <input
          type="text"
          name="tropes"
          defaultValue={tropesInitiaux.join(', ')}
          placeholder="Tropes (ennemis à amants, château hanté…)"
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={enAttente}
            className="bouton-principal min-h-10 text-sm disabled:opacity-40"
          >
            {enAttente ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {message && (
            <p
              role="status"
              className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
            >
              {message.texte}
            </p>
          )}
        </div>
      </form>
    </li>
  );
}
