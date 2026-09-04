// ============================================================
// proxy.ts — Garde d'accès (ex-middleware, renommé dans Next 16).
// Rafraîchit la session Supabase et protège les pages privées.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAAjouter) {
          cookiesAAjouter.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          reponse = NextResponse.next({ request });
          cookiesAAjouter.forEach(({ name, value, options }) =>
            reponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chemin = request.nextUrl.pathname;
  const surPageConnexion = chemin.startsWith('/connexion');

  // Pages privées : on exige une session.
  if (!user && !surPageConnexion) {
    const url = new URL('/connexion', request.url);
    url.searchParams.set('suivant', chemin);
    return NextResponse.redirect(url);
  }

  // Déjà connecté : la page de connexion est inutile.
  if (user && surPageConnexion) {
    return NextResponse.redirect(new URL('/bibliotheque', request.url));
  }

  return reponse;
}

export const config = {
  // On exclut les fichiers statiques et les routes API
  // (celles-ci vérifient elles-mêmes la session).
  // ⚠ Le service worker ET le manifest ne doivent PAS être protégés :
  // un service worker qui redirige en 307 est invalidé par le navigateur,
  // ce qui fait échouer l'installation PWA.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|service-worker\\.js|sw\\.js|manifest\\.webmanifest|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
