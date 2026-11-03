// ============================================================
// import-epub.ts — Extraction du texte d'un EPUB (navigateur).
//
// Un EPUB est un ZIP contenant un manifeste (container.xml →
// OPF), une table des matières (nav/NCX) et des XHTML par
// chapitre. Ce module lit le ZIP (jszip), suit l'ORDRE DE
// LECTURE (balise <spine> de l'OPF) pourobtenir des chapitres
// authentiques (titre + texte), et nettoie le HTML en texte
// brut lisible.
//
// Dépendance : jszip (déclarée en dépendance directe du projet).
// explicitement dans package.json). 100 % local, rien n'est
// envoyé à un serveur. Testable en Node (cf. scripts/).
// ============================================================

import JSZip from 'jszip';
import {
  estContenuDeChapitre,
  ligneEstUnTitre,
  longueurUtile,
  seuilContenuChapitre,
} from './segmenter';

export interface ChapitreEpub {
  /** Position dans le livre (indice). */
  position: number;
  /** Titre du chapitre (dédu du premier titre du chapitre). */
  titre: string;
  /** Texte brut du chapitre (HTML nettoyé, paragraphes préservés). */
  texte: string;
}

export interface LivreEpub {
  /** Titre du livre (balise <dc:title>). */
  titre: string;
  /** Auteur (balise <dc:creator>). */
  auteur: string;
  chapitres: ChapitreEpub[];
}

// ---------- Décodage du texte HTML ----------

// Table des entités nommées latines les plus fréquentes dans les EPUB
// anciens (les livres produits en Word/Sigil écrivent « caf&eacute; »).
// Les numériques (&#233;) sont décodées juste après ; &amp; reste en
// DERNIER pour ne pas décoder deux fois « &amp;eacute; ».
const ENTITES_NOMMEES: Record<string, string> = {
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Auml: 'Ä', Atilde: 'Ã', Aring: 'Å',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Ouml: 'Ö', Otilde: 'Õ', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Ntilde: 'Ñ', Ccedil: 'Ç',
  oe: 'œ', OE: 'Œ', aelig: 'æ', AElig: 'Æ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  deg: '°', euro: '€', times: '×', middot: '·', bull: '•',
};

const MOTIF_NOMMEES = new RegExp(
  `&(${Object.keys(ENTITES_NOMMEES).join('|')});`,
  'g'
);

