// ============================================================
// tri-livres.ts — Helpers pures de tri et de filtre de la
// bibliothèque.
//
// - Pures : aucune mutation de l'entrée, aucun effet de bord
//   (ni DOM, ni Supabase, ni localStorage) → testables sous
//   Node via tsx (scripts/test-tri-livres.ts).
// - Le composant BibliothequeClient consomme ces helpers pour
//   son tri + filtre statuts ; la persistance n'est pas
//   concernée ici.
// ============================================================

import type { Livre, StatutLivre } from './types';

/** Critères de tri proposés par l'interface. */
export type CritereTriLivres = 'recents' | 'titre' | 'statut';

/** Statut visé par le filtre — null signifie « tous les statuts ». */
export type FiltreStatut = StatutLivre | null;

/** Ordre de parage des statuts : de l'actionnable au terminé.
 *  « erreur » en tête — un livre en erreur demande une reprise ;
 *  « traduit » en fin de liste (le travail est fait). */
export const ORDRE_STATUTS: Record<StatutLivre, number> = {
  erreur: 0,
  en_traduction: 1,
  pret: 2,
  importe: 3,
  traduit: 4,
};

/** Liste canonique des statuts, dans l'ordre d'affichage des
 *  pastilles de filtre (l'UI en dérive l'ordre, pas la logique). */
export const STATUTS_LIVRES: StatutLivre[] = [
  'importe',
  'pret',
  'en_traduction',
  'traduit',
  'erreur',
];

/** ISO → millisecondes (entrée invalide → -Infinity, toujours trié
 *  en bas sans casser le tri global). */
function enMillisecondes(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Comparateur « modifié le plus récent d'abord » (tri récent). */
function plusRecentDAbord(a: Livre, b: Livre): number {
  return enMillisecondes(b.updated_at) - enMillisecondes(a.updated_at);
}

/** Trie une liste de livres selon un critère.
 *
 * - 'recents' : modifié le plus récent en tête (choc de la
 *   librairie — on reprend là où on en était).
 * - 'titre'   : A → Z, collation française, insensible aux
 *   accents et à la casse (ex. « Âme » ≠ « a », « é » = « e »).
 * - 'statut'  : par parage d'action (erreur → en_traduction →
 *   pret → importe → traduit), les égalités se départagent par
 *   la date de modification.
 *
 * L'entrée n'est pas modifiée : une copie est retournée. */
export function trierLivres(
  livres: Livre[],
  critere: CritereTriLivres = 'recents'
): Livre[] {
  const copie = [...livres];
  switch (critere) {
    case 'titre':
      copie.sort(
        (a, b) =>
          a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }) ||
          plusRecentDAbord(a, b)
      );
      break;
    case 'statut':
      copie.sort(
        (a, b) =>
          ORDRE_STATUTS[a.statut] - ORDRE_STATUTS[b.statut] ||
          plusRecentDAbord(a, b)
      );
      break;
    case 'recents':
    default:
      copie.sort(plusRecentDAbord);
      break;
  }
  return copie;
}

/** Filtre une liste de livres par statut.
 *
 * - statut === null → tous les livres (copie, ordre initial).
 * - sinon → seuls les livres du statut visé, dans l'ordre d'origine.
 *
 * L'entrée n'est pas modifiée. */
export function filtrerParStatut(livres: Livre[], statut: FiltreStatut): Livre[] {
  const copie = [...livres];
  if (statut === null) return copie;
  return copie.filter((livre) => livre.statut === statut);
}

/** Compteurs par statut (toujours les cinq clés, à 0 si aucun
 *  livre) — pour les pastilles de filtre « Traduits (2) » etc. */
export function compterParStatut(livres: Livre[]): Record<StatutLivre, number> {
  const compteurs: Record<StatutLivre, number> = {
    importe: 0,
    pret: 0,
    en_traduction: 0,
    traduit: 0,
    erreur: 0,
  };
  for (const livre of livres) {
    if (livre.statut in compteurs) {
      compteurs[livre.statut] += 1;
    }
  }
  return compteurs;
}