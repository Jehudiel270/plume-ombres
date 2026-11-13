'use client';

// ============================================================
// PanneauGraphe.tsx — Graphe narratif (F25, manuel).
//
// · FILTRAGE ANTI-SPOILERS : la position du chapitre lu vient de la
//   progression locale du lecteur ; le SERVEUR ne renvoie que les
//   nœuds/arêtes couverts (réglable : « jusqu'au chapitre N »).
// · VUE GRAPHE : nœuds en cercle (positionsCercle), arêtes libellées ;
//   VUE LISTE : relations lisibles.
// · ÉDITION (propriétaire seulement) : personnages et relations
//   manuels, première apparition choisie dans les chapitres.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  libelleRole,
  positionsCercle,
  type AreteGraphe,
  type GrapheFiltre,
  type RoleGraphe,
} from '@/lib/graphe';
import { CLEF_PROGRESSION, assainirProgression } from '@/lib/progression';

const ROLES: readonly RoleGraphe[] = [
  'protagoniste',
  'antagoniste',
  'allie',
  'secondaire',
  'autre',
];

const COULEURS_ROLE: Record<RoleGraphe, string> = {
  protagoniste: '#a3515f',
  antagoniste: '#6b4a8f',
  allie: '#3f6f5f',
  secondaire: '#6f6a75',
  autre: '#8a8391',
};

export interface ChapitreGraphe {
  id: string;
  titre: string;
  position: number;
}

interface Props {
  livreId: string;
  chapitres: ChapitreGraphe[];
  estProprietaire: boolean;
}

