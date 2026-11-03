// ============================================================
// app/auth/confirmer/route.ts — Échange du lien d'authentification.
//
// Supabase renvoie l'utilisateur ici après un clic sur un lien e-mail
// (réinitialisation de mot de passe, confirmation de compte). Trois
// formats sont possibles (voir lib/auth-recuperation.ts) :
//   • `?code=...`                            → exchangeCodeForSession (PKCE) ;
//   • `?token_hash=...&type=recovery`        → verifyOtp (gabarit par défaut) ;
//   • erreur `?error=...`                    → redirection d'erreur explicite ;
//   • aucun paramètre serveur                → page de repli /auth/reinitialiser
//     (le jeton peut être dans le fragment #access_token, invisible ici).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase/server';
import { deciderRecuperation } from '@/lib/auth-recuperation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const suivant = url.searchParams.get('suivant') ?? '/nouveau-mot-de-passe';
  const decision = deciderRecuperation(url.searchParams);

  // Lien expiré / invalide : message clair côté /connexion (pas de crash).
  if (decision.type === 'erreur') {
    return NextResponse.redirect(
      new URL(`/connexion?erreur=${decision.parametreErreur}`, url.origin)
    );
  }

  // Rien d'exploitable côté serveur : le jeton est peut-être dans le
  // fragment (#access_token…), jamais transmis au serveur → page navigateur.
  if (decision.type === 'fragment') {
    return NextResponse.redirect(new URL('/auth/reinitialiser', url.origin));
  }

  try {
    const supabase = await creerClientServeur();

    if (decision.type === 'code') {
      const { error } = await supabase.auth.exchangeCodeForSession(decision.code);
      if (error) {
        return NextResponse.redirect(
          new URL('/connexion?erreur=lien-expire', url.origin)
        );
      }
    } else {
      const { error } = await supabase.auth.verifyOtp({
        type: decision.otpType as EmailOtpType,
        token_hash: decision.tokenHash,
      });
      if (error) {
        return NextResponse.redirect(
          new URL('/connexion?erreur=lien-expire', url.origin)
        );
      }
    }

    // Chemins internes uniquement. `//exemple.com` et `/\exemple.com` sont
    // des URL relatives au protocole : le navigateur les traite comme un
    // domaine EXTERNE (redirection ouverte, hameçonnage post-connexion).
    const interne =
      suivant.startsWith('/') && !suivant.startsWith('//') && !suivant.startsWith('/\\');
    const destination = interne ? suivant : '/nouveau-mot-de-passe';
    return NextResponse.redirect(new URL(destination, url.origin));
  } catch {
    return NextResponse.redirect(new URL('/connexion?erreur=lien-expire', url.origin));
  }
}
