// ============================================================
// segmenter.ts — Découpage et assemblage 1:1 du texte.
//
// Principe : le texte est découpé en « unités » de traduction
// COHÉRENTES : chaque paragraphe entier est une unité (contexte
// complet → traduction de meilleure qualité) ; seuls les
// paragraphes plus longs que la limite du fournisseur sont
// éclatés, à la frontière des phrases complètes.
//
// Chaque unité transporte sa « suite » : l'espacement exact
// (espace inter-phrases, sauts de paragraphe = lignes vides) qui
// la suivait dans l'original. Réassembler consiste à concaténer
// (traduction + suite) pour chaque unité dans l'ordre — la
// structure des paragraphes est donc préservée à l'identique,
// quelle que soit la sortie du fournisseur.
//
// Les retours à la ligne « mous » (texte enveloppé à la ligne
// près dans le fichier source, ex. PDF) sont réunis en espaces :
// ils ne sont jamais traduits séparément (ce qui casserait les
// phrases) et ne sont pas perdus pour autant — la frontière
// sémantique réelle (le paragraphe) reste intacte.
// ============================================================

export interface Unite {
  /** Contenu à traduire (ne commence ni ne finit par des blancs). */
  source: string;
  /** Espacement exact qui suit l'unité dans le texte normalisé. */
  suite: string;
}

/**
 * Normalisation « souple » : CRLF → LF, retours à la ligne isolés
 * (enveloppement visuel) → espace, blancs multiples → un espace.
 * Les séparateurs de paragraphes (une ou plusieurs lignes vides)
 * sont conservés tels quels.
 */
