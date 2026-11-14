// ============================================================
// lib/suivis.ts — Suivis des œuvres et agenda des sorties (A7/A22,
// variante atelier du cahier initial).
//
// Décision de l'administrateur (15/11/2026) : sur les quatre écarts
// restants du cahier, avis de lecteurs et demandes de retrait sont
// LAISSÉS de côté (risque juridique) ; suivi des sorties et
// calendrier des sorties sont rétablis en variante atelier — rien
// n'est exposé à des tiers, tout est câblé sur l'activité réelle du
// compte (livres de l'atelier, clubs où l'on est membre, défis).
//
// Ce module est PUR : fusion, tri et libellés de l'agenda. Les
// lectures vivent dans la page /suivis, l'écriture dans /api/suivis.
// ============================================================

/** Plafond d'œuvres suivies par compte (le rayonnage d'un lecteur). */
export const MAX_SUIVIS = 60;

/** Plafond d'entrées renvoyées par l'agenda (protection réseau). */
export const MAX_ENTREES_AGENDA = 30;

/** Nature d'une entrée d'agenda. */
export type GenreEntreeAgenda = 'rencontre' | 'echeance';

/** Une entrée d'agenda, prête à afficher. */
export interface EntreeAgenda {
  /** Identifiant stable (dédoublonnage React + tests). */
  cle: string;
  /** Date de l'événement (ISO). */
  date: string;
  genre: GenreEntreeAgenda;
  titre: string;
  detail: string;
  /** Lien interne (le salon du club, la fiche du défi…). */
  lien: string;
}

/** Entrée brute côté rencontres (page /suivis). */
export interface BruteRencontre {
  cle: string;
  prevuLe: string;
  titre: string;
  clubTitre: string;
  mode: string;
  noteChapitres: string | null;
  lien: string;
}

/** Entrée brute côté défis (page /suivis). */
export interface BruteEcheance {
  cle: string;
  echeance: string;
  titre: string;
  detail: string;
  lien: string;
}

/**
 * Fusionne rencontres à venir et échéances de défis en UN agenda trié
 * du plus proche au plus lointain. Tolérante : lignes illisibles ou
 * passées ignorées, doublons de clé écartés, sortie bornée.
 */
export function fusionnerAgenda(
  rencontres: BruteRencontre[],
  echeances: BruteEcheance[],
  maintenant: Date = new Date(),
  limite: number = MAX_ENTREES_AGENDA
): EntreeAgenda[] {
  const entrees: EntreeAgenda[] = [];
  const vues = new Set<string>();

  const pousser = (e: EntreeAgenda) => {
    const date = new Date(e.date).getTime();
    if (!Number.isFinite(date)) return;
    if (date < maintenant.getTime() - 60_000) return; // déjà passée
    if (vues.has(e.cle)) return;
    vues.add(e.cle);
    entrees.push(e);
  };

  for (const r of rencontres) {
    if (!r || typeof r.prevuLe !== 'string') continue;
    pousser({
      cle: r.cle,
      date: r.prevuLe,
      genre: 'rencontre',
      titre: r.titre,
      detail: r.clubTitre + (r.mode ? ` · ${r.mode}` : '') +
        (r.noteChapitres ? ` · ${r.noteChapitres}` : ''),
      lien: r.lien,
    });
  }
  for (const d of echeances) {
    if (!d || typeof d.echeance !== 'string') continue;
    pousser({
      cle: d.cle,
      date: d.echeance,
      genre: 'echeance',
      titre: d.titre,
      detail: d.detail,
      lien: d.lien,
    });
  }

  return entrees
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, Math.max(0, limite));
}

/** Libellé lisible d'une date d'agenda (« samedi 21 novembre à 18:00 »). */
export function libelleDateAgenda(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** « dans 3 jours », « demain », « aujourd'hui » — sans urgence artificielle. */
export function libelleDelai(iso: string, maintenant: Date = new Date()): string {
  const date = new Date(iso).getTime();
  if (!Number.isFinite(date)) return '';
  const jours = Math.floor(
    (new Date(iso).setHours(0, 0, 0, 0) -
      new Date(maintenant).setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'demain';
  return `dans ${jours} jours`;
}

/** Une œuvre suivie, prête à afficher. */
export interface OeuvreSuivie {
  livreId: string;
  titre: string;
  auteur: string | null;
  statut: string;
  chapitresTotal: number;
  chapitresTraduits: number;
  suivieDepuis: string;
}
