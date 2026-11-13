// ============================================================
// lib/plages-texte.ts — Fusion des plages posées sur le texte du
// chapitre (pur, testé, sans dépendance React).
//
// Deux familles de plages vivent sur le même texte :
//   * les OCCURRENCES DE RECHERCHE (transitoires, fréquentes) ;
//   * les SURLIGNAGES DU CARNET (persistants, rares).
//
// `fusionnerPlages` rend la liste des SEGMENTS ordonnés et sans
// chevauchement qui couvrent le texte : la recherche prime sur le
// surlignage là où les deux se recouvrent (le surlignage est
// rogné autour de la marque de recherche, jamais l'inverse — la
// recherche est éphémère, le surlignage reparaît intact après).
// ============================================================

/** Intervalle [debut, fin) sur le texte affiché du chapitre. */
export interface PlageTexte {
  debut: number;
  fin: number;
}

/** Surlignage persistant du carnet, repéré par l'identifiant de son entrée. */
export interface PlageSurlignage extends PlageTexte {
  /** Identifiant de l'entrée `carnet_notes` (suppression ciblée). */
  id: string;
}

export type SegmentTexte =
  | { type: 'texte'; debut: number; fin: number }
  | { type: 'recherche'; debut: number; fin: number; actif: boolean }
  | { type: 'surlignage'; debut: number; fin: number; id: string };

/** Occurrence de recherche, portant son index dans la requête courante. */
type Occurrence = PlageTexte & { index: number };

/** Borne une plage au texte, retourne null si elle est vide ou incohérente. */
function borner(plage: PlageTexte, longueur: number): PlageTexte | null {
  const debut = Math.max(0, Math.floor(plage.debut));
  const fin = Math.min(longueur, Math.floor(plage.fin));
  return fin > debut ? { debut, fin } : null;
}

/** Premier indice dont `fin > offset` (les segments sont triés, ils
 *  couvrent tout le texte) : borné au dernier segment pour qu'un
 *  appelant ne sorte jamais de la liste. */
export function indiceSegment(segments: SegmentTexte[], offset: number): number {
  let bas = 0;
  let haut = segments.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (segments[milieu].fin <= offset) bas = milieu + 1;
    else haut = milieu;
  }
  return segments.length > 0 ? Math.min(bas, segments.length - 1) : 0;
}

/**
 * Retrouve un extrait (carnet) dans un bloc de texte, À LA MANIÈRE DE
 * LA MAQUETTE : la correspondance ignore les blancs (plusieurs
 * espaces, retours à la ligne) — un extrait enregistré reste
 * retrouvé même si le texte brut porte des fins de ligne internes.
 * Renvoie les offsets dans le texte BRUT, ou null.
 */
export function trouverExtrait(brut: string, extrait: string): PlageTexte | null {
  if (!extrait) return null;
  // Compresse les blancs du texte brut en gardant la carte normé → brut.
  let norme = '';
  const carte: number[] = [];
  let blanc = false;
  for (let i = 0; i < brut.length; i += 1) {
    const c = brut[i];
    if (/\s/.test(c)) {
      blanc = true;
      continue;
    }
    if (blanc && norme.length > 0) {
      norme += ' ';
      carte.push(i);
      blanc = false;
    }
    norme += c;
    carte.push(i);
  }
  // Même compression pour l'extrait recherché.
  const cible = extrait.replace(/\s+/g, ' ').trim();
  if (!cible) return null;
  const i = norme.indexOf(cible);
  if (i < 0) return null;
  const debutBrut = carte[i];
  const finBrut = carte[i + cible.length - 1] + 1;
  return { debut: debutBrut, fin: finBrut };
}

/**
 * Fusionne occurrences de recherche et surlignages en segments ordonnés
 * couvrant [0, longueur). La RECHERCHE PRIME là où les deux se recouvrent.
 * `indexActif` désigne l'occurrence courante (marque renforcée) ; -1 ou
 * undefined = aucune.
 */
export function fusionnerPlages(
  longueur: number,
  occurrences: readonly PlageTexte[],
  surlignages: readonly PlageSurlignage[],
  indexActif = -1
): SegmentTexte[] {
  if (longueur <= 0) return [];

  const recherche: Occurrence[] = [];
  occurrences.forEach((p, i) => {
    const bornee = borner(p, longueur);
    if (bornee) recherche.push({ ...bornee, index: i });
  });
  const surligne: Array<PlageTexte & { id: string }> = [];
  surlignages.forEach((s) => {
    const bornee = borner(s, longueur);
    if (bornee && s.id) surligne.push({ ...bornee, id: s.id });
  });

  if (recherche.length === 0 && surligne.length === 0) {
    return [{ type: 'texte', debut: 0, fin: longueur }];
  }

  // Points de coupe : bornes de toutes les plages (déjà bornées).
  const coupes = new Set<number>([0, longueur]);
  for (const p of recherche) {
    coupes.add(p.debut);
    coupes.add(p.fin);
  }
  for (const s of surligne) {
    coupes.add(s.debut);
    coupes.add(s.fin);
  }
  const points = Array.from(coupes).sort((a, b) => a - b);

  /** Vrai si [a, b) tombe dans une occurrence ; actif si c'est la courante. */
  const dansRecherche = (a: number, b: number): boolean | null => {
    let touche: boolean | null = null;
    for (const p of recherche) {
      if (p.debut < b && p.fin > a) {
        if (touche === null) touche = false;
        if (p.index === indexActif) touche = true;
      }
    }
    return touche;
  };

  /** Identifiant du surlignage couvrant ENTIÈREMENT [a, b), sinon null. */
  const idSurlignage = (a: number, b: number): string | null => {
    for (const s of surligne) {
      if (s.debut <= a && s.fin >= b) return s.id;
    }
    return null;
  };

  const segments: SegmentTexte[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const rec = dansRecherche(a, b);
    if (rec !== null) {
      segments.push({ type: 'recherche', debut: a, fin: b, actif: rec });
      continue;
    }
    const id = idSurlignage(a, b);
    if (id) segments.push({ type: 'surlignage', debut: a, fin: b, id });
    else segments.push({ type: 'texte', debut: a, fin: b });
  }

  // Fusion des segments adjacents de même nature (et même état pour la
  // recherche) : les coupes techniques ne doivent pas fragmenter le rendu.
  const fusionnes: SegmentTexte[] = [];
  for (const s of segments) {
    const precedent = fusionnes[fusionnes.length - 1];
    if (precedent && precedent.fin === s.debut && precedent.type === s.type) {
      if (s.type === 'texte') {
        precedent.fin = s.fin;
        continue;
      }
      if (
        s.type === 'recherche' &&
        precedent.type === 'recherche' &&
        precedent.actif === s.actif
      ) {
        precedent.fin = s.fin;
        continue;
      }
      if (s.type === 'surlignage' && precedent.type === 'surlignage' && precedent.id === s.id) {
        precedent.fin = s.fin;
        continue;
      }
    }
    fusionnes.push({ ...s });
  }
  return fusionnes;
}
