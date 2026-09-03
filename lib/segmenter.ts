// ============================================================
// segmenter.ts — Découpage et assemblage 1:1 du texte.
//
// Principe : le texte est découpé en « unités » de traduction.
// Chaque unité transporte sa « suite » : l'espacement exact
// (espaces, retours à la ligne, lignes vides) qui la suivait
// dans l'original. Réassembler consiste à concaténer
// (traduction + suite) pour chaque unité dans l'ordre —
// la structure du texte est donc préservée à l'identique,
// quelle que soit la sortie du fournisseur de traduction.
// ============================================================

export interface Unite {
  /** Contenu à traduire (ne commence ni ne finit par des blancs). */
  source: string;
  /** Espacement brut qui suit l'unité dans le texte d'origine. */
  suite: string;
}

/**
 * Découpe un texte entier en unités de traduction.
 *
 * Garantie : aucun retour à la ligne ne subsiste dans `source` —
 * tous les '\n' (simples ou lignes vides) sont placés dans `suite`.
 * La structure est donc préservée à l'identique quel que soit le
 * comportement du fournisseur face aux sauts de ligne.
 *
 * @param texte    texte brut (source)
 * @param maxChars taille maximale (en caractères) d'une unité
 */
export function decouperTexte(texte: string, maxChars: number): Unite[] {
  const normalise = texte.replace(/\r\n?/g, '\n');
  if (normalise.length === 0) return [];

  // Chaque segment sauf le dernier est une ligne TERMINÉE par '\n'.
  // Le dernier segment est la fin du texte, sans '\n' final.
  const segments = normalise.split('\n');
  const fin = segments.pop() ?? '';
  const unites: Unite[] = [];
  let colle = ''; // '\n' de lignes vides, en attente d'attachement

  /** Rattache la colle en attente à la dernière unité (ou crée une unité vide). */
  function viderColle() {
    if (colle === '') return;
    if (unites.length > 0) {
      unites[unites.length - 1].suite += colle;
    } else {
      unites.push({ source: '', suite: colle }); // blancs de tête
    }
    colle = '';
  }

  function ajouterLigne(ligne: string, terminee: boolean) {
    if (ligne === '') {
      // Ligne vide : elle ne contribue que son '\n' de terminaison.
      if (terminee) colle += '\n';
      return;
    }
    viderColle();

    // Les espaces/tabulations de fin de ligne sont de la « colle » :
    // ils ne doivent pas voyager dans le texte à traduire.
    const espacesFin = ligne.match(/[ \t]+$/)?.[0] ?? '';
    const corpsLigne = ligne.slice(0, ligne.length - espacesFin.length);

    if (corpsLigne.length === 0) {
      // Ligne faite uniquement d'espaces : on la préserve telle quelle.
      unites.push({ source: '', suite: espacesFin });
    } else if (corpsLigne.length <= maxChars) {
      unites.push({ source: corpsLigne, suite: espacesFin });
    } else {
      const pieces = decouperLigneTropLongue(corpsLigne, maxChars);
      pieces[pieces.length - 1].suite += espacesFin;
      unites.push(...pieces);
    }

    if (terminee) {
      // Le '\n' qui termine la ligne appartient à la suite de l'unité.
      unites[unites.length - 1].suite += '\n';
    }
  }

  for (const segment of segments) {
    ajouterLigne(segment, true);
  }
  ajouterLigne(fin, false); // dernière ligne : sans '\n' final
  viderColle(); // lignes vides résiduelles (impossible ici, par sûreté)

  return unites;
}

/**
 * Vérifie que la concaténation des unités reconstitue le texte d'origine.
 * (Test de non-régression, utilisé dans le pipeline de test.)
 */
export function verifierIntegrite(texte: string, unites: Unite[]): boolean {
  const reconstitue = unites
    .map((u) => u.source + u.suite)
    .join('');
  return reconstitue === texte.replace(/\r\n?/g, '\n');
}

/**
 * Assemble les traductions avec les espacements d'origine.
 * @param unitesTraduites liste parallèle aux unités découpées :
 *                        chaque élément est la traduction de source,
 *                        ou null si l'unité n'a pas été traduite
 *                        (auquel cas le texte source est utilisé tel quel).
 */
