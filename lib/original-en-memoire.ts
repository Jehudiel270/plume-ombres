// ============================================================
// original-en-memoire.ts — Cache EN MÉMOIRE du fichier original.
//
// Chantier B2/B5 : plus aucun original n'est stocké côté serveur.
// Le seul moment où le binaire existe encore, c'est la SESSION
// D'IMPORT — le fichier vient d'être lu dans le navigateur. On le
// garde donc dans un cache de module : il survit à la navigation
// client-side vers /livres/[id], et permet l'export « PDF — mise en
// page d'origine » tant que l'onglet reste ouvert. Rien n'est
// envoyé ni persisté ; un rechargement de page le vide.
// ============================================================

const cache = new Map<string, Uint8Array>();

/** Garde-fou mémoire : au-delà, le binaire n'est pas gardé. */
const TAILLE_MAX_OCTETS = 64 * 1024 * 1024; // 64 Mo

/** Mémorise le binaire d'un original importé (session en cours). */
export function memoriserOriginal(livreId: string, octets: Uint8Array): boolean {
  if (octets.byteLength === 0 || octets.byteLength > TAILLE_MAX_OCTETS) {
    return false;
  }
  cache.set(livreId, octets);
  return true;
}

/** Récupère le binaire d'un original importé dans cette session. */
export function octetsOriginalEnMemoire(livreId: string): Uint8Array | null {
  return cache.get(livreId) ?? null;
}

/** Oublie un original (ex. après export, ou suppression du livre). */
export function oublierOriginal(livreId: string): void {
  cache.delete(livreId);
}

/** Nombre d'originaux actuellement gardés en mémoire. */
export function tailleCacheOriginal(): number {
  return cache.size;
}
