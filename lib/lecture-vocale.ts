// ============================================================
// lib/lecture-vocale.ts — Logique PURE de la lecture à voix haute
// (F9, Web Speech API).
//
// Rien de navigateur ici : ces fonctions sont testées par
// lib/lecture-vocale.test.ts et consommées par
// components/lecteur/LectureVocale.tsx. La synthèse vocale elle-même
// n'existe que côté navigateur (window.speechSynthesis) — iOS Safari
// l'expose aussi, sous réserve d'un geste utilisateur (le bouton de
// lecture en est un).
// ============================================================

import { decouperEnParagraphes, estSeparateurScene } from '@/lib/pagination';

/** Limite prudente par énoncé : les synthèses du navigateur tronquent
 *  au-delà d'environ 32 000 caractères (Chrome) et bien plus tôt sur
 *  iOS. On découpe paragraphe par paragraphe, puis phrase par phrase
 *  si un paragraphe dépasse cette limite. */
export const LIMITE_ENONCE = 4_000;

/** Vitesse de lecture proposées (×1 = voix normale). */
export const VITESSES = [0.75, 1, 1.25, 1.5] as const;
export type VitesseLecture = (typeof VITESSES)[number];

/** Vrai si la valeur est une vitesse connue. */
export function estVitesse(valeur: unknown): valeur is VitesseLecture {
  return (VITESSES as readonly unknown[]).includes(valeur);
}

/** Ramène une vitesse quelconque à une vitesse proposée (défaut ×1). */
export function normaliserVitesse(valeur: unknown): VitesseLecture {
  return estVitesse(valeur) ? valeur : 1;
}

/**
 * Découpe le texte du chapitre en SEGMENTS de lecture dans l'ordre :
 * d'abord les blocs typographiques (paragraphes + séparateurs de
 * scène, même découpage que le rendu), puis, si un bloc dépasse la
 * limite par énoncé, ses phrases. Les séparateurs de scène (« * * * »)
 * sont ignorés : rien à lire.
 */
export function decouperPourLecture(texte: string): string[] {
  const blocs = decouperEnParagraphes(texte);
  const segments: string[] = [];
  for (const bloc of blocs) {
    // Séparateur de scène (« * * * ») : rien à lire.
    if (bloc.type === 'scene' || estSeparateurScene(bloc.texte)) continue;
    const propre = bloc.texte.replace(/\s+/g, ' ').trim();
    if (!propre) continue;
    if (propre.length <= LIMITE_ENONCE) {
      segments.push(propre);
      continue;
    }
    // Paragraphe long : découpe aux fins de phrases (prudence i18n :
    // ponctuations . ! ? … suivies d'un espace), en gardant chaque
    // morceau sous la limite même sans ponctuation.
    const phrases = propre.match(/[^.!?…]+[.!?…]*\s*/g) ?? [propre];
    let courant = '';
    for (const phrase of phrases) {
      if ((courant + phrase).length > LIMITE_ENONCE && courant) {
        segments.push(courant.trim());
        courant = '';
      }
      // Une phrase seule plus longue que la limite : découpe forcée.
      if (phrase.length > LIMITE_ENONCE) {
        for (let i = 0; i < phrase.length; i += LIMITE_ENONCE) {
          const morceau = phrase.slice(i, i + LIMITE_ENONCE).trim();
          if (morceau) segments.push(morceau);
        }
      } else {
        courant += phrase;
      }
    }
    if (courant.trim()) segments.push(courant.trim());
  }
  return segments;
}

/**
 * Choisit la voix de synthèse. Priorité :
 *   1. la voix nommée `preferee` si elle existe encore (réglage
 *      enregistré) ;
 *   2. une voix française (fr-FR d'abord, puis les autres fr) ;
 *   3. la voix par défaut du navigateur ;
 *   4. la première voix disponible.
 * Retourne null si le navigateur n'expose aucune voix.
 */
export function choisirVoix(
  voix: ReadonlyArray<{
    name: string;
    lang: string;
    default?: boolean;
  }>,
  preferee?: string | null
): { name: string; lang: string; default?: boolean } | null {
  if (voix.length === 0) return null;
  if (preferee) {
    const trouvee = voix.find((v) => v.name === preferee);
    if (trouvee) return trouvee;
  }
  const francaises = voix.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  const frFR = francaises.find((v) => v.lang.toLowerCase().replace('_', '-') === 'fr-fr');
  return frFR ?? francaises[0] ?? voix.find((v) => v.default) ?? voix[0];
}

/**
 * Voix françaises et autres voix triées pour le sélecteur : françaises
 * d'abord (fr-FR avant les autres), puis le reste par nom. Renvoie
 * au plus `max` entrées.
 */
export function voixTriees(
  voix: ReadonlyArray<{ name: string; lang: string }>,
  max = 30
): Array<{ name: string; lang: string }> {
  const tri = [...voix].sort((a, b) => {
    const fa = a.lang.toLowerCase().startsWith('fr') ? 0 : 1;
    const fb = b.lang.toLowerCase().startsWith('fr') ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const ra = a.lang.toLowerCase().replace('_', '-') === 'fr-fr' ? 0 : 1;
    const rb = b.lang.toLowerCase().replace('_', '-') === 'fr-fr' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'fr');
  });
  return tri.slice(0, max);
}
