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
// Dépendance : jszip (déjà présente via epubjs, déclarée
// explicitement dans package.json). 100 % local, rien n'est
// envoyé à un serveur. Testable en Node (cf. scripts/).
// ============================================================

import JSZip from 'jszip';
import {
  estContenuDeChapitre,
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

/** Décode les entités HTML courantes. */
export function decoderEntites(texte: string): string {
  return texte
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      isFinite(+n) && +n > 0 ? String.fromCodePoint(+n) : ''
    );
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
  // Les fins de blocs deviennent des retours à la ligne.
  t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n');
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

/** Extrait le premier titre (h1/h2) d'un fragment XHTML. */
function titreDuChapitre(html: string, position: number): string {
  // On ignore les blocs <nav> (table des matières) pour ne pas
  // prendre un titre de TOC comme titre de chapitre.
  const sansNav = html
    .split(/<\s*nav\b[^>]*>[\s\S]*?<\s*\/\s*nav>/gi)
    .join(' ');
  const m = sansNav.match(/<\s*h[12]\b[^>]*>([\s\S]*?)<\s*\/\s*h[12]>/i);
  const brut = m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
  const propre = decoderEntites(brut).replace(/\s+/g, ' ').trim();
  if (propre.length === 0) return `Chapitre ${position + 1}`;
  return propre;
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
    bruts.push({ position: bruts.length, titre: titreDuChapitre(html, bruts.length), texte });
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
  return { titre, auteur, chapitres };
}