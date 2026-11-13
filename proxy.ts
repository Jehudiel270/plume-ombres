// ============================================================
// proxy.ts — Garde d'accès (ex-middleware, renommé dans Next 16).
// Rafraîchit la session Supabase et protège les pages privées.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { verdictPourChemin } from '@/lib/fonctionnalites/etats';

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

  // ============================================================
  // VARIABLES D'ENVIRONNEMENT ABSENTES : diagnostic explicite.
  //
  // createServerClient exige l'URL et la clé publique Supabase : sans
  // elles, il lève à CHAQUE requête et l'environnement répond un
  // « Internal Server Error » opaque (500) — sur un aperçu Vercel
  // dont les variables sont limitées à la portée « Production », TOUT
  // le site paraît en panne. On rend ici une page 503 qui dit
  // exactement quoi corriger, au lieu d'une erreur muette.
  // ============================================================
  const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const cleAnonSupabase = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlSupabase || !cleAnonSupabase) {
    console.error(
      '[proxy] Variables d’environnement Supabase absentes ' +
        '(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). ' +
        'Sur Vercel : Settings → Environment Variables → activer ces ' +
        'variables pour la portée « Preview », puis redeployer la branche.'
    );
    return new NextResponse(
      `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Déploiement non configuré — Plume d'Ombres</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #14100f; color: #d8cfc7; font-family: Georgia, serif; }
  main { max-width: 640px; padding: 2rem; line-height: 1.6; }
  h1 { font-size: 1.4rem; color: #e8ddd2; }
  code { color: #c9a86a; }
  ul { padding-left: 1.2rem; }
</style>
</head>
<body>
<main>
  <h1>Déploiement non configuré</h1>
  <p>Le site n’a pas pu démarrer sur cet environnement : les variables
  Supabase sont absentes du déploiement.</p>
  <ul>
    <li>Ouvrez Vercel → projet → <code>Settings</code> →
      <code>Environment Variables</code> ;</li>
    <li>vérifiez que <code>NEXT_PUBLIC_SUPABASE_URL</code> et
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> sont cochées pour la
      portée <code>Preview</code> (et pas seulement <code>Production</code>) ;</li>
    <li>relancez ensuite le déploiement de la branche
      (<code>Redeploy</code>).</li>
  </ul>
</main>
</body>
</html>`,
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '60' } }
    );
  }

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

  // Supabase momentanément injoignable : on considère le visiteur
  // non connecté plutôt que de faire répondre 500 à TOUTES les pages
  // (les pages publiques restent lisibles, les privées renvoient vers
  // la connexion ; les cookies de session ne sont pas touchés).
  let user: User | null = null;
  try {
    user = (await supabase.auth.getUser()).data.user ?? null;
  } catch (e) {
    console.error(
      '[proxy] Supabase injoignable, session ignorée pour cette requête :',
      e instanceof Error ? e.message : e
    );
  }

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

  // ============================================================
  // Interrupteurs de fonctionnalités (chantier post-lancement).
  //
  // Barrière GROSSIÈRE côté pages : un module fermé par
  // l'administrateur répond 404 — comme si la route n'existait pas
  // (aucune donnée n'est rendue, donc rien ne fuit). Les contrôles
  // FINS (abonnement minimal, déploiement progressif) sont revérifiés
  // CÔTÉ SERVEUR dans chaque page et chaque route d'API du module :
  // le proxy n'a ni le plan ni l'identifiant du lecteur, et le
  // serveur est l'autorité (règle du brief).
  //
  // Les routes d'API sont exclues du matcher de ce proxy : chaque
  // route d'API d'un module appelle sa propre barrière fine
  // (lib/fonctionnalites/etats.verifierModuleApi).
  // ============================================================
  if (!estCheminReserve(chemin)) {
    const { def, verdict } = await verdictPourChemin(chemin, 'pages');
    if (def && !verdict.ouvert) {
      return new NextResponse(null, { status: 404 });
    }
  }

  return reponse;
}

/**
 * Chemins que la barrière des interrupteurs ne doit JAMAIS examiner
 * ici : le socle (l'atelier personnel) et l'admin (qui vérifie ses
 * propres permissions) ne passent pas par les interrupteurs de
 * pages. Le calcul précis vit dans le registre ; ce test rapide ne
 * sert qu'à épargner une lecture d'états aux requêtes du socle.
 * La décision fine reste dans verdictPourChemin (interrupteurPourChemin).
 */
function estCheminReserve(chemin: string): boolean {
  // Un interrupteur n'a de sens que pour ses propres itinéraires :
  // verdictPourChemin ne matche rien pour le socle, mais ce filtre
  // évite la lecture d'états (fetch) sur CHAQUE page ordinaire.
  const segments = chemin.toLowerCase().split('?')[0].split('/').filter(Boolean);
  const premier = segments[0] ?? '';
  // Préfixes du socle et de l'admin (registre : ITINERAIRES_SOCLE /
  // ITINERAIRES_ADMIN — première liste segmentée pour la vitesse).
  const exclus = new Set([
    'bibliotheque', 'livres', 'favoris', 'compte', 'abonnement', 'paiement',
    'connexion', 'auth', 'mot-de-passe-oublie', 'nouveau-mot-de-passe',
    'tarifs', 'faq', 'contact', 'mentions-legales', 'conditions',
    'confidentialite', 'remboursement', 'cookies', 'admin',
  ]);
  return exclus.has(premier);
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
