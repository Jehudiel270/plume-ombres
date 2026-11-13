// ============================================================
// lib/plume.ts — La plume et les familiers (A17) : règles pures.
//
// La plume du lecteur ÉVOLUE avec le rang (12 rangs → 12
// apparences). Chaque rang choisit un FAMILIER compagnon (pur
// cosmétique, jamais conditionnant). Aucun achat, aucune loterie :
// tout se débloque en lisant, rien ne se perd.
// ============================================================

import { RANGS } from '@/lib/xp';

export interface ApparencePlume {
  /** Niveau du rang déclencheur (1 → 12). */
  niveau: number;
  nom: string;
  /** Teinte de la plume (dégradé CSS) et de la lueur. */
  du: string;
  vers: string;
  lueur: string;
  /** Description poétique courte (vouvoiement, sans emoji). */
  legende: string;
}

/** Les douze apparences de la plume, une par rang. */
export const APPARENCES_PLUME: readonly ApparencePlume[] = [
  { niveau: 1, nom: 'Encre pâle', du: '#8b8b9e', vers: '#b9b9c9', lueur: 'rgba(139,139,158,.35)', legende: 'Une plume encore timide, posée sur la première page.' },
  { niveau: 2, nom: 'Marginalie', du: '#7d8aa6', vers: '#a9b6cf', lueur: 'rgba(125,138,166,.38)', legende: 'Elle annote les marges, discrète mais sûre.' },
  { niveau: 3, nom: 'Lecteur d’ombre', du: '#6f7f96', vers: '#93a6bd', lueur: 'rgba(111,127,150,.4)', legende: 'Elle a appris à lire dans la pénombre.' },
  { niveau: 4, nom: 'Pli fidèle', du: '#68788f', vers: '#8ba0b8', lueur: 'rgba(104,120,143,.42)', legende: 'Elle marque les pages qu’on rouvre toujours.' },
  { niveau: 5, nom: 'Chandelle', du: '#7d6f6a', vers: '#a89388', lueur: 'rgba(125,111,106,.45)', legende: 'Elle veille là où la chandelle hésite.' },
  { niveau: 6, nom: 'Encre vive', du: '#6d5f7d', vers: '#9281a6', lueur: 'rgba(109,95,125,.46)', legende: 'Son trait s’est fait plus confiant, plus sombre.' },
  { niveau: 7, nom: 'Parchemin', du: '#6b6353', vers: '#968d76', lueur: 'rgba(107,99,83,.46)', legende: 'Elle épouse le grain du vieux papier.' },
  { niveau: 8, nom: 'Veilleur', du: '#55606f', vers: '#7a8899', lueur: 'rgba(85,96,111,.5)', legende: 'Elle garde le seuil pendant que les autres dorment.' },
  { niveau: 9, nom: 'Archiviste', du: '#4f5a52', vers: '#72816f', lueur: 'rgba(79,90,82,.52)', legende: 'Elle connaît chaque rayon, chaque registre.' },
  { niveau: 10, nom: 'Plume noire', du: '#3d4148', vers: '#5d636d', lueur: 'rgba(61,65,72,.55)', legende: 'Noire comme une nuit qu’on choisit.' },
  { niveau: 11, nom: 'Garde du seuil', du: '#5a3d47', vers: '#84555f', lueur: 'rgba(90,61,71,.58)', legende: 'Elle se dresse entre le lecteur et ce qu’il craint de savoir.' },
  { niveau: 12, nom: 'Maître du seuil', du: '#6e3440', vers: '#9c4453', lueur: 'rgba(110,52,64,.62)', legende: 'Elle a traversé toutes les pages sombres, et elle écrit encore.' },
];

/** Apparence pour un niveau de rang (borné 1 → 12). */
export function apparencePourNiveau(niveau: number): ApparencePlume {
  const n = Math.min(RANGS.length, Math.max(1, Math.round(niveau) || 1));
  return APPARENCES_PLUME[n - 1] ?? APPARENCES_PLUME[0];
}

// ---------- Familiers ----------

export interface Familier {
  code: string;
  nom: string;
  /** Niveau de rang nécessaire (1 → 12) — purement cosmétique. */
  rangRequis: number;
  legende: string;
}

/** Les compagnons de lecture. Le lecteur en CHOISIT un parmi ceux
 *  que son rang a débloqués ; aucun n’est perdu, jamais. */
export const FAMILIERS: readonly Familier[] = [
  { code: 'goutte', nom: 'Goutte d’encre', rangRequis: 1, legende: 'Une tache vivante qui suit la ligne du doigt.' },
  { code: 'papillon', nom: 'Papillon de nuit', rangRequis: 3, legende: 'Il aime les pages qu’on lit tard.' },
  { code: 'chat', nom: 'Chat des rayons', rangRequis: 5, legende: 'Il dort sur les livres qu’on ne finit pas.' },
  { code: 'corbeau', nom: 'Corbeau liseur', rangRequis: 7, legende: 'Il relit par-dessus votre épaule, sans juger.' },
  { code: 'renard', nom: 'Renard de papier', rangRequis: 9, legende: 'Il connaît tous les chemins entre les chapitres.' },
  { code: 'ombre', nom: 'Ombre fidèle', rangRequis: 12, legende: 'Elle ne se montre qu’aux lecteurs du seuil.' },
];

export function familierParCode(code: string): Familier | undefined {
  return FAMILIERS.find((f) => f.code === code);
}

/** Familiers débloqués au niveau de rang donné. */
export function familiersDebloques(niveau: number): Familier[] {
  return FAMILIERS.filter((f) => f.rangRequis <= Math.max(1, niveau));
}
