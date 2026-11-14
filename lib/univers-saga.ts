// ============================================================
// lib/univers-saga.ts — Vue SAGA d'un univers multi-tomes (F17,
// portage fidèle de la maquette components/universe).
//
// Ce que la maquette appelle « la saga en un regard » :
//   • une FRISE ARBORÉE des tomes : un nœud par tome, des LIENS
//     entre tomes (personnages communs) et des « racines » (les
//     personnages visibles de chaque tome) ;
//   • une MATRICE personnage × tome (apparitions visibles, cadenas
//     pour ce qui reste masqué) ;
//   • une CHRONOLOGIE inter-tomes filtrable par personnage ;
//   • les ÉVOLUTIONS de relations d'un tome à l'autre (une frise
//     par paire de personnages).
//
// ANTI-SPOILERS PAR CONSTRUCTION : la fonction consomme des graphes
// DÉJÀ FILTRÉS par `chargerGraphe` (chapitre lu de chaque tome).
// Aucun élément masqué n'entre ici : le rapprochement inter-tomes
// (par nom normalisé) ne voit que du visible — on ne révèle donc
// jamais un personnage d'un tome non entamé.
//
// Fonctions PURES, testées (lib/univers-saga.test.ts).
// ============================================================

import type {
  AreteGraphe,
  Fiabilite,
  GenreEvenement,
  GrapheFiltre,
  RoleGraphe,
  TypeRelation,
} from '@/lib/graphe';

/** Rang d'un rôle pour choisir le rôle affiché d'un personnage multi-tomes. */
const RANG_ROLE: Record<RoleGraphe, number> = {
  protagoniste: 4,
  antagoniste: 3,
  allie: 2,
  secondaire: 1,
  autre: 0,
};

/** Un tome de la saga : graphes DÉJÀ filtrés par le chapitre lu. */
export interface SagaTomeSource {
  /** Id du livre (tome). */
  id: string;
  titre: string;
  auteur: string | null;
  /** Rang du tome dans la saga (1 = premier). */
  rang: number;
  totalChapitres: number;
  /** Nombre de chapitres découverts (lectures_xp) — vérité serveur. */
  chapitresLus: number;
  /** Total de personnages RÉFÉRENCÉS du tome (visibles ou non). */
  totalPersonnages: number;
  /** Graphe déjà filtré par `chargerGraphe` (anti-spoilers). */
  graphe: GrapheFiltre;
}

export interface SagaPersonnage {
  /** Clé d'égalité inter-tomes : nom normalisé (accents et casse ignorés). */
  cle: string;
  /** Forme d'affichage (première rencontre, la plus « complète »). */
  nom: string;
  role: RoleGraphe;
  /** Importance MAXIMALE observée (un principal reste principal). */
  importance: 1 | 2 | 3;
  description: string | null;
  /** Rangs des tomes où le personnage est VISIBLE. */
  tomes: number[];
  /** Par tome : nombre d'événements visibles qui le citent. */
  apparitions: Record<number, number>;
  /** Par tome : nombre de relations visibles où il figure. */
  liens: Record<number, number>;
}

export interface SagaLienTomes {
  /** Rangs des deux tomes adjacents. */
  depuis: number;
  vers: number;
  /** Noms des personnages communs VISIBLES des deux côtés. */
  communs: string[];
}

export interface SagaEvenement {
  /** Rang du tome de l'événement. */
  tome: number;
  tomeTitre: string;
  /** Position du chapitre relaté (1 → n). */
  chapitre: number;
  genre: GenreEvenement;
  titre: string;
  texte: string | null;
  /** Noms (visibles) des personnages concernés. */
  personnages: string[];
}

export interface SagaEtapeRelation {
  tome: number;
  chapitre: number;
  type: TypeRelation;
  libelle: string;
  etat: string | null;
  fiabilite: Fiabilite;
}