/** Décode les entités HTML courantes. */
export function decoderEntites(texte: string): string {
  return texte
    .replace(/&nbsp;/gi, ' ')
    .replace(MOTIF_NOMMEES, (_, nom: string) => ENTITES_NOMMEES[nom] ?? _)
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n) =>
      isFinite(+n) && +n > 0 ? String.fromCodePoint(+n) : ''
    )
    // « &amp; » en dernier : sinon « &amp;eacute; » deviendrait « é ».
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Lignes parasites des EPUB convertis (filigrane du site, texte alternatif
 * d'image « Unknown ») : elles ne font pas un chapitre.
 */
const LIGNE_PARASITE_EPUB =
  /^(?:oceanofpdf\.com|unknown|www\.[^\s]+|downloaded from[^\n]*|scan(?:ner|ned)? (?:by|from)[^\n]*)$/i;

/**
 * Convertit un fragment HTML (un chapitre EPUB) en texte brut lisible :
 *  - les fin de blocs (\n, <p>, <div>, <h1>…) deviennent des
 *    paragraphes séparés par une ligne vide,
 *  - les autres balises sont retirées (leur contenu texte reste),
 *  - entités HTML décodées, espaces compressés,
 *  - lignes de filigrane supprimées.
 */
export function htmlEnTexte(html: string): string {
  let t = decoderEntites(html);
  // L'en-tête XHTML (<head> : <title>, <style>, <script>) ne fait pas partie
  // du texte. Sans ce retrait, le <title> du fichier — souvent le titre du
  // livre — se retrouvait en tête de CHAQUE chapitre, et c'est lui qui était
  // pris pour le titre du chapitre.
  t = t.replace(/<\s*(head|script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  // Les fins de blocs deviennent des retours à la ligne.
  t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  // Fin de paragraphe : DEUX retours à la ligne. Avec un seul, deux
  // paragraphes voisins étaient recollés en un seul bloc à la lecture
  // (contrairement à ce qu'annonce la doc ci-dessus) — les EPUB minifiés
  // perdaient tous leurs paragraphes.
  t = t.replace(
    /<\s*\/\s*(p|div|section|h[1-6]|li|tr|blockquote|article|ul|ol|table|figure)\s*>/gi,
    '\n\n'
  );
  t = t.replace(
    /<\s*(p|div|section|h[1-6]|li|tr|blockquote|figure|figcaption|article|ul|ol|table|nav|aside|main)\b[^>]*>/gi,
    '\n'
  );
  // Toutes les autres balises : retirées (leur contenu texte reste).
  t = t.replace(/<[^>]*>/g, ' ');
  // Normalisation ligne par ligne (filigranes écartés).
  const lignes = t
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .map((l) => (LIGNE_PARASITE_EPUB.test(l) ? '' : l));
  // Regroupement : les lignes d'un même bloc HTML se rejoignent en
  // un seul paragraphe ; les lignes vides séparent les paragraphes.
  const parages: string[] = [];
  for (const ligne of lignes) {
    if (ligne === '') {
      if (parages.length > 0 && parages[parages.length - 1] !== '') {
        parages.push('');
      }
    } else {
      const avantDernier = parages[parages.length - 1];
      if (avantDernier && avantDernier !== '') {
        // Retour à la ligne mou à l'intérieur d'un paragraphe.
        parages[parages.length - 1] = `${avantDernier} ${ligne}`;
      } else {
        parages.push(ligne);
      }
    }
  }
  // Suppression des doubles séparateurs de paragraphe.
  return parages
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Découpe un texte en paragraphes non vides (pour le pipeline). */
export function paragraphes(texte: string): string[] {
  return texte
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

// ---------- Lecture de l'EPUB ----------

/** Lit un élément du Dublin Core (titre, auteur…) de l'OPF. */
function lireMetadonnee(opf: string, tag: string): string {
  const re = new RegExp(
    `<\\s*dc:${tag}\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*dc:${tag}>`,
    'i'
  );
  const m = opf.match(re);
  if (!m) return '';
  // Le texte du DC peut contenir des attributes (lang="…") : on garde
  // seulement le contenu entre les balises.
  const contenu = m[1].replace(/<[^>]*>/g, '').trim();
  return decoderEntites(contenu);
}

/**
 * Liste des fichiers du SPINE (ordre de lecture) d'un OPF, avec les
 * chemins résolus relativement à la racine de l'OPF.
 *
 * Le <spine> liste des idref pointant vers des <item id href/> de
 * l'élément <manifest>. On construit d'abord la map id → href.
 */
function lireSpine(opf: string, cheminOpf: string): string[] {
  const manifeste = opf.match(
    /<\s*manifest\b[^>]*>([\s\S]*?)<\s*\/\s*manifest>/i
  );
  if (!manifeste) return [];
  const idVersHref = new Map<string, string>();
  for (const item of manifeste[1].matchAll(
    /<\s*item\b[^>]*>/gi
  )) {
    const tag = item[0];
    const id = (tag.match(/\bid="([^"]+)"/i) ?? [])[1];
    const href = (tag.match(/\bhref="([^"]+)"/i) ?? [])[1];
    if (id && href) idVersHref.set(id, href);
  }

  const spine = opf.match(/<\s*spine\b[^>]*>([\s\S]*?)<\s*\/\s*spine>/i);
  if (!spine) return [];
  const entrees: string[] = [];
  for (const ref of spine[1].matchAll(/<\s*itemref\b[^>]*>/gi)) {
    const idref = (ref[0].match(/\bidref="([^"]+)"/i) ?? [])[1];
    const href = idref ? idVersHref.get(idref) : undefined;
    if (href) entrees.push(href);
  }

  // Résolution des chemins relatifs (dot segments « ../ »).
  const racineOpf = cheminOpf.includes('/')
    ? cheminOpf.slice(0, cheminOpf.lastIndexOf('/') + 1)
    : '';
  const normaliserChemin = (href: string): string => {
    const brut = `${racineOpf}${href.replace(/^\.\//, '')}`;
    const parties = brut.split('/');
    const sortie: string[] = [];
    for (const p of parties) {
      if (p === '.' || p === '') continue;
      if (p === '..') sortie.pop();
      else sortie.push(p);
    }
    return sortie.join('/');
  };
  return entrees.map(normaliserChemin);
}

/** Extrait le titre balisé (<h1>/<h2>) d'un fragment XHTML, s'il existe. */
function titreBalise(html: string): string {
  // On ignore les blocs <nav> (table des matières) pour ne pas
  // prendre un titre de TOC comme titre de chapitre.
  const sansNav = html
    .split(/<\s*nav\b[^>]*>[\s\S]*?<\s*\/\s*nav>/gi)
    .join(' ');
  const m = sansNav.match(/<\s*h[12]\b[^>]*>([\s\S]*?)<\s*\/\s*h[12]>/i);
  const brut = m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
  return decoderEntites(brut).replace(/\s+/g, ' ').trim();
}

/** Comparaison d'en-têtes : casse et espaces neutralisés. */
function normaliserEntete(l: string): string {
  return l.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Cette ligne est-elle l'en-tête courant (titre du livre répété en tête de
 * chaque fragment) ? Compare les formes normalisées, en acceptant qu'un
 * en-tête abrégé (« Try ») corresponde à une métadonnée complète
 * (« Try (Temptation Series) »).
 */
function estEnteteCourant(ligne: string, titreLivre: string): boolean {
  const l = normaliserEntete(ligne);
  const t = normaliserEntete(titreLivre);
  if (!l || !t) return false;
  if (l === t) return true;
  const abbregeDe = (court: string, complet: string) =>
    court.length >= 3 &&
    [' (', ':', ' -', ' —', ' /'].some((sep) => complet.startsWith(`${court}${sep}`));
  return abbregeDe(l, t) || abbregeDe(t, l);
}

/** Un titre qui porte un numéro (« Chapter One », « Chapitre 12 »…). */
const LIGNE_TITRE_NUMEROTEE =
  /^(?:chapter|chapitre|part|partie|livre|book|prologue|epilogue|épilogue|préface|preface)\b/i;

/**
 * Titre numéroté collé à sa première phrase sur la même ligne :
 * « Chapter One Past… », « Chapitre 12. La nuit tombait ». Le texte découpé
 * s'arrête après le mot-numéro et son éventuel séparateur.
 */
const TITRE_COLLE =
  /^(?:chapitre|chapter|partie|part|livre|book)\s+(?:[0-9]+|[a-zà-ÿ]+(?:[-'’][a-zà-ÿ]+)?)\s*(?:[.:–—-]\s*)?/i;

/**
 * Lit le titre d'un fragment EPUB DANS SON TEXTE.
 *
 * Beaucoup d'EPUB n'ont ni <h1> ni <h2> : le titre du chapitre est un
 * simple paragraphe (« Chapter One », « Prologue », « Erika »), posé juste
 * après l'en-tête courant répété sur chaque page (le titre du livre, ex.
 * « Try »). L'ancien code ne lisait que les balises et retombait sinon sur
 * `Chapitre ${position}` — l'indice du spine, pas le numéro du chapitre :
 * d'où des chapitres nommés « Chapitre 3 », « Chapitre 6 », « Chapitre 8 »…
 * alors que le texte affichait « Chapter One ». C'est ce décalage qui est
 * corrigé ici : plus de numéro inventé quand le titre est écrit en clair.
 *
 * Le titre retourné est vide quand le fragment n'en porte aucun : la
 * numérotation séquentielle est alors faite à la FIN, sur les seuls
 * chapitres retenus (1, 2, 3… et non des indices de spine troués).
 */
export function titreEtCorpsDuFragment(
  texte: string,
  titreLivre: string
): { titre: string; corps: string } {
  const lignes = texte.split('\n');
  // En-tête courant (titre du livre) et lignes vides de tête.
  let debut = 0;
  while (debut < lignes.length) {
    const vide = normaliserEntete(lignes[debut]).length === 0;
    if (vide || estEnteteCourant(lignes[debut], titreLivre ?? '')) {
      debut += 1;
      continue;
    }
    break;
  }

  // Le titre est l'une des premières lignes utiles, et seulement si la
  // ligne ressemble à un titre : dès qu'une ligne de prose arrive, on
  // s'arrête pour ne pas transformer une phrase en titre de chapitre.
  let indexTitre = -1;
  let resteSurLaLigne = '';
  const limite = Math.min(lignes.length, debut + 6);
  for (let i = debut; i < limite; i += 1) {
    const l = lignes[i].trim();
    if (l.length === 0) continue;
    // Titre collé à sa première phrase sur la même ligne (« Chapter One
    // Past… ») : les paragraphes de certains EPUB sont fusionnés.
    const colle = l.match(TITRE_COLLE);
    if (colle) {
      indexTitre = i;
      resteSurLaLigne = l.slice(colle[0].length).trim();
      break;
    }
    if (ligneEstUnTitre(l)) {
      indexTitre = i;
      break;
    }
    if (l.length > 90) break; // prose : plus aucun titre dans ce fragment
  }

  const corps = lignes.slice(debut).join('\n').trim();
  if (indexTitre === -1) return { titre: '', corps };

  const brut = lignes[indexTitre].trim().replace(/^#+\s*/, '');
  const colle = resteSurLaLigne.length > 0 ? brut.match(TITRE_COLLE) : null;
  const titre = (colle ? colle[0] : brut).trim().replace(/[.:–—\-\s]+$/, '');

  // Un titre numéroté n'est pas une phrase : on le retire du corps, sinon
  // le lecteur l'affiche deux fois (titre du chapitre + première ligne).
  if (!LIGNE_TITRE_NUMEROTEE.test(titre)) return { titre, corps };
  const nettoyees = lignes.slice();
  nettoyees[indexTitre] = resteSurLaLigne;
  const sansTitre = nettoyees
    .slice(debut)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { titre, corps: sansTitre.length > 0 ? sansTitre : corps };
}

/**
 * Lit un EPUB (données brutes) et en extrait les chapitres (texte +
 * titre). Retourne une erreur stricte si le fichier n'est pas un
 * EPUB lisible (scanné, corrompu…).
 */
export async function lireEpub(donnees: ArrayBuffer): Promise<LivreEpub> {
  const zip = await JSZip.loadAsync(donnees).catch(() => {
    throw new Error('EPUB illisible : archive ZIP corrompue.');
  });

  // 1. Manifeste (OPF) via container.xml, sinon premier .opf du zip.
  let opfPath: string | null = null;
  const container = await zip
    .file('META-INF/container.xml')
    ?.async('string')
    .catch(() => '');
  if (container) {
    opfPath = (container.match(/full-path="([^"]+\.opf)"/i) ?? [])[1] ?? null;
  }
  if (!opfPath) {
    opfPath =
      Object.values(zip.files).find((f) => /\.opf$/i.test(f.name) && !f.dir)
        ?.name ?? null;
  }
  if (!opfPath) {
    throw new Error('EPUB illisible : manifeste (OPF) introuvable.');
  }

  // 2. Métadonnées + spine (ordre de lecture).
  const fichierOpf = zip.file(opfPath);
  if (!fichierOpf || fichierOpf.dir) {
    throw new Error('EPUB illisible : manifeste (OPF) introuvable.');
  }
  const opf = await fichierOpf.async('string');
  const titre = lireMetadonnee(opf, 'title');
  const auteur = lireMetadonnee(opf, 'creator');
  let entrees = lireSpine(opf, opfPath);

  // Fallback : pas de spine exploitable → tous les XHTML du zip,
  // triés numériquement (ordres d'éditeur les plus courants).
  if (entrees.length === 0) {
    entrees = Object.values(zip.files)
      .filter((f) => !f.dir && /\.(x?html?|htm)$/i.test(f.name))
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  // 3. Lecture chapitre par chapitre.
  const bruts: ChapitreEpub[] = [];
  for (const chemin of entrees) {
    // JSZip n'aime pas les chemins absolus : on essaie les variantes.
    const fichier =
      zip.file(chemin) ??
      zip.file(chemin.replace(/^\/+/, '')) ??
      Object.values(zip.files).find((f) => f.name.endsWith(chemin)) ?? null;
    if (!fichier || fichier.dir) continue;
    const html = await fichier.async('string');
    const texte = htmlEnTexte(html);
    if (texte.length < 20) continue; // page de garde / table des matières vide
    // Titre : la balise <h1>/<h2> fait foi ; sinon on lit le titre écrit en
    // clair dans le texte. Un titre vide = numérotation séquentielle à la
    // fin (jamais l'indice du spine).
    const balise = titreBalise(html);
    const lu = titreEtCorpsDuFragment(texte, titre);
    let corps = lu.corps;
    if (balise) {
      // La balise de titre est aussi dans le texte : on évite le doublon
      // (le lecteur affiche déjà le titre au-dessus du chapitre).
      const lignesCorps = corps.split('\n');
      const premiere = lignesCorps.findIndex((l) => l.trim().length > 0);
      const egale =
        premiere !== -1 &&
        normaliserEntete(lignesCorps[premiere]) === normaliserEntete(balise);
      if (egale) {
        corps = lignesCorps.slice(premiere + 1).join('\n').trim() || corps;
      }
    }
    bruts.push({ position: bruts.length, titre: balise || lu.titre, texte: corps });
  }

  // 4. Un chapitre doit avoir un contenu minimal (cf. segmenter.ts) : les
  //    pages « numéro de chapitre » ou filigrane (21 caractères) ne sont
  //    pas des chapitres. Leur texte rejoint le chapitre précédent (la
  //    page de garde en tête de livre est ignorée) : plus de série
  //    « Chapitre N » parasite entremêlée aux vrais chapitres.
  const seuil = seuilContenuChapitre(bruts.map((b) => longueurUtile(b.texte)));
  const chapitres: ChapitreEpub[] = [];
  for (const bloc of bruts) {
    if (estContenuDeChapitre(bloc.texte, seuil)) {
      chapitres.push({ ...bloc, position: chapitres.length });
      continue;
    }
    const precedent = chapitres[chapitres.length - 1];
    if (!precedent) continue;
    // Le titre d'un fragment n'est réinséré que s'il n'est pas déjà dans
    // le texte (dans un EPUB le <h1> fait partie du texte du chapitre).
    const corps = bloc.texte.trim();
    const entete = corps.startsWith(bloc.titre) || /^Chapitre \d+$/.test(bloc.titre)
      ? corps
      : `${bloc.titre}\n\n${corps}`;
    precedent.texte = `${precedent.texte.trimEnd()}\n\n${entete}`;
  }

  if (chapitres.length === 0) {
    throw new Error(
      'EPUB illisible : aucun texte exploitable (EPUB scanné ou image ?).'
    );
  }
  // 5. Numérotation des fragments SANS titre : 1, 2, 3… sur les chapitres
  //    réellement retenus. Avant, le numéro venait de l'indice du spine
  //    (pages de garde, sommaire, images comprises) : les chapitres
  //    s'appelaient « Chapitre 3 », « Chapitre 6 », « Chapitre 8 »…
  return {
    titre,
    auteur,
    chapitres: chapitres.map((c, i) => ({
      ...c,
      position: i,
      titre: c.titre.trim() || `Chapitre ${i + 1}`,
    })),
  };
}