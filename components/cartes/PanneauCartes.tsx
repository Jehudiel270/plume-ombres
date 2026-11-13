'use client';

// ============================================================
// PanneauCartes.tsx — Cartes de lecture partageables (F13).
//
// Le lecteur colle ou sélectionne son extrait (plafonné à 280
// caractères par lib/cartes), choisit le livre et le chapitre, voit
// l'aperçu SVG et télécharge la carte. Attribution et rappel de
// droits TOUJOURS présents (produits par lib/cartes, non contournables
// par l'interface). Aucune publication automatique.
// ============================================================

import { useMemo, useState } from 'react';

import { carteSvg, extraitPourCarte, MAX_EXTRAIT_CARTE } from '@/lib/cartes';

interface Props {
  livres: Array<{ id: string; titre: string }>;
  chapitres: Array<{ id: string; titre: string }>;
}

export default function PanneauCartes({ livres, chapitres }: Props) {
  const [livreId, setLivreId] = useState(livres[0]?.id ?? '');
  const [chapitreId, setChapitreId] = useState<string>('');
  const [extrait, setExtrait] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const titreLivre = livres.find((l) => l.id === livreId)?.titre ?? '';
  const chapitre = chapitres.find((c) => c.id === chapitreId)?.titre ?? null;
  const extraitBorne = extraitPourCarte(extrait);

  const svg = useMemo(
    () =>
      titreLivre && extraitBorne
        ? carteSvg({ extrait: extraitBorne, titreLivre, chapitre })
        : null,
    [titreLivre, extraitBorne, chapitre]
  );

  const telecharger = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carte-${titreLivre.slice(0, 30).replace(/\W+/g, '-').toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Carte téléchargée (SVG, ouvrable partout).');
  };

  const copier = async () => {
    if (!extraitBorne) return;
    try {
      await navigator.clipboard.writeText(
        `« ${extraitBorne} »\n— ${titreLivre}${chapitre ? `, ${chapitre}` : ''}\nLu sur Plume d'Ombres`
      );
      setMessage('Extrait et attribution copiés.');
    } catch {
      setMessage('Copie indisponible sur ce navigateur.');
    }
  };

  if (livres.length === 0) {
    return (
      <p className="velours p-6 rounded-2xl text-sm text-encre-300">
        Importez d’abord un livre : les cartes citent vos lectures.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Forme */}
      <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-forme-carte">
        <h2 id="titre-forme-carte" className="sur-titre text-encre-300">
          Composer la carte
        </h2>
        <select
          className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
          value={livreId}
          onChange={(e) => setLivreId(e.target.value)}
          aria-label="Livre cité"
        >
          {livres.map((l) => (
            <option key={l.id} value={l.id}>
              {l.titre}
            </option>
          ))}
        </select>
        <select
          className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
          value={chapitreId}
          onChange={(e) => setChapitreId(e.target.value)}
          aria-label="Chapitre cité (facultatif)"
        >
          <option value="">Sans référence de chapitre</option>
          {chapitres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titre}
            </option>
          ))}
        </select>
        <textarea
          value={extrait}
          onChange={(e) => setExtrait(e.target.value)}
          rows={4}
          placeholder="Collez le passage à citer (depuis le lecteur)…"
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
        />
        <p className="text-[11px] text-encre-500">
          {extraitBorne.length}/{MAX_EXTRAIT_CARTE} caractères — le plafond
          s’applique quoi qu’il arrive.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!svg}
            onClick={telecharger}
            className="bouton-principal min-h-10 text-sm disabled:opacity-40"
          >
            Télécharger (SVG)
          </button>
          <button
            type="button"
            disabled={!extraitBorne}
            onClick={copier}
            className="bouton-fantome min-h-10 text-sm disabled:opacity-40"
          >
            Copier avec attribution
          </button>
        </div>
        {message && (
          <p role="status" className="text-xs text-encre-400">
            {message}
          </p>
        )}
        <p className="text-[11px] text-encre-500 italic border-t border-nuit-700/60 pt-3">
          Une carte cite un passage, elle ne remplace pas l’œuvre : l’extrait
          reste un usage privé, et sa publication dépend des droits de
          l’ouvrage. L’attribution est toujours apposée.
        </p>
      </section>

      {/* Aperçu */}
      <section className="velours p-5 rounded-2xl" aria-labelledby="titre-apercu-carte">
        <h2 id="titre-apercu-carte" className="sur-titre text-encre-300 mb-3">
          Aperçu
        </h2>
        {svg ? (
          <div
            className="rounded-2xl overflow-hidden [&_svg]:w-full [&_svg]:h-auto"
            // Le SVG est produit par lib/cartes (échappé) : injection impossible.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-sm text-encre-300 italic">
            Choisissez un livre et collez un passage pour voir la carte.
          </p>
        )}
      </section>
    </div>
  );
}
