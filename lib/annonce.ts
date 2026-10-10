// ============================================================
// lib/annonce.ts — Bannière d'annonce affichée en haut de TOUTES les
// pages du site.
//
// Usage prévu : prévenir les visiteurs qu'une NOUVELLE ADRESSE est en
// service et les y conduire (bascule d'hébergement, avant l'arrivée du
// domaine propre : le site reste joignable aux deux adresses).
//
// INERTE PAR DÉFAUT : tant que `actif` vaut `false`, ou que l'URL est
// vide ou invalide, RIEN n'est rendu. La bannière ne peut donc pas
// apparaître par erreur en production — l'activation est un acte
// volontaire, sur une seule ligne.
//
// Pour l'activer : remplir `url` avec la nouvelle adresse (https) et
// passer `actif` à `true`. Aucun redéploiement de configuration n'est
// nécessaire : un simple commit suffit.
// ============================================================

export interface Annonce {
  /** Interrupteur général : `false` = jamais rien à l'écran. */
  actif: boolean;
  /** Phrase affichée aux visiteurs. */
  texte: string;
  /** Nouvelle adresse du site (http/https). */
  url: string;
  /** Libellé du lien qui y conduit. */
  libelleLien: string;
}

export const ANNONCE: Annonce = {
  actif: false,
  texte:
    'Plume d’Ombres change d’adresse : retrouvez le site, vos livres et vos traductions à sa nouvelle adresse.',
  url: '',
  libelleLien: 'Ouvrir la nouvelle adresse',
};

/**
 * Vrai si la bannière doit être rendue : activation explicite ET URL
 * absolue valide. Fonction PURE (aucune dépendance Next/Supabase), donc
 * exécutable telle quelle par un test.
 */
export function annonceVisible(annonce: Annonce = ANNONCE): boolean {
  if (!annonce.actif) return false;
  const url = annonce.url.trim();
  if (!url || !annonce.texte.trim() || !annonce.libelleLien.trim()) return false;
  try {
    const analysee = new URL(url);
    return analysee.protocol === 'https:' || analysee.protocol === 'http:';
  } catch {
    return false;
  }
}
