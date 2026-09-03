// ============================================================
// providers/fragments.ts — Découpe d'un texte long en fragments
// acceptables par un fournisseur (limite en caractères), à la
// frontière des phrases, avec respect du délai entre requêtes.
// ============================================================

const FIN_PHRASE = new Set(['.', '!', '?', '…', '»', '”', '"', ';', ':']);

/** Découpe un texte en fragments ≤ maxChars, aux frontières de phrases. */
export function decouperEnFragments(
  texte: string,
  maxChars: number
): string[] {
  if (texte.length <= maxChars) return [texte];

  const fragments: string[] = [];
  let reste = texte.trim();

  while (reste.length > maxChars) {
    const fenetre = Math.min(maxChars, reste.length - 1);
    let coupe = -1;
    for (let i = fenetre; i >= 1; i--) {
      if (FIN_PHRASE.has(reste[i - 1]) && reste[i] === ' ') {
        coupe = i;
        break;
      }
    }
    if (coupe < 0) {
      coupe = reste.lastIndexOf(' ', fenetre);
      if (coupe <= 0) coupe = maxChars;
    }
    fragments.push(reste.slice(0, coupe).trimEnd());
    reste = reste.slice(coupe + 1).trimStart();
  }
  if (reste) fragments.push(reste);
  return fragments;
}

/** Attente (ms). */
export function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}
