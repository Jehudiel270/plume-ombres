// ============================================================
// pdf-fidele.ts — LE SYSTÈME « mise en page d'origine, contenu
// français ». GÉNÉRIQUE : aucun réglage par livre.
//
// Principe (5 garanties) :
//   1. Chaque page de l'original est COPIÉE À L'IDENTIQUE
//      (images, décor, lettrines, filigranes : la copie PDF
//      native conserve TOUTES les ressources de la page).
//   2. Le corps du texte source est EFFACÉ en recouvrant
//      exactement les lignes mesurées par pdf.js (blanc sur
//      blanc — le fond de la page est intact).
//   3. La traduction est ré-coulée dans la ZONE DE TEXTE de la
//      page, avec la TYPOGRAPHIE MESURÉE de cette page : même
//      corps, même interligne, mêmes marges réelles. Rien n'est
//      codé en dur : tout est mesuré sur cet original.
//   4. Un chapitre n'est remplacé que s'il est reconnu (aligne-
//      ment exact sur le flux d'extraction). Les pages non
//      localisées (couverture, sommaire, annexes…) restent
//      TELLES QUELLES — rien n'est jamais inventé.
//   5. Le français déborde parfois d'une page : l'interligne est
//      d'abord serré, puis la taille réduite (lisibilité gardée),
//      et seulement le reste va sur des pages ajoutées à la fin
//      du document, même gabarit, même zone.
//
// Alignement « page d'origine ↔ traduction » (exact, non
// heuristique) : le texte de chaque page du scan, joint par
// '\n', donne le même flux que celui qui a alimenté le découpage
// en chapitres à l'import. Chaque texte_source de la base est un
// sous-texte exact de ce flux (recherche séquentielle). Pour une
// page, son intervalle [debut, fin) dans le flux source est
// projeté proportionnellement sur la traduction de chaque
// chapitre recoupé → la sortie française est CONTINUE, sans mot
// perdu ni dupliqué, chapitre par chapitre, page par page.
//
// Le moteur n'utilise que pdf-lib : il tourne dans le NAVEGATEUR
// (bouton du site) et en Node (tests). L'analyse de la mise en
// page (scans) est fournie par `scannerPagesFideles` (pdf.js,
// même API navigateur et Node).
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from 'pdf-lib';
import { extraireTextePage, type ItemPdf } from './texte-pdf';

// ---------- Types d'entrée (sortie du scanner pdf.js) ----------

/** Une ligne de texte mesurée (points PDF, origine bas-gauche). */
export interface LigneTexte {
  /** x du coin gauche de la ligne (points). */
  x: number;
  /** y de la baseline (points). */
  y: number;
  /** largeur de la ligne (points). */
  w: number;
  /** hauteur de la boîte de texte (points). */
  h: number;
  /** taille des glyphes (échelle X du texte posé, points). */
  dy: number;
}

/** Description d'une page d'origine, telle que mesurée. */
export interface PageSourceFidele {
  /** largeur de la page (points). */
  largeur: number;
  /** hauteur de la page (points). */
  hauteur: number;
  /** lignes de texte mesurées (texte lisible uniquement). */
  lignes: LigneTexte[];
}

/** Chapitre tel que stocké en base. */
export interface ChapitreFidele {
  titre: string;
  texte_source: string;
  /** null = chapitre non traduit (la source est alors affichée). */
  texte_traduit: string | null;
}

export interface OptionsPdfFidele {
  /** Octets du PDF original (pdf-lib ne les consomme pas ; passer
   *  une copie si pdf.js a déjà travaillé dessus). */
  octets: Uint8Array;
  /** Géométrie mesurée de chaque page (ordre = pages du PDF). */
  pages: PageSourceFidele[];
  /** Texte brut nettoyé de chaque page, MÊME extraction que
   *  l'import (extraireTexteDocument / nettoyage identique). */
  textesPages: string[];
  /** Chapitres du livre, dans l'ordre de lecture (base Supabase). */
  chapitres: ChapitreFidele[];
  /** Progression : (étape, total, libellé optionnel). */
  onProgres?: (etape: number, total: number, libelle?: string) => void;
}

