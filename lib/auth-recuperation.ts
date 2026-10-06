// ============================================================
// lib/auth-recuperation.ts — Décision de récupération de mot de passe.
//
// Supabase peut renvoyer l'utilisateur sur `redirectTo` selon TROIS
// formats, en fonction du gabarit d'e-mail et de la configuration du
// projet :
//   (1) `?code=...`                                  → flux PKCE ;
//   (2) `?token_hash=...&type=recovery`              → gabarit par défaut / verifyOtp ;
//   (3) `#access_token=...&refresh_token=...`        → flux implicit (fragment,
//       JAMAIS transmis au serveur : traité par une page navigateur).
// S'y ajoute le cas d'erreur renvoyé par Supabase :
//   `?error=access_denied&error_code=otp_expired`    → lien expiré.
//
// La logique de choix est EXTRAITE ici, dans une fonction PURE, afin
// d'être testable sans réseau ni boîte mail (voir
// scripts/_w-motdepasse-verif.mts).
// ============================================================

export type ParametresRecuperation =
  | URLSearchParams
  | Record<string, string | null | undefined>;

export type DecisionRecuperation =
  | { type: 'code'; code: string }
  | { type: 'otp'; otpType: string; tokenHash: string }
  | { type: 'erreur'; code: string; parametreErreur: 'lien-expire' | 'lien-invalide' }
  | { type: 'fragment' };

/** Lit un paramètre, que la source soit un URLSearchParams ou un objet brut. */
function lire(parametres: ParametresRecuperation, cle: string): string | null {
  if (typeof (parametres as URLSearchParams).get === 'function') {
    return (parametres as URLSearchParams).get(cle);
  }
  const valeur = (parametres as Record<string, string | null | undefined>)[cle];
  return valeur ?? null;
}

/**
 * Décide quoi faire des paramètres reçus sur /auth/confirmer.
 * Fonction pure : aucune E/S, aucun accès réseau.
 */
export function deciderRecuperation(
  parametres: ParametresRecuperation
): DecisionRecuperation {
  // (1) Flux PKCE — chemin historique, prioritaire.
  const code = lire(parametres, 'code');
  if (code) {
    return { type: 'code', code };
  }

  // (2) Gabarit par défaut / verifyOtp.
  const tokenHash = lire(parametres, 'token_hash');
  if (tokenHash) {
    return {
      type: 'otp',
      otpType: lire(parametres, 'type') ?? 'recovery',
      tokenHash,
    };
  }

  // (3) Erreur renvoyée par Supabase (lien expiré ou invalide).
  const erreur = lire(parametres, 'error') ?? lire(parametres, 'error_code');
  if (erreur) {
    const codeErreur = lire(parametres, 'error_code') ?? erreur;
    return {
      type: 'erreur',
      code: codeErreur,
      // `otp_expired`, `access_denied`… : tout ce qui évoque l'expiration
      // mène au message « lien expiré », le reste à « lien invalide ».
      parametreErreur: /expir/i.test(`${erreur} ${codeErreur}`)
        ? 'lien-expire'
        : 'lien-invalide',
    };
  }

  // (4) Rien d'exploitable côté serveur : le jeton est peut-être dans le
  // fragment (#access_token…), invisible ici → page de repli navigateur.
  return { type: 'fragment' };
}
