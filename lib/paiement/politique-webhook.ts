// ============================================================
// lib/paiement/politique-webhook.ts — Politique de réponse au webhook.
//
// FedaPay réessaie un webhook jusqu'à 9 fois puis désactive l'endpoint
// après 10 échecs. Le code HTTP renvoyé pilote donc ce comportement :
//
//   * 2xx  → livraison considérée comme faite, plus de réessai ;
//   * 4xx  → erreur DÉFINITIVE : réessayer ne changera rien (paiement
//            inconnu, montant incohérent, événement inexploitable) ;
//   * 5xx  → erreur TRANSITOIRE (API FedaPay injoignable, base en
//            erreur) : il FAUT un réessai, sinon le paiement est perdu.
//
// Auparavant toute erreur renvoyait 400 : une panne passagère de l'API
// FedaPay ou de la base condamnait définitivement le paiement.
// Fonctions PURES, sans dépendance : testables hors Next.
// ============================================================

/** Vrai si le corps est le « ping » de vérification d'endpoint FedaPay. */
export function estPing(corps: unknown): boolean {
  if (!corps || typeof corps !== 'object') return false;
  const c = corps as Record<string, unknown>;
  const nom = typeof c.name === 'string' ? c.name.trim().toLowerCase() : '';
  if (nom === 'ping') return true;
  // Certaines versions envoient { event: 'ping' } ou un corps vide.
  const evenement =
    typeof c.event === 'string' ? c.event.trim().toLowerCase() : '';
  return evenement === 'ping';
}

/**
 * Causes DÉFINITIVES : le paiement n'existe pas chez nous, le montant ne
 * correspond pas, ou l'événement ne porte aucune référence. Un réessai
 * produirait exactement le même échec — et consommerait les 9 tentatives.
 */
const CAUSES_DEFINITIVES = [
  'paiement inconnu',
  'montant incohérent',
  'notification de paiement invalide',
  'webhook sans référence fournisseur',
  'plan inconnu',
  'plan non premium',
  'tunnel incomplet',
];

/**
 * Code HTTP à renvoyer à FedaPay pour un échec de traitement.
 * 400 pour une cause définitive, 500 (réessai) sinon.
 */
export function statutHttpErreurWebhook(message: string): 400 | 500 {
  const m = (message ?? '').toLowerCase();
  return CAUSES_DEFINITIVES.some((cause) => m.includes(cause)) ? 400 : 500;
}
