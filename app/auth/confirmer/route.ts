// ============================================================
// app/auth/confirmer/route.ts — Échange du code d'authentification.
//
// Supabase renvoie l'utilisateur ici après un clic sur un lien
// e-mail (réinitialisation de mot de passe, confirmation de compte).
// On échange le `code` contre une SESSION (cookies), puis on redirige.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const suivant = url.searchParams.get('suivant') ?? '/nouveau-mot-de-passe';

  if (!code) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien-invalide', url.origin));
  }

  try {
    const supabase = await creerClientServeur();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL('/connexion?erreur=lien-expire', url.origin)
      );
    }
    const destination = suivant.startsWith('/') ? suivant : '/nouveau-mot-de-passe';
    return NextResponse.redirect(new URL(destination, url.origin));
  } catch {
    return NextResponse.redirect(new URL('/connexion?erreur=lien-expire', url.origin));
  }
}