export function normaliserSouple(texte: string): string {
  return texte
    .replace(/\r\n?/g, '\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/**
 * Découpe un texte entier en unités de traduction cohérentes.
 *
 * @param texte    texte brut (source)
 * @param maxChars taille maximale (en caractères) d'une unité
 */
export function decouperTexte(texte: string, maxChars: number): Unite[] {
  const normalise = normaliserSouple(texte);
  if (normalise.length === 0) return [];

  const unites: Unite[] = [];
  // Séparateurs de paragraphes (lignes vides) conservés dans le découpage.
  const morceaux = normalise.split(/(\n{2,})/);
  let derniere: Unite | null = null;

  for (const morceau of morceaux) {
    if (morceau === '') continue;

    if (/^\n+$/.test(morceau)) {
      // Séparateur de paragraphes : collé à la suite du bloc précédent.
      if (derniere) derniere.suite += morceau;
      else unites.push({ source: '', suite: morceau }); // lignes vides initiales
      continue;
    }

    // --- Un paragraphe (sans '\n' interne après normalisation) ---
    const debut = morceau.match(/^ +/)?.[0] ?? '';
    const fin = morceau.match(/ +$/)?.[0] ?? '';
    const corps = morceau.slice(debut.length, morceau.length - fin.length || undefined);

    // L'indentation de tête reste dans la suite du paragraphe précédent
    // (conserve un réassemblage exact du texte normalisé).
    if (debut) {
      if (derniere) derniere.suite += debut;
      else unites.push({ source: '', suite: debut });
    }

    if (corps.length === 0) {
      if (fin) {
        if (unites.length > 0) unites[unites.length - 1].suite += fin;
        else unites.push({ source: '', suite: fin });
      }
      derniere = unites[unites.length - 1] ?? null;
      continue;
    }

    if (corps.length <= maxChars) {
      unites.push({ source: corps, suite: fin });
      derniere = unites[unites.length - 1];
    } else {
      // Paragraphe trop long : éclatement à la frontière des phrases.
      const pieces = decouperParagrapheLong(corps, maxChars);
      pieces[pieces.length - 1].suite += fin;
      unites.push(...pieces);
      derniere = pieces[pieces.length - 1];
    }
  }

  return unites;
}

/**
 * Vérifie que la concaténation des unités reconstitue le texte normalisé.
 * (Test de non-régression — la garantie 1:1 porte sur la structure des
 * paragraphes, les retours à la ligne mous ayant été réunis en espaces.)
 */
export function verifierIntegrite(texte: string, unites: Unite[]): boolean {
  const reconstitue = unites.map((u) => u.source + u.suite).join('');
  return reconstitue === normaliserSouple(texte);
}

/**
 * Assemble les traductions avec les espacements d'origine.
 * @param unitesTraduites liste parallèle aux unités découpées :
 *                        chaque élément est la traduction de source,
 *                        ou null si l'unité n'a pas été traduite
 *                        (auquel cas rien n'est inséré pour cette unité).
 */
export function assembler(
  unitesTraduites: Array<{ traduit: string | null; suite: string }>
): string {
  return unitesTraduites.map((u) => (u.traduit ?? '') + u.suite).join('');
}

/**
 * Traduit une unité vide ? non — utilitaire : une unité de texte pur
 * (source sans suite) pour les tests rapides.
 */
export function unite(source: string, suite = ''): Unite {
  return { source, suite };
}

// ------------------------------------------------------------
// Éclatement d'un paragraphe trop long, à la frontière des phrases.
// ------------------------------------------------------------

const PONCTUATION_FIN_PHRASE = new Set(['.', '!', '?', '…', '»', '”', '"', ';', ':']);

function decouperParagrapheLong(paragraphe: string, maxChars: number): Unite[] {
  const unites: Unite[] = [];
  let reste = paragraphe;

  while (reste.length > maxChars) {
    const { source, suite, suivant } = couperPhrase(reste, maxChars);
    unites.push({ source, suite });
    reste = suivant;
  }
  unites.push({ source: reste, suite: '' });
  return unites;
}

/** Coupe au mieux dans [1, maxChars] : fin de phrase, sinon dernier espace. */
function couperPhrase(
  texte: string,
  maxChars: number
): { source: string; suite: string; suivant: string } {
  const fenetre = Math.min(maxChars, texte.length - 1);

  // 1. Fin de phrase suivie d'un espace : on garde la phrase complète.
  for (let i = fenetre; i >= 1; i--) {
    if (PONCTUATION_FIN_PHRASE.has(texte[i - 1]) && texte[i] === ' ') {
      return {
        source: texte.slice(0, i),
        suite: ' ',
        suivant: texte.slice(i + 1),
      };
    }
  }

  // 2. Repli : dernier espace de la fenêtre (mot entier préservé).
  const dernierEspace = texte.lastIndexOf(' ', fenetre);
  if (dernierEspace > 0) {
    return {
      source: texte.slice(0, dernierEspace),
      suite: ' ',
      suivant: texte.slice(dernierEspace + 1),
    };
  }

  // 3. Dernier recours : coupure sèche (mot très long sans espace).
  return {
    source: texte.slice(0, maxChars),
    suite: '',
    suivant: texte.slice(maxChars),
  };
}

// ============================================================
// Détection des chapitres
// ============================================================

const TITRE_CHAPITRE_KEYWORDS =
  /^(?:#+\s*)?(?:chapter|chapitre|prologue|epilogue|part|book|livre|préface|preface|avant-propos|introduction)\b/i;

/**
 * Un titre de chapitre crédible :
 * - commence par un mot-clé (Chapter, Chapitre, Part, Prologue…) ;
 * - est une ligne courte (≤ 90 caractères) ;
 * - n'est pas une phrase de prose : le mot-clé ne doit pas être suivi
 *   d'une minuscule ou d'une virgule (« introduction, taking her hand… »
 *   est une ligne enveloppée, pas un titre).
 */
function estTitreChapitre(ligne: string): boolean {
  if (ligne.length === 0 || ligne.length > 90) return false;
  const match = TITRE_CHAPITRE_KEYWORDS.exec(ligne);
  if (!match) return false;
  const reste = ligne.slice(match[0].length);
  // Ponctuation de fin de phrase collée au mot-clé (« book. And even in
  // his mania… ») : la ligne est de la prose enveloppée, pas un titre.
  if (/^[.,;:!?…]/.test(reste)) return false;
  const apres = reste.trimStart();
  if (/^[a-zà-ÿ]/.test(apres)) return false; // suite en minuscules → prose
  if (/^[,;]/.test(apres)) return false; // virgule → prose
  return true;
}

const PETITS_MOTS =
  /^(the|of|a|an|and|or|to|for|in|on|at|by|from|into|upon|with|over|under|as|is|are|was|were|its|it's|her|his|their|our|your|my|me|we|you|they|this|that|not|no|so|but|if|then|than|too|very|can|will|don't|de|la|le|les|du|des|un|une|et|ou|à|au|aux|en|sur|pour|par|avec|dans|son|sa|ses|leur|leurs|notre|nos|votre|vos|ma|mon|mes|ce|cette|ces|qui|que|est)$/i;

/**
 * Détection GÉNÉRIQUE d'un titre de section dans un PDF quelconque
 * (au-delà des seuls mots-clés « Chapter/Chapitre ») :
 * - ligne tout en MAJUSCULES courte (ACKNOWLEDGEMENTS, AUTHOR'S NOTE…) ;
 * - ou ligne en casse de titre (Author's Note, About the Author…) ;
 * - sans ponctuation de fin de phrase (une phrase de prose n'est pas un titre).
 */
function estTitreSection(ligne: string): boolean {
  if (ligne.length < 3 || ligne.length > 60) return false;
  // Fin de phrase réelle → pas un titre.
  if (/[.!?]["'”»]?\s*$/.test(ligne)) return false;
  // Pas de virgule ni deux points en fin de ligne (prose qui continue).
  if (/[,;:]$/.test(ligne)) return false;

  // Tout en majuscules : "ACKNOWLEDGEMENTS", "AUTHOR'S NOTE", "PART ONE".
  const enMajuscules =
    ligne === ligne.toUpperCase() &&
    (ligne.match(/[A-ZÀ-Ý]/g) ?? []).length >= 3 &&
    /[AEIOUYÀÉÈÊËÎÏÔÖÙÜÂ]/i.test(ligne);
  if (enMajuscules) return true;

  // Casse de titre : chaque mot commence par une majuscule (petits mots admis).
  const mots = ligne.split(/\s+/);
  if (mots.length < 1 || mots.length > 8) return false;
  const casseTitre = mots.every((mot) => {
    if (mot.length === 0) return false;
    if (PETITS_MOTS.test(mot)) return true;
    return /^[A-ZÀ-Ý][A-Za-zÀ-ÿ’'’-]*$/.test(mot);
  });
  const auMoinsUnMotPropre = mots.some(
    (mot) => mot.length > 0 && !PETITS_MOTS.test(mot)
  );
  return casseTitre && auMoinsUnMotPropre;
}

/** Un titre de chapitre OU une section générique (Author's Note…). */
function estTitreSectionOuChapitre(ligne: string): boolean {
  return estTitreChapitre(ligne) || estTitreSection(ligne);
}

export interface ChapitreBrut {
  titre: string;
  texte: string;
}

// ------------------------------------------------------------
// Contenu minimal d'un chapitre
//
// Cause du bug corrigé ici : tout titre détecté ouvrait un chapitre,
// sans exigence de contenu. Un PDF découpe les têtes de chapitre en
// plusieurs lignes (« Chapter 1 » puis « The Diamond ») et un EPUB
// range le filigrane du convertisseur sur sa propre page : chaque
// fragment devenait un chapitre (« Chapitre 8 » de 21 caractères), d'où
// deux séries entremêlées dans la liste.
//
// Seuil : 200 caractères utiles (≈ 30 mots, soit 2–3 phrases). C'est le
// plus petit bloc qu'un lecteur peut lire comme un chapitre : en dessous
// on ne trouve que des numéros, des titres de section, des filigranes ou
// des lignes de playlist. Sur le livre de test, les vrais chapitres font
// 5 702 à 39 731 caractères et les blocs parasites 21 à 215 : le seuil
// tombe largement entre les deux.
//
// Échappatoire : un bloc plus court est quand même un chapitre s'il
// contient ≥ 120 caractères ET ≥ 2 phrases complètes (chapitre court
// réel). Et si le livre ENTIER est fait de chapitres courts (médiane
// sous le seuil), le seuil s'abaisse à la moitié de la médiane : un
// recueil de microfictions garde ses chapitres.
// ------------------------------------------------------------

/** Longueur minimale (caractères utiles) d'un chapitre lisible. */
export const MIN_CARACTERES_CHAPITRE = 200;
/** Longueur à partir de laquelle un bloc court peut rester un chapitre… */
const MIN_CARACTERES_PROSE = 120;
/** …s'il contient au moins ce nombre de phrases complètes. */
const MIN_PHRASES_PROSE = 2;

/** Longueur du texte hors blancs superflus (espaces/retours compressés). */
export function longueurUtile(texte: string): number {
  return texte.replace(/\s+/g, ' ').trim().length;
}

/** Nombre de fins de phrase (ponctuation suivie d'un blanc ou de la fin). */
export function nombrePhrases(texte: string): number {
  return (texte.match(/[.!?…]["'”’»)]?(?=\s|$)/g) ?? []).length;
}

/** Médiane d'une liste de nombres (null si vide). */
function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu]
    : Math.round((triees[milieu - 1] + triees[milieu]) / 2);
}

/**
 * Seuil de contenu applicable à un livre donné, mesuré sur la taille
 * médiane de ses blocs : 200 caractères pour un roman, la moitié de la
 * médiane pour un livre de chapitres courts (recueil de microfictions).
 */
export function seuilContenuChapitre(longueurs: number[]): number {
  const med = mediane(longueurs.filter((l) => l > 0));
  if (med === null || med >= MIN_CARACTERES_CHAPITRE) return MIN_CARACTERES_CHAPITRE;
  return Math.max(1, Math.floor(med / 2));
}

/** Vrai si ce texte mérite d'être un chapitre (cf. règles ci-dessus). */
export function estContenuDeChapitre(
  texte: string,
  seuil: number = MIN_CARACTERES_CHAPITRE
): boolean {
  const longueur = longueurUtile(texte);
  if (longueur === 0) return false;
  if (longueur >= seuil) return true;
  // Livre fait de chapitres courts : une phrase complète suffit.
  if (seuil < MIN_CARACTERES_CHAPITRE) return nombrePhrases(texte) >= 1;
  // Roman : un bloc court reste un chapitre s'il porte ≥ 2 phrases.
  return longueur >= MIN_CARACTERES_PROSE && nombrePhrases(texte) >= MIN_PHRASES_PROSE;
}

/** Titre portant un numéro de chapitre / de partie (« Chapter 12 », « PART II »). */
const TITRE_NUMEROTE = /^(?:chapter|chapitre|part|partie|livre|book)\s+(?:\d+|[ivxlcdm]+)\b/i;

/** Réintègre un titre de bloc dans son texte (fusion sans perte). */
function blocAvecTitre(bloc: ChapitreBrut): string {
  const corps = bloc.texte.trim();
  const titre = bloc.titre.trim();
  if (!titre) return corps;
  return corps ? `${titre}\n\n${corps}` : titre;
}

/**
 * Découpe un livre complet en chapitres bruts.
 * - Détecte les titres de chapitres sur leur propre ligne
 *   (anglais ou français, avec ou sans marqueur Markdown #).
 * - Un titre sans contenu ne crée pas de chapitre : isolé, il préfixe le
 *   chapitre suivant (« Chapter 1 — The Diamond ») ; en série, c'est une
 *   table des matières et il est ignoré.
 * - Un bloc trop court est rattaché au chapitre précédent (au suivant en
 *   tête de livre) : aucun texte n'est perdu.
 * - Si aucun titre n'est trouvé, le livre entier est un seul chapitre.
 */
export function decouperEnChapitres(texteBrut: string): ChapitreBrut[] {
  const texte = texteBrut.replace(/\r\n?/g, '\n').trim();
  if (texte.length === 0) return [{ titre: 'Chapitre 1', texte: '' }];

  const lignes = texte.split('\n');
  const blocs: ChapitreBrut[] = [];
  let courant: ChapitreBrut | null = null;
  let tampon: string[] = [];

  const ajouter = () => {
    if (courant) {
      courant.texte = tampon.join('\n').trim() + '\n';
      blocs.push(courant);
    }
    tampon = [];
  };

  for (const ligne of lignes) {
    const l = ligne.trim();
    if (l.length > 0 && estTitreSectionOuChapitre(l)) {
      ajouter();
      courant = { titre: l.replace(/^#+\s*/, ''), texte: '' };
    } else if (!courant && tampon.length === 0 && l.length === 0) {
      continue; // lignes vides avant le premier titre
    } else {
      tampon.push(ligne);
    }
  }

  if (!courant) {
    return [{ titre: 'Chapitre 1', texte: texte + '\n' }];
  }

  ajouter();

  // 1. Titres sans contenu : voir la règle dans la doc de la fonction.
  const sansTitresVides: ChapitreBrut[] = [];
  let prefixe: string | null = null;
  for (let i = 0; i < blocs.length; ) {
    if (longueurUtile(blocs[i].texte) === 0) {
      let j = i;
      while (j < blocs.length && longueurUtile(blocs[j].texte) === 0) j++;
      // Un titre nu suivi de contenu → il préfixe le chapitre suivant. Dans
      // une suite (sommaire, « PART II » puis « Chapter 23 »), seul un titre
      // NUMÉROTÉ qui précède le contenu le numérote : la fin d'un sommaire
      // (« ABOUT THE AUTHOR ») ne devient pas le titre du livre entier.
      if (j < blocs.length) {
        const dernier = blocs[j - 1].titre;
        if (j - i === 1 || TITRE_NUMEROTE.test(dernier)) prefixe = dernier;
      }
      i = j;
      continue;
    }
    sansTitresVides.push({
      titre: prefixe ? `${prefixe} — ${blocs[i].titre}` : blocs[i].titre,
      texte: blocs[i].texte,
    });
    prefixe = null;
    i += 1;
  }

  // 2. Fusion des blocs trop courts dans leur voisin (sans perte de texte).
  const seuil = seuilContenuChapitre(
    sansTitresVides.map((b) => longueurUtile(b.texte))
  );
  const chapitres: ChapitreBrut[] = [];
  let enTete: string | null = null;

  for (const bloc of sansTitresVides) {
    if (estContenuDeChapitre(bloc.texte, seuil)) {
      chapitres.push({
        titre: bloc.titre,
        texte: enTete ? `${enTete}\n\n${bloc.texte}` : bloc.texte,
      });
      enTete = null;
      continue;
    }
    const morceau = blocAvecTitre(bloc);
    const precedent = chapitres[chapitres.length - 1];
    if (precedent) {
      precedent.texte = `${precedent.texte.trimEnd()}\n\n${morceau}\n`;
    } else {
      enTete = enTete ? `${enTete}\n\n${morceau}` : morceau;
    }
  }

  if (chapitres.length === 0) {
    // Aucun bloc n'atteint le seuil : le livre est un seul chapitre.
    return [{ titre: prefixe ?? 'Chapitre 1', texte: `${(enTete ?? texte).trim()}\n` }];
  }

  return chapitres.map((c, i) => ({
    titre: c.titre || `Chapitre ${i + 1}`,
    texte: c.texte,
  }));
}
