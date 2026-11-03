// ============================================================
// lib/tracking.ts — Normalisation PURE des événements de visite.
//
// Le navigateur envoie ce qu'il sait ; le serveur ne garde que ce qui
// est utile aux statistiques et jamais ce qui identifie une personne :
//   * chemin nettoyé (pas de requête, pas de paramètres, longueur bornée) ;
//   * domaine d'origine du lien, pas l'URL complète ;
//   * famille d'appareil déduite de l'en-tête User-Agent, qui n'est
//     jamais stocké ;
//   * identifiant de session aléatoire fourni par le client.
// ============================================================

export interface EvenementVisite {
  chemin: string;
  source: string | null;
  appareil: string;
  visiteur: string;
}

const LONGUEUR_CHEMIN_MAX = 200;
const LONGUEUR_SOURCE_MAX = 80;

/** Un chemin interne, sans requête, sans ancre, sans remontée. */
export function nettoyerChemin(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  let chemin = brut.trim();
  if (!chemin) return null;

  // On ne garde que la partie « chemin » : tout ce qui suit ? ou # est une
  // donnée d'utilisateur (recherche, filtre) qui n'a rien à faire en base.
  chemin = chemin.split('?')[0].split('#')[0];

  // Chemin relatif uniquement : ni schéma, ni domaine.
  if (!chemin.startsWith('/')) chemin = `/${chemin}`;
  if (chemin.startsWith('//')) return null;

  // Les routes d'API et les fichiers ne sont pas des pages vues.
  if (chemin.startsWith('/api/') || chemin.startsWith('/_next/')) return null;

  return chemin.slice(0, LONGUEUR_CHEMIN_MAX);
}

/** Domaine d'origine d'un lien entrant ; `null` si direct ou interne. */
export function sourceDepuisReferent(
  referent: unknown,
  hoteCourant: string | null = null
): string | null {
  if (typeof referent !== 'string' || !referent.trim()) return null;
  let url: URL;
  try {
    url = new URL(referent.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const hote = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!hote) return null;
  if (hoteCourant && hote === hoteCourant.toLowerCase().replace(/^www\./, '')) return null;

  return hote.slice(0, LONGUEUR_SOURCE_MAX);
}

/** Famille d'appareil, déduite de l'en-tête User-Agent (jamais conservé). */
export function familleAppareil(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return 'inconnu';
  // Les robots sont écartés : ils gonfleraient artificiellement l'audience.
  if (/bot|crawler|spider|crawl|curl|wget|headless|preview/.test(ua)) return 'robot';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablette';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return 'mobile';
  return 'bureau';
}

/** Un identifiant de session plausible : 8 à 64 caractères sûrs. */
export function visiteurValide(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const valeur = brut.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(valeur)) return null;
  return valeur;
}

/**
 * Construit l'événement à enregistrer, ou `null` si la requête n'a pas de
 * sens (chemin invalide, robot, visiteur absent).
 */
export function construireEvenement(entree: {
  chemin: unknown;
  referent: unknown;
  visiteur: unknown;
  userAgent: string | null | undefined;
  hoteCourant?: string | null;
}): EvenementVisite | null {
  const chemin = nettoyerChemin(entree.chemin);
  if (!chemin) return null;

  const visiteur = visiteurValide(entree.visiteur);
  if (!visiteur) return null;

  const appareil = familleAppareil(entree.userAgent);
  if (appareil === 'robot') return null;

  return {
    chemin,
    source: sourceDepuisReferent(entree.referent, entree.hoteCourant ?? null),
    appareil,
    visiteur,
  };
}