export default function PanneauGraphe({
  livreId,
  chapitres,
  estProprietaire,
}: Props) {
  const positionMax = chapitres.length;
  const [chapitreLu, setChapitreLu] = useState<number>(positionMax);
  const [graphe, setGraphe] = useState<GrapheFiltre | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vue, setVue] = useState<'graphe' | 'liste'>('graphe');

  // Position lue depuis la progression locale (chapitreId → position).
  const positionProgression = useCallback((): number => {
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      if (!brut) return positionMax;
      const p = assainirProgression(JSON.parse(brut));
      if (!p || p.livreId !== livreId || !p.chapitreId) return positionMax;
      const trouve = chapitres.find((c) => c.id === p.chapitreId);
      return trouve ? trouve.position : positionMax;
    } catch {
      return positionMax;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livreId, positionMax]);

  // Initialisation : progression locale par défaut (un seul effet).
  const [initFait, setInitFait] = useState(false);
  if (!initFait) {
    setInitFait(true);
    setChapitreLu(positionProgression());
  }

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const reponse = await fetch(
        `/api/livres/${livreId}/graphe?chapitreLu=${chapitreLu}`
      );
      const donnees = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
      } & GrapheFiltre;
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? 'Graphe indisponible.');
        setGraphe(null);
        return;
      }
      setGraphe({ noeuds: donnees.noeuds, aretes: donnees.aretes, masquees: donnees.masquees });
    } catch {
      setErreur('Réseau indisponible.');
    } finally {
      setChargement(false);
    }
  }, [livreId, chapitreLu]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // ---------- Édition manuelle ----------
  const [nom, setNom] = useState('');
  const [role, setRole] = useState<RoleGraphe>('secondaire');
  const [description, setDescription] = useState('');
  const [apparitionPerso, setApparitionPerso] = useState<string>('');
  const [origineId, setOrigineId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [apparitionRelation, setApparitionRelation] = useState<string>('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const poster = async (corps: Record<string, unknown>) => {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch(`/api/livres/${livreId}/graphe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: donnees.erreur ?? 'Échec de l’ajout.' });
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

  const supprimer = async (type: 'personnage' | 'relation', id: string) => {
    setEnCours(true);
    try {
      await fetch(`/api/livres/${livreId}/graphe?type=${type}&id=${id}`, {
        method: 'DELETE',
      });
      await charger();
    } finally {
      setEnCours(false);
    }
  };

  const ajouterPersonnage = async () => {
    if (await poster({ type: 'personnage', nom, role, description, premiereChapitreId: apparitionPerso || null })) {
      setNom('');
      setDescription('');
      setApparitionPerso('');
      await charger();
    }
  };

  const ajouterRelation = async () => {
    if (
      await poster({
        type: 'relation',
        origineId,
        destinationId,
        libelle,
        premiereChapitreId: apparitionRelation || null,
      })
    ) {
      setLibelle('');
      setApparitionRelation('');
      await charger();
    }
  };

  const positions = useMemo(
    () => positionsCercle(graphe?.noeuds.length ?? 0),
    [graphe?.noeuds.length]
  );
  const nomParId = useMemo(
    () => new Map((graphe?.noeuds ?? []).map((n) => [n.id, n])),
    [graphe?.noeuds]
  );

  const RAYON = 150;
  const CENTRE = 170;

  return (
    <div className="space-y-6">
      {/* Contrôles : portée anti-spoilers + vue */}
      <div className="velours p-4 rounded-2xl flex flex-wrap items-center gap-3">
        <label className="text-xs text-encre-500">
          Afficher jusqu’au chapitre
          <select
            className="champ-sombre select-sombre ml-2 rounded-lg border border-nuit-700 bg-nuit-850 px-2.5 py-2 text-sm text-encre-100"
            value={chapitreLu}
            onChange={(e) => setChapitreLu(Number(e.target.value))}
          >
            <option value={0}>Depuis le début uniquement</option>
            {chapitres.map((c) => (
              <option key={c.id} value={c.position}>
                Chapitre {c.position} — {c.titre.slice(0, 40)}
              </option>
            ))}
            <option value={positionMax}>Tout ({positionMax})</option>
          </select>
        </label>
        <div className="flex gap-1 ml-auto" role="group" aria-label="Vue du graphe">
          <button
            type="button"
            onClick={() => setVue('graphe')}
            aria-pressed={vue === 'graphe'}
            className={`min-h-10 text-xs px-3 ${vue === 'graphe' ? 'bouton-principal' : 'bouton-fantome'}`}
          >
            Graphe
          </button>
          <button
            type="button"
            onClick={() => setVue('liste')}
            aria-pressed={vue === 'liste'}
            className={`min-h-10 text-xs px-3 ${vue === 'liste' ? 'bouton-principal' : 'bouton-fantome'}`}
          >
            Relations
          </button>
        </div>
      </div>

      {erreur && <p className="text-sm text-grenat-400">{erreur}</p>}
      {chargement && (
        <p className="text-sm text-encre-500 animate-pouls-doux">Chargement du graphe…</p>
      )}

      {graphe && !chargement && (
        <>
          {graphe.masquees > 0 && (
            <p className="text-xs text-encre-500 italic border border-dashed border-nuit-700 rounded-lg px-4 py-3">
              {graphe.masquees} élément{graphe.masquees > 1 ? 's' : ''} masqué
              {graphe.masquees > 1 ? 's' : ''} : il
              {graphe.masquees > 1 ? 's' : ''} concerne
              {graphe.masquees > 1 ? 'nt' : ''} des chapitres non affichés
              ici. Aucune fuite : le serveur ne renvoie rien au-delà.
            </p>
          )}
          {graphe.noeuds.length === 0 ? (
            <p className="velours p-6 rounded-2xl text-sm text-encre-300 italic">
              {estProprietaire
                ? 'Votre graphe est vide à cette portée : ajoutez vos personnages ci-dessous.'
                : 'Aucun personnage couvert à cette portée.'}
            </p>
          ) : vue === 'graphe' ? (
            <div className="velours p-4 rounded-2xl overflow-x-auto">
              <svg
                viewBox={`0 0 ${CENTRE * 2} ${CENTRE * 2}`}
                className="mx-auto max-w-xl w-full"
                role="img"
                aria-label={`Graphe de ${graphe.noeuds.length} personnages et ${graphe.aretes.length} relations`}
              >
                {graphe.aretes.map((a) => {
                  const o = positions[noeudIndex(graphe.noeuds, a.origineId)];
                  const d = positions[noeudIndex(graphe.noeuds, a.destinationId)];
                  if (!o || !d) return null;
                  return (
                    <g key={a.id}>
                      <line
                        x1={CENTRE + o.x * RAYON}
                        y1={CENTRE + o.y * RAYON}
                        x2={CENTRE + d.x * RAYON}
                        y2={CENTRE + d.y * RAYON}
                        stroke="var(--color-nuit-600, #2a2027)"
                        strokeWidth="1.5"
                      />
                      <text
                        x={CENTRE + ((o.x + d.x) / 2) * RAYON}
                        y={CENTRE + ((o.y + d.y) / 2) * RAYON - 4}
                        textAnchor="middle"
                        className="fill-[var(--color-encre-500)]"
                        fontSize="9"
                      >
                        {a.libelle.slice(0, 24)}
                      </text>
                    </g>
                  );
                })}
                {graphe.noeuds.map((n, i) => {
                  const p = positions[i];
                  return (
                    <g key={n.id}>
                      <circle
                        cx={CENTRE + p.x * RAYON}
                        cy={CENTRE + p.y * RAYON}
                        r="10"
                        fill={COULEURS_ROLE[n.role]}
                      />
                      <text
                        x={CENTRE + p.x * RAYON}
                        y={CENTRE + p.y * RAYON - 16}
                        textAnchor="middle"
                        className="fill-[var(--color-encre-100)]"
                        fontSize="11"
                      >
                        {n.nom.slice(0, 18)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="text-[11px] text-encre-500 text-center mt-2">
                {graphe.noeuds.length} personnage{graphe.noeuds.length > 1 ? 's' : ''} ·{' '}
                {graphe.aretes.length} relation{graphe.aretes.length > 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {graphe.aretes.length === 0 && (
                <li className="velours p-5 rounded-2xl text-sm text-encre-300 italic">
                  Aucune relation encore : reliez deux personnages ci-dessous.
                </li>
              )}
              {graphe.aretes.map((a) => {
                const o = nomParId.get(a.origineId);
                const d = nomParId.get(a.destinationId);
                return (
                  <li
                    key={a.id}
                    className="velours p-4 rounded-2xl flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="text-encre-100">{o?.nom ?? '?'}</span>
                    <span className="text-grenat-400 text-xs">— {a.libelle} →</span>
                    <span className="text-encre-100">{d?.nom ?? '?'}</span>
                    <span className="text-xs text-encre-500 ml-auto">
                      {a.premierePosition ? `dès le chapitre ${a.premierePosition}` : 'dès le début'}
                    </span>
                    {estProprietaire && (
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => supprimer('relation', a.id)}
                        className="bouton-fantome text-xs min-h-8 text-grenat-400"
                      >
                        Retirer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Personnages (cartes) */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {graphe.noeuds.map((n) => (
              <li key={n.id} className="velours p-4 rounded-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COULEURS_ROLE[n.role] }}
                    aria-hidden="true"
                  />
                  <span className="font-display text-encre-100">{n.nom}</span>
                  <span className="text-[11px] text-encre-500 ml-auto">
                    {libelleRole(n.role)}
                  </span>
                </div>
                {n.description && (
                  <p className="text-xs text-encre-400 line-clamp-3">{n.description}</p>
                )}
                <p className="text-[11px] text-encre-500">
                  {n.premierePosition ? `Apparaît au chapitre ${n.premierePosition}` : 'Présent dès le début'}
                </p>
                {estProprietaire && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => supprimer('personnage', n.id)}
                    className="bouton-fantome text-xs min-h-8 text-grenat-400"
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {message && (
        <p
          role="status"
          className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
        >
          {message.texte}
        </p>
      )}

      {/* Édition manuelle (propriétaire) */}
      {estProprietaire && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-ajout-perso">
            <h2 id="titre-ajout-perso" className="sur-titre text-encre-300">
              Ajouter un personnage
            </h2>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom du personnage…"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleGraphe)}
              aria-label="Rôle"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {libelleRole(r)}
                </option>
              ))}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description courte (facultative)…"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={apparitionPerso}
              onChange={(e) => setApparitionPerso(e.target.value)}
              aria-label="Première apparition"
            >
              <option value="">Présent dès le début</option>
              {chapitres.map((c) => (
                <option key={c.id} value={c.id}>
                  Apparaît au chapitre {c.position} — {c.titre.slice(0, 36)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={enCours || !nom.trim()}
              onClick={ajouterPersonnage}
              className="bouton-principal min-h-10 text-sm w-full disabled:opacity-40"
            >
              Ajouter au graphe
            </button>
          </section>

          <section className="velours p-5 rounded-2xl space-y-3" aria-labelledby="titre-ajout-relation">
            <h2 id="titre-ajout-relation" className="sur-titre text-encre-300">
              Relier deux personnages
            </h2>
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={origineId}
              onChange={(e) => setOrigineId(e.target.value)}
              aria-label="Personnage d'origine"
            >
              <option value="">De…</option>
              {(graphe?.noeuds ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nom}
                </option>
              ))}
            </select>
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              aria-label="Personnage de destination"
            >
              <option value="">…vers</option>
              {(graphe?.noeuds ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nom}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Relation (sœur de, traque, aime…)…"
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
            />
            <select
              className="champ-sombre select-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={apparitionRelation}
              onChange={(e) => setApparitionRelation(e.target.value)}
              aria-label="Première apparition de la relation"
            >
              <option value="">Dès le début</option>
              {chapitres.map((c) => (
                <option key={c.id} value={c.id}>
                  Révélée au chapitre {c.position} — {c.titre.slice(0, 30)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={enCours || !origineId || !destinationId || !libelle.trim()}
              onClick={ajouterRelation}
              className="bouton-principal min-h-10 text-sm w-full disabled:opacity-40"
            >
              Relier
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

/** Index d'un nœud dans la liste (pour la position circulaire). */
function noeudIndex(noeuds: Array<{ id: string }>, id: string): number {
  return noeuds.findIndex((n) => n.id === id);
}