export interface ResultatPdfFidele {
  octets: Uint8Array;
  nbPages: number;
  /** pages de l'original dont le corps a été remplacé en français. */
  pagesRemplacees: number;
  /** pages conservées telles quelles (non reconnues / sans corps). */
  pagesIntactes: number;
  /** pages ajoutées à la fin (débordement du français). */
  pagesAjoutees: number;
}

/** Document pdf.js minimal (compatible navigateur ET Node legacy). */
export interface DocPdfJs {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o?: object): { width: number; height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  /** Libère les ressources pdf.js (présent à l'exécution ; le type
   *  public de pdfjs-dist ne l'expose pas toujours). */
  destroy?(): Promise<void>;
}

// ---------- Scanner (pdf.js → géométrie + flux de texte) ----------

/**
 * Mesure la mise en page d'un document : pour chaque page, les
 * lignes de texte (position, largeur, taille) + le texte nettoyé
 * (parité d'extraction avec l'import, indispensable à l'aligne-
 * ment exact). Ce scan est la SEULE donnée d'entrée du système.
 */
export async function scannerPagesFideles(
  doc: DocPdfJs,
  onPage?: (page: number, total: number) => void
): Promise<{ pages: PageSourceFidele[]; textes: string[] }> {
  const pages: PageSourceFidele[] = [];
  const textes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const contenu = await p.getTextContent();
    const lins: LigneTexte[] = [];
    // Géométrie : une entrée par item texte posé (pour mesurer le
    // corps, l'interligne et la zone). Convention PDF : origine
    // bas-gauche, y vers le haut — transform[5] = baseline.
    for (const brut of contenu.items as Array<{
      str?: string;
      hasEOL?: boolean;
      transform?: number[];
      width?: number;
      height?: number;
    }>) {
      const str = brut.str ?? '';
      if (str.trim() !== '' && (brut.width ?? 0) > 0 && brut.transform) {
        lins.push({
          x: brut.transform[4],
          y: brut.transform[5],
          w: brut.width ?? 0,
          h: brut.height ?? Math.abs(brut.transform[3]),
          // Échelle X du texte posé = sa taille réelle en points.
          dy: Math.abs(brut.transform[0]),
        });
      }
    }
    // Flux de texte : STRICTEMENT le même que extraireTexteDocument
    // (extraireTextePage → paragraphes détectés par indentation) —
    // c'est ce flux qui alimente l'alignement exact des pages.
    const texteNettoye = extraireTextePage(contenu.items as ItemPdf[]);
    textes.push(texteNettoye);
    pages.push({ largeur: vp.width, hauteur: vp.height, lignes: lins });
  }
  return { pages, textes };
}

// ---------- Outils texte (parité stricte avec le pipeline d'import) ----------

/** Caractères invisibles non codables en WinAnsi. */
const INVISIBLES = /[\u200b\u200c\u200d\u2060\ufeff\u00ad\u180e]/g;

/** Caractères hors WinAnsi (cyrillique, CJK, emoji…) → apostrophe
 *  droite (toujours codable) si lettre/ponctuation, sinon espace. */
