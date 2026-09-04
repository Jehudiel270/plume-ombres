// ============================================================
// stats.ts — Statistiques de lecture (100 % local, gratuit).
//
// Fonctions pures (Node-testable) : cumul du temps passé à
// lire, estimation du temps de lecture d'un livre, formatage.
// La persistance (localStorage) est faite dans le composant.
// ============================================================

/** Clé localStorage des stats (versionnée). */
export const CLEF_STATS = 'plume.dombres.stats.v1';

/**
 * Structure stockée : par livre id, le temps total (secondes)
 * passé à lire/consulter, et le nombre de visites.
 */
export interface StatsLecture {
  parLivre: Record<string, { secondes: number; visites: number }>;
}

/** Assainit les stats lues du stockage (corruption → vides). */
export function assainirStats(entree: unknown): StatsLecture {
  const vide: StatsLecture = { parLivre: {} };
  if (typeof entree !== 'object' || entree === null) return vide;
  const brut = entree as { parLivre?: unknown };
  if (typeof brut.parLivre !== 'object' || brut.parLivre === null) return vide;
  const parLivre: StatsLecture['parLivre'] = {};
  for (const [id, valeur] of Object.entries(brut.parLivre)) {
    if (typeof valeur !== 'object' || valeur === null) continue; // entrée corrompue
    const v = valeur as { secondes?: unknown; visites?: unknown };
    parLivre[id] = {
      secondes:
        typeof v.secondes === 'number' && isFinite(v.secondes) && v.secondes > 0
          ? Math.min(v.secondes, 10 * 365 * 24 * 3600) // borne de bon sens
          : 0,
      visites:
        typeof v.visites === 'number' && isFinite(v.visites) && v.visites > 0
          ? Math.floor(v.visites)
          : 0,
    };
  }
  return { parLivre };
}

/** Ajoute du temps (secondes) au livre indiqué, retourne les stats mises à jour. */
export function ajouterTemps(
  stats: StatsLecture,
  livreId: string,
  secondes: number
): StatsLecture {
  if (secondes <= 0) return stats;
  const actuel = stats.parLivre[livreId] ?? { secondes: 0, visites: 0 };
  return {
    parLivre: {
      ...stats.parLivre,
      [livreId]: {
        secondes: actuel.secondes + secondes,
        visites: actuel.visites,
      },
    },
  };
}

/** Compte une visite (ouverture du livre). */
export function ajouterVisite(
  stats: StatsLecture,
  livreId: string
): StatsLecture {
  const actuel = stats.parLivre[livreId] ?? { secondes: 0, visites: 0 };
  return {
    parLivre: {
      ...stats.parLivre,
      [livreId]: { ...actuel, visites: actuel.visites + 1 },
    },
  };
}

/**
 * Estime le temps de lecture d'un texte en secondes.
 * Vitesse de lecture standard en français : ~250 mots/min.
 * (Un mot français moyen ≈ 6 caractères.)
 */
export function estimerSecondesLecture(
  caracteres: number,
  motsParMinute = 250
): number {
  if (caracteres <= 0) return 0;
  const mots = caracteres / 6;
  return Math.max(60, Math.round((mots / motsParMinute) * 60));
}

/** Formate une durée en secondes : « 1 h 24 » / « 42 min » / « 3 min ». */
export function formaterDuree(secondes: number): string {
  const total = Math.max(0, Math.round(secondes));
  const heures = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (heures > 0) return `${heures} h ${minutes.toString().padStart(2, '0')}`;
  if (minutes > 0) return `${minutes} min`;
  return `${Math.max(1, Math.round(total / 60))} min`;
}