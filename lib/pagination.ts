// ============================================================
// pagination.ts — Découpage.
//  1) Récupération paginée : Supabase limite chaque requête à
//     1000 lignes, nécessaire pour les livres volumineux (un
//     « chapitre » sans titres peut dépasser 1000 segments).
//  2) Découpage d'un texte long en blocs (chapitres volumineux),
//     pour que `content-visibility: auto` puisse déléguer au
//     navigateur le rendu des blocs hors écran.
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

/** Seuil (caractères) au-delà duquel un chapitre est découpé en blocs. */
export const SEUIL_CHAPITRE_LONG = 20_000;

/** Taille visée (caractères) d'un bloc de texte long. */
export const TAILLE_BLOC_TEXTE = 20_000;

/**
 * Découpe un texte long en blocs pour `content-visibility: auto`.
 *
 * Contrat : `decouperEnBlocs(t).join('') === t`, toujours. On ne coupe
 * QUE sur une ligne vide, en GARDANT le « \n\n » à la fin du bloc, ce
 * qui reproduit exactement la mise en page d'un bloc unique en
 * `white-space: pre-wrap` (mesuré : hauteurs et positions identiques).
 * Un paragraphe plus long que `tailleCible` reste d'un seul tenant :
 * une coupe franche au milieu d'une ligne ajouterait une rupture de
 * ligne invisible — on ne le fait jamais.
 */
export function decouperEnBlocs(
  texte: string,
  tailleCible: number = TAILLE_BLOC_TEXTE
): string[] {
  if (texte.length <= tailleCible) return [texte];
  const blocs: string[] = [];
  let debut = 0;
  let curseur = 0;
  while (curseur < texte.length) {
    const ligne = texte.indexOf('\n\n', curseur);
    if (ligne === -1) break;
    const coupe = ligne + 2;
    if (coupe - debut >= tailleCible) {
      blocs.push(texte.slice(debut, coupe));
      debut = coupe;
    }
    curseur = coupe;
  }
  if (debut < texte.length) blocs.push(texte.slice(debut));
  return blocs.length > 0 ? blocs : [texte];
}