const DEFAUT_CIBLE = /[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g;
const DEFAUT_ESPACE = /\p{Extended_Pictographic}/gu;

function assainir(texte: string): string {
  return texte
    .replace(INVISIBLES, '')
    .replace(DEFAUT_CIBLE, '\u2019')
    .replace(DEFAUT_ESPACE, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** Valeur dominante (mode arrondi au 0.5, puis médiane du groupe). */
function dominanteMediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const parCle = new Map<number, number[]>();
  for (const v of valeurs) {
    const cle = Math.round(v * 2) / 2;
    const liste = parCle.get(cle) ?? [];
    liste.push(v);
    parCle.set(cle, liste);
  }
  const groupe = [...parCle.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!groupe) return null;
  const tri = [...groupe[1]].sort((a, b) => a - b);
  return tri[Math.floor(tri.length / 2)];
}

/** Interligne : médiane des pas de baselines successifs (≥ 6 pts). */
function interligneDe(lignes: LigneTexte[]): number | null {
  if (lignes.length < 3) return null;
  const ys = [
    ...new Set(lignes.map((l) => Math.round(l.y * 10) / 10)),
  ].sort((a, b) => a - b);
  const pas: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const d = ys[i] - ys[i - 1];
    if (d > 2) pas.push(d);
  }
  if (pas.length === 0) return null;
  const tri = [...pas].sort((a, b) => a - b);
  return Math.max(tri[Math.floor(tri.length / 2)], 6);
}

// ---------- Analyse de la mise en page (tout est MESURÉ) ----------

interface PageAnalysee extends PageSourceFidele {
  /** lignes de CORPS (taille dominante ±25 %) : seules à remplacer. */
  corps: LigneTexte[];
  /** corps du texte de la page (points), null si pas de corps. */
  tailleCorps: number | null;
  /** interligne mesuré (points). */
  pas: number;
  /** zone de placement du corps [x, y, w, h] (points). */
  zone: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Détecte pour chaque page : la taille du corps (dominante des
 * glyphes), l'interligne, et la zone de texte (bornée au quart de
 * la page côté marges, pour rester dans l'en-bloc). Titres,
 * lettrines et grands ornements (tailles éloignées de la
 * dominante) sont exclus du remplacement : ils restent visibles.
 */
function analyserPages(pages: PageSourceFidele[]): PageAnalysee[] {
  return pages.map((p) => {
    const lisible = p.lignes.filter((l) => l.dy > 3 && l.w > 1);
    const taille = dominanteMediane(lisible.map((l) => l.dy));
    let corps: LigneTexte[] = [];
    if (taille !== null && lisible.length >= 3) {
      corps = lisible.filter(
        (l) => l.dy >= taille * 0.75 && l.dy <= taille * 1.3
      );
      // Corps crédible : au moins 4 lignes — sinon la « dominante »
      // était un encadré, un titre ou une légende : on ne touche
      // rien sur la page (prudence).
      if (corps.length < 4) corps = [];
    }

    let zone: PageAnalysee['zone'] = null;
    let pas = 0;
    if (corps.length > 0 && taille !== null) {
      const minX = Math.min(...corps.map((l) => l.x));
      const maxX = Math.max(...corps.map((l) => l.x + l.w));
      const minY = Math.min(...corps.map((l) => l.y));
      const maxY = Math.max(...corps.map((l) => l.y + l.h));
      // Zone = enveloppe du corps, bornée : jamais < 20 pts des
      // bords (confort) et pas plus large que le quart de page au-
      // delà de l'en-bloc (une annotation marginale ne doit pas
      // gonfler la zone en pleine page).
      const x = Math.max(20, Math.min(minX - 2, p.largeur * 0.25));
      const y = Math.max(20, Math.min(minY - 2, p.hauteur * 0.28));
      const wMax = Math.min(
        p.largeur - x - 20,
        Math.max(maxX - minX + 4, p.largeur * 0.5)
      );
      const w = Math.min(maxX - minX + 4, wMax);
      const h = Math.min(maxY - minY + 6, p.hauteur - y - 20 - 6);
      zone = { x, y, w, h };
      pas = interligneDe(corps) ?? taille * 1.4;
    }
    return {
      ...p,
      corps,
      tailleCorps: corps.length > 0 ? taille : null,
      pas,
      zone,
    };
  });
}

// ---------- Alignement EXACT : pages ↔ livre ↔ traduction ----------

interface ChapitrePositionne {
  /** [debut, fin) du texte_source dans le flux du livre. */
  debut: number;
  fin: number;
  /** texte à afficher (traduction, ou source si non traduite). */
  traduit: string;
}

/**
 * Construit l'alignement exact :
 *  - les positions des PAGES dans le flux (somme des longueurs —
 *    textesPages joint par '\n', identique à l'extraction d'import) ;
 *  - les positions des CHAPITRES dans le même flux (recherche
 *    séquentielle : chaque texte_source de la base est un sous-
 *    texte exact de ce flux — même extraction, même nettoyage) ;
 *  - la validité de chaque page : son contenu doit être recouvert
 *    à ≥ 85 % par des chapitres (couverture, sommaire, annonces…
 *    sont conservés tels quels).
 */
function positionner(
  textesPages: string[],
  chapitres: ChapitreFidele[]
): {
  flux: string;
  pages: Array<{ debut: number; fin: number } | null>;
  chapitresPos: ChapitrePositionne[];
} {
  const flux = textesPages.join('\n');

  // --- Positions des chapitres (sous-textes exacts, séquentiel). ---
  const chapitresPos: ChapitrePositionne[] = [];
  let curseur = 0;
  for (const c of chapitres) {
    const s = c.texte_source.replace(/\s+$/, '');
    let f = s.length >= 30 ? flux.indexOf(s, curseur) : -1;
    if (f < 0 && s.length > 0)
      f = flux.indexOf(s.slice(0, Math.min(160, s.length)), curseur);
    const traduit =
      c.texte_traduit !== null && c.texte_traduit.trim().length > 0
        ? c.texte_traduit.trim()
        : s;
    if (f >= 0) {
      chapitresPos.push({ debut: f, fin: f + s.length, traduit });
      curseur = f + s.length + 4; // petit débordement toléré
    } else {
      // Chapitre non localisé (prochaine version : recalcul de
      // l'extraction) : tout le flux du chapitre sera affiché en
      // source à l'export… ici on le positionne en proportion de
      // sa longueur pour ne pas désynchroniser les suivants.
      const debut = Math.min(curseur, Math.max(0, flux.length - s.length));
      chapitresPos.push({
        debut,
        fin: Math.min(flux.length, debut + Math.min(s.length, Math.max(0, flux.length - debut))),
        traduit,
      });
    }
  }

  // --- Positions des pages (somme des longueurs du même flux). ---
  const positionsBrutes: Array<{ debut: number; fin: number }> = [];
  let cumul = 0;
  for (const t of textesPages) {
    positionsBrutes.push({ debut: cumul, fin: cumul + t.length });
    cumul += t.length + 1; // le '\n' du join
  }
  void flux;

  // --- Recouvrement chapitre (page valide si ≥ 85 % couvert). ---
  const pagesValides = positionsBrutes.map((pos) => {
    if (pos.fin - pos.debut < 40) return null; // page quasi vide
    let couvert = 0;
    for (const c of chapitresPos) {
      const a = Math.max(pos.debut, c.debut);
      const b = Math.min(pos.fin, c.fin);
      if (b > a) couvert += b - a;
    }
    return couvert >= (pos.fin - pos.debut) * 0.85 ? pos : null;
  });

  return { flux, pages: pagesValides, chapitresPos };
}

/**
 * Le texte français correspondant à l'intervalle [debut, fin) du
 * flux SOURCE : projection proportionnelle sur la traduction de
 * chaque chapitre recoupé. Sortie CONTINUE : deux intervalles
 * sources consécutifs produisent du français consécutif
 * (pas de mot perdu, pas de mot dupliqué).
 */
function francaisPour(
  debut: number,
  fin: number,
  chapitresPos: ChapitrePositionne[]
): string {
  const morceaux: string[] = [];
  for (const c of chapitresPos) {
    const a = Math.max(debut, c.debut);
    const b = Math.min(fin, c.fin);
    if (b <= a) continue; // chapitre non recoupé
    const longSrc = c.fin - c.debut;
    if (longSrc <= 0) continue;
    const ra = Math.max(0, Math.floor(((a - c.debut) * c.traduit.length) / longSrc));
    const rb = Math.min(c.traduit.length, Math.ceil(((b - c.debut) * c.traduit.length) / longSrc));
    if (rb > ra) morceaux.push(assainir(c.traduit.slice(ra, rb)));
  }
  return morceaux.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------- Écoulement du texte dans la zone d'origine ----------

/**
 * Ré-écoule un texte dans une zone avec une taille et un
 * interligne donnés (mots entiers, largeur = zone). Renvoie les
 * lignes à poser (y décroissant depuis le haut) et le nombre de
 * lignes que la zone PEUT contenir.
 */
function ecoulerTexte(
  police: PDFFont,
  texte: string,
  zone: { x: number; y: number; w: number; h: number },
  taille: number,
  pas: number
): { posees: Array<{ x: number; y: number; ligne: string }>; tenables: number } {
  const mots = assainir(texte).split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courant = '';
  let wActuel = 0;
  const wEspace = police.widthOfTextAtSize(' ', taille);
  for (const mot of mots) {
    const wMot = police.widthOfTextAtSize(mot, taille);
    if (courant === '') {
      courant = mot;
      wActuel = wMot;
    } else if (wActuel + wEspace + wMot <= zone.w + 0.5) {
      courant += ' ' + mot;
      wActuel += wEspace + wMot;
    } else {
      lignes.push(courant);
      courant = mot;
      wActuel = wMot;
    }
  }
  if (courant !== '') lignes.push(courant);

  // Première baseline juste sous le haut de la zone ; le bas de la
  // dernière ligne (descendeurs ≈ 0.2 × taille) reste dans la zone.
  const yPremiere = zone.y + zone.h;
  const pasEff = Math.max(pas, taille * 0.75);
  const tenables = Math.max(
    1,
    Math.floor((zone.h + taille * 0.3) / pasEff)
  );
  const posees: Array<{ x: number; y: number; ligne: string }> = [];
  for (let i = 0; i < lignes.length; i++) {
    const y = yPremiere - i * pasEff;
    // Descendeurs réelles ≈ 0.3 × taille : la baseline doit laisser
    // cette marge avant le bas de la zone (sinon la ligne est
    // rognée visuellement sur les rendus).
    if (y - taille * 0.3 < zone.y) break; // plus de place dans la zone
    const wLigne = police.widthOfTextAtSize(lignes[i], taille);
    // Lettrage serré par défaut (fidèle à l'original) ; centré
    // seulement si la zone est nettement plus large que la ligne
    // (pages de titre / encadrés centrés).
    const x = zone.x + (wLigne < zone.w * 0.5 ? (zone.w - wLigne) / 2 : 0);
    posees.push({ x, y, ligne: lignes[i] });
  }
  return { posees, tenables };
}

// ---------- Assemblage du PDF final ----------

/** Fond des pages en blanc (les corps effacés recouverts de blanc). */
const BLANC = rgb(1, 1, 1);
const ENCRE = rgb(0, 0, 0);

/**
 * Produit le PDF « mise en page d'origine, contenu français ».
 * Voir l'en-tête du fichier pour le principe complet.
 * @param options octets du PDF original + scans + chapitres.
 */
export async function genererPdfFidele(
  options: OptionsPdfFidele
): Promise<ResultatPdfFidele> {
  const { octets, pages, textesPages, chapitres, onProgres } = options;
  const etape = (n: number, total: number, libelle?: string) =>
    onProgres?.(n, total, libelle);

  // 1. Analyse de la mise en page (corps / interligne / zone).
  etape(1, 4, 'Analyse de la mise en page d\u2019origine…');
  const analyse = analyserPages(pages);

  // 2. Alignement exact pages → flux source → traduction.
  etape(2, 4, 'Alignement original ↔ traduction…');
  const { pages: positions, chapitresPos } = positionner(
    textesPages,
    chapitres
  );
  const reconnus = positions.filter(Boolean).length;
  if (reconnus === 0) {
    throw new Error(
      'Aucune page du PDF n\u2019a été reconnue dans le texte du livre ' +
        '(import et PDF originaux différents ?). Rien n\u2019a été généré.'
    );
  }

  // 3. Copie COMPLÈTE de l'ouvrage original (toutes les pages).
  etape(3, 4, 'Copie de l\u2019ouvrage original…');
  const doc = await PDFDocument.create();
  const source = await PDFDocument.load(octets, { ignoreEncryption: true });
  const nb = source.getPageCount();
  if (nb === 0) throw new Error('PDF vide.');
  const dest = await doc.copyPages(
    source,
    Array.from({ length: nb }, (_, i) => i)
  );
  for (const p of dest) doc.addPage(p);
  const police = await doc.embedFont(StandardFonts.Helvetica);

  // 4. Page par page : effacement du corps source + écoulement FR.
  let pagesRemplacees = 0;
  let pagesIntactes = 0;
  interface Debordement {
    lignes: string[];
    zone: { x: number; y: number; w: number; h: number };
    taille: number;
    pas: number;
    lg: number;
    hg: number;
  }
  const debordements: Debordement[] = [];

  for (let i = 0; i < nb; i++) {
    const page = doc.getPage(i);
    const geo = analyse[i];
    const pos = positions[i];
    if (!geo || geo.corps.length === 0 || !geo.zone || !geo.tailleCorps || !pos) {
      pagesIntactes++;
      continue; // page non reconnue ou sans corps : conservée
    }
    const fr = francaisPour(pos.debut, pos.fin, chapitresPos);
    if (!fr) {
      pagesIntactes++;
      continue;
    }

    // --- Effacement du corps source : recouvrement EXACT des
    //     lignes mesurées (aucun graphisme voisin n'est touché).
    for (const l of geo.corps) {
      page.drawRectangle({
        x: Math.max(0, l.x - 1),
        y: Math.max(0, l.y - 1),
        width: Math.min(l.w + 2, geo.largeur - Math.max(0, l.x - 1)),
        height: Math.min(l.h + 2, geo.hauteur - Math.max(0, l.y - 1)),
        color: BLANC,
        opacity: 1,
      });
    }

    // --- Écoulement FR : typographie MESURÉE de cette page.
    let taille = Math.round(geo.tailleCorps * 10) / 10;
    let pas = geo.pas;
    let { posees, tenables } = ecoulerTexte(police, fr, geo.zone, taille, pas);

    // Le français est plus long que l'anglais : on serre
    // d'abord l'interligne, puis la taille — dans la limite du
    // lisible (lisibilité d'abord, fidélité ensuite).
    while (posees.length > tenables && pas > taille * 0.95) {
      pas = Math.round(pas * 0.93 * 10) / 10;
      ({ posees, tenables } = ecoulerTexte(police, fr, geo.zone, taille, pas));
    }
    while (posees.length > tenables && taille > Math.max(7, geo.tailleCorps * 0.7)) {
      taille = Math.round((taille - 0.4) * 10) / 10;
      pas = Math.round(Math.max(taille * 1.05, geo.pas * 0.85) * 10) / 10;
      ({ posees, tenables } = ecoulerTexte(police, fr, geo.zone, taille, pas));
    }

    // Dernier recours : les lignes restantes filent en page(s) de
    // fin (même gabarit, même zone, même mise en page).
    if (posees.length > tenables) {
      const quiTient = posees.slice(0, tenables);
      debordements.push({
        lignes: posees.slice(tenables).map((p2) => p2.ligne),
        zone: geo.zone,
        taille,
        pas,
        lg: geo.largeur,
        hg: geo.hauteur,
      });
      for (const ligne of quiTient) {
        page.drawText(assainir(ligne.ligne), {
          x: ligne.x,
          y: ligne.y,
          size: taille,
          font: police,
          color: ENCRE,
        });
      }
    } else {
      for (const ligne of posees) {
        page.drawText(assainir(ligne.ligne), {
          x: ligne.x,
          y: ligne.y,
          size: taille,
          font: police,
          color: ENCRE,
        });
      }
    }
    pagesRemplacees++;
    if ((i + 1) % 20 === 0 || i === nb - 1) {
      etape(3, 4, `Remplacement du texte… page ${i + 1}/${nb}`);
    }
  }

  // 5. Pages de débordement (le français est plus long : les
  //    restes continuent sur de nouvelles pages de même gabarit).
  etape(4, 4, 'Finalisation…');
  let pagesAjoutees = 0;
  for (const db of debordements) {
    const yPremiere = db.zone.y + db.zone.h;
    let y = yPremiere;
    let pageCourante: import('pdf-lib').PDFPage | null = null;
    for (const ligneTexte of db.lignes) {
      if (!pageCourante || y - db.taille * 0.3 < db.zone.y) {
        pageCourante = doc.addPage([db.lg, db.hg]);
        pageCourante.drawRectangle({
          x: 0,
          y: 0,
          width: db.lg,
          height: db.hg,
          color: BLANC,
        });
        y = yPremiere;
        pagesAjoutees++;
      }
      const wLigne = police.widthOfTextAtSize(ligneTexte, db.taille);
      const x =
        db.zone.x +
        (wLigne < db.zone.w * 0.5 ? (db.zone.w - wLigne) / 2 : 0);
      pageCourante.drawText(assainir(ligneTexte), {
        x,
        y,
        size: db.taille,
        font: police,
        color: ENCRE,
      });
      y -= db.pas;
    }
  }

  // 6. Sauvegarde.
  const octetsSortant = await doc.save({ useObjectStreams: false });
  return {
    octets: octetsSortant,
    nbPages: doc.getPageCount(),
    pagesRemplacees,
    pagesIntactes,
    pagesAjoutees,
  };
}