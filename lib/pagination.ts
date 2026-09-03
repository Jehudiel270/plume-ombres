// ============================================================
// pagination.ts — Récupération paginée (Supabase limite chaque
// requête à 1000 lignes). Nécessaire pour les livres volumineux
// (un « chapitre » sans titres peut dépasser 1000 segments).
// ============================================================

const PAS = 1000;

/**
 * Parcourt toutes les lignes d'une requête en tranches de 1000.
 * @param construire reçoit (début, fin) et doit renvoyer une promesse
 *                   (le builder Supabase est thenable : on l'accepte
 *                   comme PromiseLike) dont la résolution a un champ data.
 */
export async function paginer<R>(
  construire: (
    debut: number,
    fin: number
  ) => PromiseLike<{ data: R[] | null }>
): Promise<R[]> {
  const toutes: R[] = [];
  for (let debut = 0; ; debut += PAS) {
    const reponse = await construire(debut, debut + PAS - 1);
    const lignes = reponse.data ?? [];
    toutes.push(...lignes);
    if (lignes.length < PAS) break;
  }
  return toutes;
}
