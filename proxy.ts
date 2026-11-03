// ============================================================
// proxy.ts — Garde d'accès (ex-middleware, renommé dans Next 16).
// Rafraîchit la session Supabase et protège les pages privées.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Ancienne adresse Vercel : redirection permanente vers le domaine définitif.
  // Sans cela, un lien partagé sur l'ancienne adresse produit un aperçu qui
  // garde l'ancien nom, et le référencement se disperse sur deux hôtes.
  // (Les URL de préversion *.vercel.app ne sont PAS touchées.)
  const hote = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const hoteOfficiel = new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://plumedombres.kodelyza.com'
  ).host.toLowerCase();
  const ALIAS_ANCIENS = ['plume-ombres.vercel.app', `www.${hoteOfficiel}`];
  if (hote && ALIAS_ANCIENS.includes(hote) && hote !== hoteOfficiel) {
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${hoteOfficiel}`),
      308
    );
  }

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

  // Pages PUBLIQUES (chantier UX C4/C6) : landing, tarifs, FAQ et pages
  // légales doivent rester lisibles AVANT toute inscription — c'est même
  // leur raison d'être. Le garde-fou de session ne s'y applique pas.
  const PAGES_PUBLIQUES = [
    '/',
    '/tarifs',
    '/faq',
    '/contact',
    '/mentions-legales',
    '/conditions',
    '/confidentialite',
    '/remboursement',
    '/cookies',
    // Récupération de compte : accessibles SANS session, par nature.
    '/mot-de-passe-oublie',
    '/nouveau-mot-de-passe',
    // Repli du flux implicit : le fragment #access_token… est posé côté
    // navigateur, donc la page doit rester publique (le matcher exclut
    // déjà `auth/`, cette entrée rend l'intention explicite).
    '/auth/reinitialiser',
  ];
  const surPagePublique = PAGES_PUBLIQUES.includes(chemin);

  // Pages privées : on exige une session.
  if (!user && !surPageConnexion && !surPagePublique) {
    const url = new URL('/connexion', request.url);
    url.searchParams.set('suivant', chemin);
    return NextResponse.redirect(url);
  }

  // Déjà connecté : sur une page publique, on laisse lire (la landing
  // sert aussi d'espace de présentation) ; seule /connexion redirige.
  if (user && surPageConnexion) {
    return NextResponse.redirect(new URL('/bibliotheque', request.url));
  }

  return reponse;
}

export const config = {
  // On exclut les fichiers statiques, les routes API et le flux
  // d'authentification (ceux-ci vérifient eux-mêmes la session).
  // ⚠ Le service worker ET le manifest ne doivent PAS être protégés :
  // un service worker qui redirige en 307 est invalidé par le navigateur,
  // ce qui fait échouer l'installation PWA.
  matcher: [
    // ⚠ Les images générées par Next (opengraph-image, twitter-image,
    // apple-icon) n'ont pas d'extension : sans exclusion explicite, le
    // proxy les renvoie en 307 vers /connexion et les robots de
    // WhatsApp, Facebook et X n'affichent aucune vignette de partage.
    '/((?!api/|auth/|_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|robots\\.txt|sitemap\\.xml|service-worker\\.js|sw\\.js|manifest\\.webmanifest|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