export function assembler(unitesTraduites: Array<{ traduit: string | null; suite: string }>): string {
  return unitesTraduites
    .map((u) => (u.traduit ?? '') + u.suite)
    .join('');
}

/**
 * Traduit une unité vide ? non — utilitaire : une unité de texte pur
 * (source sans suite) pour les tests rapides.
 */
export function unite(source: string, suite = ''): Unite {
  return { source, suite };
}

// ------------------------------------------------------------
// Découpage interne d'une ligne trop longue.
// Les coupures privilégient : fin de phrase, puis espace ;
// en dernier recours, coupure sèche.
// ------------------------------------------------------------

const FIN_PHRASE = new Set(['.', '!', '?', '…', '»', '”', '"']);

function decouperLigneTropLongue(ligne: string, maxChars: number): Unite[] {
  const unites: Unite[] = [];
  let debut = 0;

  while (debut < ligne.length) {
    const reste = ligne.slice(debut);
    if (reste.length <= maxChars) {
      unites.push({ source: reste, suite: '' });
      break;
    }
    const coupe = trouverCoupe(reste, maxChars);
    // coupe : index où finit la portion « source » (la suite commence après).
    const source = reste.slice(0, coupe);
    // On détache les blancs qui suivent immédiatement la coupure.
    const m = reste.slice(coupe).match(/^[ \t]*/);
    const blanc = m ? m[0] : '';
    unites.push({ source, suite: blanc });
    debut += coupe + blanc.length;
  }

  return unites;
}

/** Trouve le meilleur index de coupure dans [1, maxChars]. */
function trouverCoupe(texte: string, maxChars: number): number {
  let meilleur = -1;
  let qualite = -1;

  for (let i = 1; i <= maxChars && i < texte.length; i++) {
    const c = texte[i - 1];
    const d = texte[i];

    if (FIN_PHRASE.has(c) && /\s/.test(d)) {
      // Fin de phrase suivie d'un blanc : coupure idéale.
      if (i > meilleur || qualite < 3) {
        meilleur = i;
        qualite = 3;
      }
    } else if (c === '\n') {
      // Retour à la ligne : bonne coupure (structure préservée).
      if (i > meilleur || qualite < 2) {
        meilleur = i;
        qualite = 2;
      }
    } else if (/\s/.test(c) && qualite < 1) {
      meilleur = i;
      qualite = 1;
    }
  }

  return meilleur > 0 ? meilleur : maxChars;
}

/** Détection approximative des titres de chapitres dans un texte. */
const TITRE_CHAPITRE =
  /^(?:\s*#+\s*)?(?:chapter|chapitre|prologue|epilogue|part|book|livre|préface|preface|avant-propos|introduction)\b[\s\dIVXLClivxlc.:\-—]*[^\n]{0,80}$/i;

export interface ChapitreBrut {
  titre: string;
  texte: string;
}

/**
 * Découpe un livre complet en chapitres bruts.
 * - Détecte les titres de chapitres sur leur propre ligne
 *   (anglais ou français, avec ou sans marqueur Markdown #).
 * - Si aucun titre n'est trouvé, le livre entier est un seul chapitre.
 */
export function decouperEnChapitres(texteBrut: string): ChapitreBrut[] {
  const texte = texteBrut.replace(/\r\n?/g, '\n').trim();
  if (texte.length === 0) return [{ titre: 'Chapitre 1', texte: '' }];

  const lignes = texte.split('\n');
  const chapitres: ChapitreBrut[] = [];
  let courant: ChapitreBrut | null = null;
  let tampon: string[] = [];

  const ajouter = () => {
    if (courant) {
      courant.texte = tampon.join('\n').trim() + '\n';
      chapitres.push(courant);
    }
    tampon = [];
  };

  for (const ligne of lignes) {
    const l = ligne.trim();
    if (l.length > 0 && l.length <= 90 && TITRE_CHAPITRE.test(l)) {
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

  // Renumérote proprement les chapitres sans numéro explicite.
  return chapitres.map((c, i) => ({
    titre: c.titre || `Chapitre ${i + 1}`,
    texte: c.texte,
  }));
}
