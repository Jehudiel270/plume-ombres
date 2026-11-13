// ============================================================
// lib/cartes.ts — Cartes de lecture partageables (F13).
//
// Une CARTE = un extrait CITÉ (plafonné STRICTEMENT à 280
// caractères), le titre du livre et le chapitre, l'attribution de
// l'atelier. Le visuel est produit en SVG (chaîne, pure et testée) :
// lisible partout, téléchargeable, sans service externe.
//
// RÈGLE (à peser, notée au registre) : un extrait cité reste un
// usage PRIVÉ — la carte porte l'attribution et le rappel de droits ;
// la publication reste du ressort du lecteur et des droits de
// l'œuvre. Aucune publication automatique n'existe dans le module.
// ============================================================

/** Plafond STRICT d'un extrait cité sur une carte. */
export const MAX_EXTRAIT_CARTE = 280;

/** Coupe l'extrait au plafond, sur une frontière de mot si possible. */
export function extraitPourCarte(texte: string): string {
  const propre = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (propre.length <= MAX_EXTRAIT_CARTE) return propre;
  const coupe = propre.slice(0, MAX_EXTRAIT_CARTE);
  const dernierEspace = coupe.lastIndexOf(' ');
  const corps = dernierEspace > MAX_EXTRAIT_CARTE * 0.6
    ? coupe.slice(0, dernierEspace)
    : coupe;
  return `${corps.trimEnd()}…`;
}

/** Échappe les caractères sensibles du SVG (texte de l'extrait). */
export function echapperSvg(texte: string): string {
  return (texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Découpe un texte en lignes de ~largeur caractères (pure, testée). */
export function lignesPourSvg(texte: string, largeur = 34): string[] {
  const mots = (texte ?? '').split(' ').filter(Boolean);
  const lignes: string[] = [];
  let ligne = '';
  for (const mot of mots) {
    if (ligne && `${ligne} ${mot}`.length > largeur) {
      lignes.push(ligne);
      ligne = mot;
    } else {
      ligne = ligne ? `${ligne} ${mot}` : mot;
    }
  }
  if (ligne) lignes.push(ligne);
  return lignes.slice(0, 10);
}

export interface DonneesCarte {
  extrait: string;
  titreLivre: string;
  chapitre?: string | null;
}

/**
 * Produit le SVG de la carte : fond nuit, liseré grenat, extrait en
 * italique, attribution obligatoire en pied de carte.
 */
export function carteSvg(donnees: DonneesCarte): string {
  const extrait = extraitPourCarte(donnees.extrait);
  const lignes = lignesPourSvg(extrait);
  const hauteurLigne = 30;
  const haut = 96;
  const hauteur = haut + lignes.length * hauteurLigne + 92;
  const guillemet = lignes.length > 0 ? '«' : '«»';
  const corps = lignes
    .map(
      (l, i) =>
        `<text x="64" y="${haut + i * hauteurLigne}" class="extrait">${echapperSvg(l)}</text>`
    )
    .join('\n    ');
  const reference = donnees.chapitre
    ? `${donnees.titreLivre} — ${donnees.chapitre}`
    : donnees.titreLivre;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="880" height="${hauteur}" viewBox="0 0 880 ${hauteur}" role="img" aria-label="Carte de citation">
  <style>
    .fond { fill: #140d11; }
    .liseret { fill: #7d3a47; }
    .extrait { fill: #efe6ea; font: italic 22px Georgia, 'Times New Roman', serif; }
    .reference { fill: #b9a9b1; font: 16px Georgia, serif; }
    .source { fill: #8a7a84; font: 13px Georgia, serif; letter-spacing: 1px; }
  </style>
  <rect class="fond" width="880" height="${hauteur}" rx="24"/>
  <rect class="liseret" x="48" y="40" width="6" height="${hauteur - 116}" rx="3"/>
  <text x="64" y="72" class="source">PLUME D'OMBRES — ${echapperSvg(guillemet === '«' ? 'EXTRAIT' : 'EXTRAIT')}</text>
    ${corps}
  <text x="64" y="${hauteur - 56}" class="reference">${echapperSvg(reference)}</text>
  <text x="64" y="${hauteur - 30}" class="source">Extrait cité, usage privé — l'œuvre reste la propriété de ses ayants droit.</text>
</svg>`;
}