export interface SagaEvolution {
  /** Clés normalisées de la paire (ordre alphabétique, stables). */
  cleA: string;
  cleB: string;
  nomA: string;
  nomB: string;
  etapes: SagaEtapeRelation[];
}

export interface SagaAgregat {
  personnages: SagaPersonnage[];
  liens: SagaLienTomes[];
  evenements: SagaEvenement[];
  evolutions: SagaEvolution[];
  /** Par tome : combien d'éléments de graphe restent masqués. */
  masqueesParTome: Record<number, number>;
  /** Par tome : personnages référencés mais pas encore visibles. */
  personnagesMasquesParTome: Record<number, number>;
}

/**
 * Rapproche les noms d'un même personnage d'un tome à l'autre :
 * casse, accents et espaces multiples ignorés. Pur et déterministe.
 */
export function normaliserNom(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Rapproche deux noms de personnages (clé de paire, ordre stable). */
function clePaire(cleA: string, cleB: string): string {
  return cleA < cleB ? `${cleA}||${cleB}` : `${cleB}||${cleA}`;
}

/**
 * Agrège les tomes d'une saga. `tomes` doit être trié par rang et
 * chaque `graphe` doit être déjà filtré (chapitre lu du tome).
 */
export function agregerSaga(tomes: readonly SagaTomeSource[]): SagaAgregat {
  const parCle = new Map<string, SagaPersonnage>();
  const liens: SagaLienTomes[] = [];
  const evenements: SagaEvenement[] = [];
  const evolutionsParPaire = new Map<string, SagaEvolution>();
  const masqueesParTome: Record<number, number> = {};
  const personnagesMasquesParTome: Record<number, number> = {};

  // Visibles par tome, pour les liens inter-tomes.
  const visiblesParTome = new Map<number, Map<string, string>>();

  for (const tome of tomes) {
    const nomParId = new Map(
      tome.graphe.noeuds.map((n) => [n.id, n.nom] as const)
    );
    const cleParId = new Map(
      tome.graphe.noeuds.map(
        (n) => [n.id, normaliserNom(n.nom)] as const
      )
    );

    const visibles = new Map<string, string>();
    for (const noeud of tome.graphe.noeuds) {
      const cle = cleParId.get(noeud.id)!;
      visibles.set(cle, noeud.nom);
      const existant = parCle.get(cle);
      if (!existant) {
        parCle.set(cle, {
          cle,
          nom: noeud.nom,
          role: noeud.role,
          importance: noeud.importance,
          description: noeud.description,
          tomes: [tome.rang],
          apparitions: {},
          liens: {},
        });
      } else {
        existant.tomes.push(tome.rang);
        if (RANG_ROLE[noeud.role] > RANG_ROLE[existant.role]) {
          existant.role = noeud.role;
        }
        if (noeud.importance > existant.importance) {
          existant.importance = noeud.importance;
        }
        if (!existant.description && noeud.description) {
          existant.description = noeud.description;
        }
      }
    }
    visiblesParTome.set(tome.rang, visibles);

    // Apparitions : événements qui citent le personnage.
    for (const evenement of tome.graphe.evenements) {
      for (const id of evenement.personnageIds) {
        const cle = cleParId.get(id);
        if (!cle) continue;
        const personnage = parCle.get(cle);
        if (personnage) {
          personnage.apparitions[tome.rang] =
            (personnage.apparitions[tome.rang] ?? 0) + 1;
        }
      }
    }

    // Liens : relations visibles du tome.
    for (const arete of tome.graphe.aretes) {
      for (const id of [arete.origineId, arete.destinationId]) {
        const cle = cleParId.get(id);
        const personnage = cle ? parCle.get(cle) : undefined;
        if (personnage) {
          personnage.liens[tome.rang] = (personnage.liens[tome.rang] ?? 0) + 1;
        }
      }

      // Évolutions : groupe les relations par paire de personnages.
      const cleA = cleParId.get(arete.origineId);
      const cleB = cleParId.get(arete.destinationId);
      const nomA = nomParId.get(arete.origineId);
      const nomB = nomParId.get(arete.destinationId);
      if (!cleA || !cleB || !nomA || !nomB || cleA === cleB) continue;
      const cle = clePaire(cleA, cleB);
      let evolution = evolutionsParPaire.get(cle);
      if (!evolution) {
        evolution =
          cleA < cleB
            ? { cleA, cleB, nomA, nomB, etapes: [] }
            : { cleA: cleB, cleB: cleA, nomA: nomB, nomB: nomA, etapes: [] };
        evolutionsParPaire.set(cle, evolution);
      }
      evolution.etapes.push({
        tome: tome.rang,
        chapitre: arete.premierePosition ?? 1,
        type: arete.type,
        libelle: arete.libelle,
        etat: arete.etat,
        fiabilite: arete.fiabilite,
      });
    }

    // Chronologie inter-tomes.
    for (const evenement of tome.graphe.evenements) {
      evenements.push({
        tome: tome.rang,
        tomeTitre: tome.titre,
        chapitre: evenement.position,
        genre: evenement.genre,
        titre: evenement.titre,
        texte: evenement.texte,
        personnages: evenement.personnageIds
          .map((id) => nomParId.get(id) ?? null)
          .filter((n): n is string => n !== null),
      });
    }

    // Masqués (comptes uniquement, jamais de détail).
    masqueesParTome[tome.rang] = tome.graphe.masquees;
    personnagesMasquesParTome[tome.rang] = Math.max(
      0,
      tome.totalPersonnages - tome.graphe.noeuds.length
    );
  }

  // Liens entre tomes ADJACENTS : personnages communs des deux côtés.
  for (let i = 1; i < tomes.length; i++) {
    const avant = visiblesParTome.get(tomes[i - 1]!.rang) ?? new Map();
    const apres = visiblesParTome.get(tomes[i]!.rang) ?? new Map();
    const communs: string[] = [];
    for (const [cle, nom] of avant) {
      if (apres.has(cle)) communs.push(nom);
    }
    communs.sort((a, b) => a.localeCompare(b, 'fr'));
    liens.push({ depuis: tomes[i - 1]!.rang, vers: tomes[i]!.rang, communs });
  }

  const personnages = [...parCle.values()].sort(
    (a, b) =>
      b.importance - a.importance ||
      a.nom.localeCompare(b.nom, 'fr')
  );

  const evolutions = [...evolutionsParPaire.values()]
    .map((e) => ({
      ...e,
      etapes: e.etapes.sort(
        (a, b) => a.tome - b.tome || a.chapitre - b.chapitre
      ),
    }))
    .sort(
      (a, b) =>
        b.etapes.length - a.etapes.length ||
        a.nomA.localeCompare(b.nomA, 'fr')
    );

  evenements.sort(
    (a, b) => a.tome - b.tome || a.chapitre - b.chapitre
  );

  return {
    personnages,
    liens,
    evenements,
    evolutions,
    masqueesParTome,
    personnagesMasquesParTome,
  };
}

/** Événements d'un tome (rang donné) — aide à l'affichage du détail. */
export function evenementsDuTome(
  saga: SagaAgregat,
  rang: number
): SagaEvenement[] {
  return saga.evenements.filter((e) => e.tome === rang);
}

/** Personnages visibles dans un tome, avec leur présence locale. */
export function personnagesDuTome(
  saga: SagaAgregat,
  rang: number
): SagaPersonnage[] {
  return saga.personnages
    .filter((p) => p.tomes.includes(rang))
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        (b.apparitions[rang] ?? 0) - (a.apparitions[rang] ?? 0) ||
        a.nom.localeCompare(b.nom, 'fr')
    );
}

/** Arêtes visibles d'un tome (pour le mini-graphe du détail). */
export function aretesDuTome(
  tome: SagaTomeSource
): AreteGraphe[] {
  return tome.graphe.aretes;
}
