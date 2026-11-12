// ============================================================
// app/api/fedapay-relay/[...chemin]/route.ts — Relais Edge FedaPay.
//
// POURQUOI : depuis fin octobre 2026, `api.fedapay.com` (live) est
// derrière un pare-feu Cloudflare qui défie TOUTES les requêtes issues
// des adresses IP de datacenter utilisées par les fonctions Node de
// Vercel (AWS) — 403 « Just a moment… » même avec des en-têtes navigateur
// complets (diagnostic du 12/11). Les fonctions du runtime EDGE de
// Vercel sortent par un autre réseau, qui n'est pas défié.
//
// PRINCIPE : /api/paiement (Node) appelle CE relais (Edge) au lieu
// d'appeler api.fedapay.com directement ; le relais transmet la requête
// telle quelle (méthode, corps, Authorization) et renvoie la réponse
// telle quelle. La clé secrète reste serveur → serveur (même hébergeur),
// elle n'est JAMAIS journalisée.
//
// GARDE-FOUS (ce relais n'est PAS un proxy ouvert) :
//   * seuls les chemins /transactions… sont transmis ;
//   * seules les méthodes GET et POST ;
//   * l'en-tête Authorization doit avoir la forme `Bearer sk_live_…`
//     ou `Bearer sk_sandbox_…` ;
//   * corps limité à 64 Ko.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'edge';

const CIBLE = 'https://api.fedapay.com/v1';

/** Identique au correctif (lib/paiement/fedapay.ts). */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

const TAILLE_CORPS_MAX = 65_536;

async function relayer(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const chemin = url.pathname.replace(/^\/api\/fedapay-relay/, '') || '/';

  // Garde-fou 1 : uniquement les chemins de transactions FedaPay.
  if (!/^\/transactions(\/|$)/.test(chemin)) {
    return NextResponse.json(
      { erreur: '[relais] chemin non autorisé.' },
      { status: 403 }
    );
  }

  // Garde-fou 2 : uniquement GET et POST (les seuls méthodes utilisées).
  if (request.method !== 'GET' && request.method !== 'POST') {
    return NextResponse.json(
      { erreur: '[relais] méthode non autorisée.' },
      { status: 405 }
    );
  }

  // Garde-fou 3 : forme d'une clé secrète FedaPay, jamais de clé vide.
  const autorisation = request.headers.get('authorization') ?? '';
  if (!/^Bearer sk_(live|sand)/.test(autorisation)) {
    return NextResponse.json(
      { erreur: '[relais] accès réservé au serveur.' },
      { status: 403 }
    );
  }

  // Garde-fou 4 : corps plafonné (création de transaction = quelques Ko).
  let corps: string | undefined;
  if (request.method === 'POST') {
    corps = await request.text();
    if (corps.length > TAILLE_CORPS_MAX) {
      return NextResponse.json(
        { erreur: '[relais] corps trop volumineux.' },
        { status: 413 }
      );
    }
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 20_000);
  try {
    const reponse = await fetch(`${CIBLE}${chemin}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: autorisation,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Cloudflare (API live) défie le trafic sans UA navigateur.
        'User-Agent': UA,
      },
      body: corps,
      signal: controleur.signal,
    });
    const texte = await reponse.text();
    return new NextResponse(texte, {
      status: reponse.status,
      headers: {
        'Content-Type':
          reponse.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        erreur: `[relais] ${
          e instanceof Error ? e.message : 'appel FedaPay échoué.'
        }`,
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(minuteur);
  }
}

export async function GET(request: NextRequest) {
  return relayer(request);
}

export async function POST(request: NextRequest) {
  return relayer(request);
}
