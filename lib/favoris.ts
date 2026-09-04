// Logique pure des favoris — testable sans navigateur ni réseau.
// Le hook lib/useFavorites.ts consomme ces fonctions ; le composant
// components/BoutonFavori.tsx consomme le hook.

/** Forme brute d'une ligne de la table public.favorites (API Supabase). */
export interface LigneFavoriteBrute {
  id: string;
  proprietaire_id: string;
  livre_id: string;
  created_at: string;
}

/** Un favori validé : id du livre + id de la ligne pour les suppression. */
export interface Favori {
  id: string;
  livreId: string;
  creeLe: string;
}

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assainit la réponse brute de la requête favorites :
 * - rejette non-tableau,
 * - ignore les lignes mal formées (id/livre_id non UUID, created_at vide),
 * - déduplique par livre_id (la dernière occurrence l'emporte —
 *   la contrainte unique côté DB rend ceci théorique, mais le
 *   client restant robuste coûte plus cher que de le supposer propre).
 */
export function assainirFavorites(brut: unknown): Favori[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Map<string, Favori>();
  for (const ligne of brut as LigneFavoriteBrute[]) {
    if (!ligne || typeof ligne !== 'object') continue;
    const id = typeof ligne.id === 'string' ? ligne.id : '';
    const livreId = typeof ligne.livre_id === 'string' ? ligne.livre_id : '';
    const creeLe =
      typeof ligne.created_at === 'string' && ligne.created_at ? ligne.created_at : '';
    // Un favorite sans identifiant exploitable n'a pas sa place ici.
    if (!REGEX_UUID.test(id) || !REGEX_UUID.test(livreId) || !creeLe) continue;
    vus.set(livreId, { id, livreId, creeLe });
  }
  return [...vus.values()];
}

/**
 * Le livre est-il dans la liste des favoris ?
 * Comparison stricte : pas de tolérance de format à ce niveau.
 */
export function estFavorite(liste: readonly Favori[], livreId: string): boolean {
  return liste.some((f) => f.livreId === livreId);
}

/**
 * Bascule (pure) un livre : renverse son état dans la liste SANS la
 * muter. Cas d'ajout : l'entrée temporaire (id générique) sera
 * remplacée par la vraie ligne après la confirmation du serveur.
 */
export function toggle(
  liste: readonly Favori[],
  livreId: string,
  idTemporaire?: string
): Favori[] {
  if (estFavorite(liste, livreId)) {
    return liste.filter((f) => f.livreId !== livreId);
  }
  const provisoire: Favori = {
    id: idTemporaire ?? `temp-${livreId}`,
    livreId,
    creeLe: new Date().toISOString(),
  };
  return [...liste, provisoire];
}

/**
 * Renvoie la liste où la ligne d'identifiant `idAncien` est remplacée
 * par la ligne `ligne` venue du serveur (après un ajout confirmé).
 */
export function remplacerLigne(
  liste: readonly Favori[],
  idAncien: string,
  ligne: LigneFavoriteBrute
): Favori[] {
  const assaini = assainirFavorites([ligne]);
  if (assaini.length === 0) return [...liste];
  const valides = [...liste, ...assaini];
  const vus = new Map<string, Favori>();
  for (const f of valides) {
    if (f.id === idAncien) continue; // la temporaire disparaît
    vus.set(f.livreId, f);
  }
  return [...vus.values()];
}