// ============================================================
// components/univers/MiniGrapheTome.tsx — Graphe MINIATURE des
// relations visibles d'un tome (portage de la maquette
// components/universe/UniverseMiniGraph.vue, adapté au modèle réel :
// couleurs par type et tirets par fiabilité de lib/graphe.ts).
//
// SANS ÉTAT : il n'affiche que des données DÉJÀ FILTRÉES par le
// serveur (chapitre lu du tome). Utilisable en rendu serveur.
// ============================================================

import type { AreteGraphe, NoeudGraphe } from '@/lib/graphe';
import { FIABILITES, TYPES_RELATION, positionsCercle } from '@/lib/graphe';

interface Props {
  noeuds: NoeudGraphe[];
  aretes: AreteGraphe[];
}

const LARGEUR = 420;
const HAUTEUR = 300;

export default function MiniGrapheTome({ noeuds, aretes }: Props) {
  if (noeuds.length === 0) {
    return (
      <p className="text-sm text-encre-500 italic">
        Aucun personnage visible à ce stade de lecture.
      </p>
    );
  }

  const positions = positionsCercle(noeuds.length);
  const parId = new Map(noeuds.map((n, i) => [n.id, positions[i]!] as const));
  const typesUtilises = [
    ...new Set(aretes.map((a) => a.type)),
  ];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="h-auto w-full max-w-[460px]"
        role="img"
        aria-label={`Graphe des relations visibles : ${noeuds
          .map((n) => n.nom)
          .join(', ')}`}
      >
        {/* Arêtes */}
        {aretes.map((arete) => {
          const a = parId.get(arete.origineId);
          const b = parId.get(arete.destinationId);
          if (!a || !b) return null;
          const type = TYPES_RELATION[arete.type];
          const fiabilite = FIABILITES[arete.fiabilite];
          return (
            <line
              key={arete.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={type.couleur}
              strokeWidth={1 + arete.intensite * 0.5}
              strokeDasharray={fiabilite.tirets === 'none' ? undefined : fiabilite.tirets}
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}
        {/* Nœuds : cercle calibré par importance + initiale + nom */}
        {noeuds.map((noeud, i) => {
          const position = positions[i]!;
          const rayon = [11, 15, 19][noeud.importance - 1]!;
          return (
            <g key={noeud.id}>
              <circle
                cx={position.x}
                cy={position.y}
                r={rayon}
                fill="#2a1a24"
                stroke="#f2e8e5"
                strokeOpacity={0.5}
              />
              <text
                x={position.x}
                y={position.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#f2e8e5"
              >
                {noeud.nom.slice(0, 1).toUpperCase()}
              </text>
              <text
                x={position.x}
                y={position.y + rayon + 13}
                textAnchor="middle"
                fontSize={11}
                fill="#bba9ac"
              >
                {noeud.nom}
              </text>
            </g>
          );
        })}
      </svg>
      {typesUtilises.length > 0 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-encre-500">
          {typesUtilises.map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <svg width={26} height={6} aria-hidden="true">
                <line
                  x1={1}
                  y1={3}
                  x2={25}
                  y2={3}
                  stroke={TYPES_RELATION[type].couleur}
                  strokeWidth={2}
                />
              </svg>
              {TYPES_RELATION[type].libelle}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
