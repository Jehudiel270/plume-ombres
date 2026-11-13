// ============================================================
// lib/xp.ts — Progression du lecteur (A17) : XP, rangs, badges.
//
// NON PUNITIF par conception : l'XP ne baisse jamais, aucun
// classement entre lecteurs, aucune relance. L'XP vient de la
// DÉCOUVERTE de chapitres (une seule fois par chapitre, garantie
// UNIQUE en base). Les badges sont des souvenirs d'usage, jamais
// des objectifs manipulateurs ; les « exclusifs » sont cosmétiques
// et liés au plan d'abonnement.
//
// Toute la RÈGLE est pure et testée ici ; l'API ne fait que
// l'appliquer (insert on conflict do nothing + résumé).
// ============================================================

/** XP accordée à la découverte d'un chapitre (unique en base). */
export const XP_PAR_CHAPITRE = 25;

export interface Rang {
  /** 1 → 12. */
  niveau: number;
  nom: string;
  /** XP cumulée nécessaire pour ATTEINDRE ce rang. */
  seuil: number;
}

/** Les 12 rangs de lecteur (seuils cumulés, progressifs). */
export const RANGS: readonly Rang[] = [
  { niveau: 1, nom: 'Encre pâle', seuil: 0 },
  { niveau: 2, nom: 'Marginalie', seuil: 75 },
  { niveau: 3, nom: 'Lecteur d’ombre', seuil: 200 },
  { niveau: 4, nom: 'Pli fidèle', seuil: 400 },
  { niveau: 5, nom: 'Chandelle', seuil: 700 },
  { niveau: 6, nom: 'Encre vive', seuil: 1_100 },
  { niveau: 7, nom: 'Parchemin', seuil: 1_600 },
  { niveau: 8, nom: 'Veilleur', seuil: 2_200 },
  { niveau: 9, nom: 'Archiviste', seuil: 3_000 },
  { niveau: 10, nom: 'Plume noire', seuil: 4_000 },
  { niveau: 11, nom: 'Garde du seuil', seuil: 5_200 },
  { niveau: 12, nom: 'Maître du seuil', seuil: 6_500 },
];

/** Rang atteint pour un total d'XP (pur). */
export function rangDepuisXp(xp: number): Rang {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let courant = RANGS[0];
  for (const r of RANGS) {
    if (total >= r.seuil) courant = r;
    else break;
  }
  return courant;
}

/** Progression vers le rang suivant (0 → 1) ; 1 au rang maximum. */
export function progressionRang(xp: number): number {
  const rang = rangDepuisXp(xp);
  if (rang.niveau >= RANGS.length) return 1;
  const suivant = RANGS[rang.niveau]; // RANGS est 1-indexé par niveau
  const fait = xp - rang.seuil;
  const course = suivant.seuil - rang.seuil;
  return course <= 0 ? 1 : Math.min(1, Math.max(0, fait / course));
}

// ---------- Badges ----------

export interface Badge {
  code: string;
  nom: string;
  description: string;
  /** Seuils : nombre de chapitres découverts, notes au carnet… */
  genre:
    | 'chapitres'
    | 'carnet'
    | 'theories'
    | 'graphes'
    | 'traduction'
    | 'exclusif';
  /** Valeur du seuil (pour les genres comptés). */
  seuil: number;
  /** Réservé aux abonnés (cosmétique) : obtenu si le plan le permet. */
  exclusif?: boolean;
}

export const BADGES: readonly Badge[] = [
  { code: 'premier_chapitre', nom: 'Premier pas', description: 'Un premier chapitre ouvert dans votre atelier.', genre: 'chapitres', seuil: 1 },
  { code: 'nuit_blanche', nom: 'Nuit blanche', description: '10 chapitres découverts.', genre: 'chapitres', seuil: 10 },
  { code: 'marathon', nom: 'Marathon', description: '50 chapitres découverts.', genre: 'chapitres', seuil: 50 },
  { code: 'voix_du_seuil', nom: 'La voix du seuil', description: '100 chapitres découverts.', genre: 'chapitres', seuil: 100 },
  { code: 'premiere_note', nom: 'Encre posée', description: 'Une première note au carnet.', genre: 'carnet', seuil: 1 },
  { code: 'carnet_feuilleté', nom: 'Carnet feuilleté', description: '25 notes, citations et surlignages.', genre: 'carnet', seuil: 25 },
  { code: 'theoricien', nom: 'Théoricien', description: '5 théories consignées.', genre: 'theories', seuil: 5 },
  { code: 'cartographe', nom: 'Cartographe', description: 'Un graphe narratif commencé (3 personnages).', genre: 'graphes', seuil: 3 },
  { code: 'traducteur_patient', nom: 'Traducteur patient', description: 'Un livre entier traduit.', genre: 'traduction', seuil: 1 },
  { code: 'scelle_par_le_seuil', nom: 'Scellé par le seuil', description: 'Badge des abonnés — souvenir cosmétique.', genre: 'exclusif', seuil: 0, exclusif: true },
];

/** Badges attribués selon les compteurs du compte (pur). */
export function badgesPour(compteurs: {
  chapitres: number;
  carnet: number;
  theories: number;
  personnages: number;
  livresTraduits: number;
  abonne: boolean;
}): string[] {
  const codes: string[] = [];
  for (const b of BADGES) {
    if (b.genre === 'exclusif') {
      if (compteurs.abonne) codes.push(b.code);
      continue;
    }
    const valeur =
      b.genre === 'chapitres'
        ? compteurs.chapitres
        : b.genre === 'carnet'
          ? compteurs.carnet
          : b.genre === 'theories'
            ? compteurs.theories
            : b.genre === 'graphes'
              ? compteurs.personnages
              : compteurs.livresTraduits;
    if (valeur >= b.seuil) codes.push(b.code);
  }
  return codes;
}
