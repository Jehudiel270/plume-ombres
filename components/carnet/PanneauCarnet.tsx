'use client';

// ============================================================
// PanneauCarnet.tsx — Gestion du carnet (F2) : filtres, liste,
// annotation éditable, suppression, EXPORT portable (F24).
//
// Règle de l'atelier : l'export ne contient JAMAIS le texte intégral
// — seulement les extraits plafonnés (800 caractères) et les notes
// du lecteur. L'export est réservé aux abonnés : `exportAutorise`
// est calculé CÔTÉ SERVEUR (plan effectif), jamais côté client.
// ============================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  exporterMarkdown,
  libelleType,
  type EntreeCarnet,
  type LivreCarnet,
  type TypeCarnet,
} from '@/lib/carnet';

const TYPES: readonly TypeCarnet[] = ['note', 'citation', 'surlignage'];

interface Props {
  livres: LivreCarnet[];
  entrees: EntreeCarnet[];
  livreId: string | null;
  exportAutorise: boolean;
}

function telecharger(nom: string, contenu: string, mime: string) {
  const blob = new Blob([contenu], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PanneauCarnet({
  livres,
  entrees,
  livreId,
  exportAutorise,
}: Props) {
  const router = useRouter();
  const [filtreType, setFiltreType] = useState<TypeCarnet | 'tous'>('tous');
  const [filtreLivre, setFiltreLivre] = useState<string>(livreId ?? 'tous');
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const titreLivre = useMemo(
    () => livres.find((l) => l.id === filtreLivre)?.titre ?? null,
    [livres, filtreLivre]
  );

  const affichees = useMemo(
    () =>
      entrees.filter(
        (e) =>
          (filtreType === 'tous' || e.type === filtreType) &&
          (filtreLivre === 'tous' || e.livre_id === filtreLivre)
      ),
    [entrees, filtreType, filtreLivre]
  );

  const appeler = async (
    methode: 'PATCH' | 'DELETE',
    corps: Record<string, unknown>
  ): Promise<boolean> => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/carnet', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
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
  };

  const supprimer = async (id: string) => {
    if (await appeler('DELETE', { id })) router.refresh();
  };

  const enregistrerAnnotation = async (id: string) => {
    if (await appeler('PATCH', { id, annotation: brouillon })) {
      setEdition(null);
      router.refresh();
    }
  };

  const exporter = (format: 'md' | 'json') => {
    const date = new Date().toISOString().slice(0, 10);
    const suffixe = titreLivre ? `-${titreLivre.slice(0, 40).replace(/\W+/g, '-')}` : '';
    if (format === 'json') {
      telecharger(
        `carnet${suffixe}-${date}.json`,
        JSON.stringify(affichees, null, 2),
        'application/json'
      );
      return;
    }
    telecharger(
      `carnet${suffixe}-${date}.md`,
      exporterMarkdown(affichees, { titreLivre }),
      'text/markdown'
    );
  };

  if (livres.length === 0) {
    return (
      <p className="velours p-6 rounded-2xl text-sm text-encre-300">
        Importez d’abord un livre : votre carnet accompagne vos lectures.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtres + export */}
      <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="titre-filtres">
        <h2 id="titre-filtres" className="sur-titre text-encre-300">
          Vos notes conservées
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="champ-sombre select-sombre rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
            value={filtreLivre}
            onChange={(e) => setFiltreLivre(e.target.value)}
            aria-label="Filtrer par livre"
          >
            <option value="tous">Tous les livres</option>
            {livres.map((l) => (
              <option key={l.id} value={l.id}>
                {l.titre}
              </option>
            ))}
          </select>
          <div className="flex gap-1" role="group" aria-label="Filtrer par type">
            <button
              type="button"
              onClick={() => setFiltreType('tous')}
              aria-pressed={filtreType === 'tous'}
              className={`min-h-10 text-xs px-3 ${filtreType === 'tous' ? 'bouton-principal' : 'bouton-fantome'}`}
            >
              Tout
            </button>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltreType(t)}
                aria-pressed={filtreType === t}
                className={`min-h-10 text-xs px-3 ${filtreType === t ? 'bouton-principal' : 'bouton-fantome'}`}
              >
                {libelleType(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Export F24 — décision calculée côté serveur */}
        <div className="flex flex-wrap items-center gap-3 border-t border-nuit-700/60 pt-4">
          <span className="text-xs text-encre-500">
            Export portable (extraits plafonnés, sans le texte intégral) :
          </span>
          {exportAutorise ? (
            <>
              <button
                type="button"
                onClick={() => exporter('md')}
                disabled={affichees.length === 0}
                className="bouton-fantome min-h-10 text-xs disabled:opacity-40"
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => exporter('json')}
                disabled={affichees.length === 0}
                className="bouton-fantome min-h-10 text-xs disabled:opacity-40"
              >
                JSON
              </button>
            </>
          ) : (
            <span className="text-xs text-encre-300">
              Réservé aux abonnés (F24) —{' '}
              <a href="/tarifs" className="underline hover:text-encre-100">
                voir les offres
              </a>
            </span>
          )}
        </div>
        {message && (
          <p
            role="status"
            className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
          >
            {message.texte}
          </p>
        )}
      </section>

      {/* Liste */}
      {affichees.length === 0 ? (
        <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
          Rien ici encore : depuis le lecteur, le bouton « Carnet » conserve
          une note, une citation ou un surlignage du chapitre ouvert.
        </p>
      ) : (
        <ul className="space-y-4">
          {affichees.map((e) => {
            const livre = livres.find((l) => l.id === e.livre_id);
            return (
              <li key={e.id} className="velours p-5 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="sur-titre text-grenat-400">{libelleType(e.type)}</span>
                  <span className="text-encre-500">
                    {livre?.titre ?? 'Livre'} {e.chapitre_titre ? `· ${e.chapitre_titre}` : ''}
                  </span>
                  <span className="text-encre-500 ml-auto">
                    {new Date(e.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {e.extrait && (
                  <blockquote className="border-l-2 border-grenat-700 pl-3 text-sm text-encre-200 italic">
                    « {e.extrait} »
                  </blockquote>
                )}
                {edition === e.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={brouillon}
                      onChange={(ev) => setBrouillon(ev.target.value)}
                      rows={3}
                      className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
                      aria-label="Modifier la note"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => enregistrerAnnotation(e.id)}
                        className="bouton-principal min-h-9 text-xs"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEdition(null)}
                        className="bouton-fantome min-h-9 text-xs"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  e.annotation && (
                    <p className="text-sm text-encre-200 whitespace-pre-line">{e.annotation}</p>
                  )
                )}
                <div className="flex gap-2">
                  {edition !== e.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEdition(e.id);
                        setBrouillon(e.annotation ?? '');
                      }}
                      className="bouton-fantome min-h-9 text-xs"
                    >
                      Modifier la note
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => supprimer(e.id)}
                    className="bouton-fantome min-h-9 text-xs text-grenat-400"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
