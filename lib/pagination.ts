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

// ============================================================
// F5 — Structure typographique du corps du chapitre.
// Le texte source est une suite de paragraphes séparés par des
// lignes vides (contrat de lib/segmenter : jamais de « \n » interne
// à un paragraphe). On l'analyse UNE fois pour produire des blocs
// typés, chacun portant ses OFFSETS dans le texte d'origine — les
// surlignages de recherche restent donc exacts, caractère près.
// ============================================================

/** Nature d'un bloc de texte. */
export type TypeBlocTexte = 'paragraphe' | 'scene';

/** Un bloc typographique du chapitre (paragraphe ou séparateur de scène). */
export interface BlocTexte {
  type: TypeBlocTexte;
  /** Texte exact du bloc, rogné de ses blancs de bord. */
  texte: string;
  /** Offset du 1ᵉʳ caractère dans le texte du chapitre (inclus). */
  debut: number;
  /** Offset de fin dans le texte du chapitre (exclu). */
  fin: number;
}

/** Séparateur de paragraphe : une ligne vide (blanche ou presque). */
const SEPARATEUR_PARAGRAPHE = /\n[ \t\u000d]*\n/g;

/**
 * Ornement typographique seul sur sa ligne, éventuellement espacé ou
 * répété : « ⁂ », « ✳ », « ❧ », « * », « — », « * * * », « ◆◇◆ ».
 */
const SEPARATEUR_ORNEMENT =
  /^[*⁂✳✱❧❦◆◇○●⊙•·—–][\s*⁂✳✱❧❦◆◇○●⊙•·—–]*$/u;

/** Suite de tirets, points ou signes : « --- », « ... », « === ». */
const SEPARATEUR_SIGNES = /^[\-_.=~+#]{2,}$/u;

/** Mélange signes + espaces, sans lettre ni chiffre : « - - », « . . . ». */
const SEPARATEUR_MELANGE = /^[\s\-_.=~+#]+$/u;

/**
 * Vrai si la ligne est un séparateur de scène (blanc typographique)
 * et non une ligne de texte. Conservateur par construction : la
 * ligne doit être courte, sans lettre ni chiffre, et porter soit un
 * ornement typographique, soit au moins DEUX signes.
 * Contre-exemples qui doivent rester du texte : « Elle partit. »,
 * « — Je ne savais pas, dit-elle. ».
 */
export function estSeparateurScene(ligne: string): boolean {
  const t = ligne.trim();
  if (t.length === 0 || t.length > 12) return false;
  if (SEPARATEUR_ORNEMENT.test(t)) return true;
  if (SEPARATEUR_SIGNES.test(t)) return true;
  if (!SEPARATEUR_MELANGE.test(t)) return false;
  return t.replace(/\s/gu, '').length >= 2;
}

/** Vrai si la chaîne ne contient que des blancs. */
function estBlanc(texte: string, debut: number, fin: number): boolean {
  for (let i = debut; i < fin; i += 1) {
    const c = texte.charCodeAt(i);
    // espace, tabulation, saut de ligne, retour chariot, insécables
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 160 && c !== 8239) {
      return false;
    }
  }
  return true;
}

/** Rogne les blancs d'un segment et renvoie ses offsets réels. */
function rogner(texte: string, debut: number, fin: number): [number, number] {
  let d = debut;
  let f = fin;
  while (d < f && estBlanc(texte, d, d + 1)) d += 1;
  while (f > d && estBlanc(texte, f - 1, f)) f -= 1;
  return [d, f];
}

/**
 * Analyse un chapitre en blocs typographiques (paragraphes +
 * séparateurs de scène), avec les offsets de chacun dans le texte.
 *
 * Contrat : `blocks.map(b => texte.slice(b.debut, b.fin))` redonne le
 * texte, rogné de ses blancs de séparation — les blancs entre blocs
 * deviennent de l'ESPACEMENT CSS (réglable), plus des lignes vides.
 */
export function decouperEnParagraphes(texte: string): BlocTexte[] {
  const blocs: BlocTexte[] = [];
  let curseur = 0;
  SEPARATEUR_PARAGRAPHE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const pousser = (debut: number, fin: number) => {
    const [d, f] = rogner(texte, debut, fin);
    if (f <= d) return;
    const brut = texte.slice(d, f);
    const type: TypeBlocTexte =
      brut.indexOf('\n') === -1 && estSeparateurScene(brut)
        ? 'scene'
        : 'paragraphe';
    blocs.push({ type, texte: brut, debut: d, fin: f });
  };
  while ((m = SEPARATEUR_PARAGRAPHE.exec(texte)) !== null) {
    pousser(curseur, m.index);
    curseur = m.index + m[0].length;
  }
  pousser(curseur, texte.length);
  return blocs;
}

/**
 * Regroupe des blocs typographiques en paquets d'environ `tailleCible`
 * caractères, pour que `content-visibility: auto` puisse déléguer au
 * navigateur le rendu des paquets hors écran (chapitre long).
 * Un paquet ne coupe JAMAIS un bloc : la mise en page typographique
 * reste identique à un seul bloc.
 */
export function grouperEnBlocs(
  blocs: readonly BlocTexte[],
  tailleCible: number = TAILLE_BLOC_TEXTE
): BlocTexte[][] {
  const paquets: BlocTexte[][] = [];
  let courant: BlocTexte[] = [];
  let taille = 0;
  for (const bloc of blocs) {
    const longueur = bloc.fin - bloc.debut;
    if (courant.length > 0 && taille + longueur > tailleCible) {
      paquets.push(courant);
      courant = [];
      taille = 0;
    }
    courant.push(bloc);
    taille += longueur;
  }
  if (courant.length > 0) paquets.push(courant);
  return paquets;
}
