// ============================================================
// app/api/diagnostic-fedapay-edge/route.ts — ⚠ TEMPORAIRE (diagnostic).
//
// Mêmes sondes que /api/diagnostic-fedapay, mais exécutées par le
// runtime EDGE de Vercel (autre réseau de sortie que les fonctions
// Node/AWS). Objectif : savoir si la sortie Edge échappe au pare-feu
// Cloudflare de FedaPay. À SUPPRIMER dès le verdict.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'edge';

/** Secret d'accès — embarqué ici UNIQUEMENT le temps du diagnostic. */
const SECRET = '1788d47180d5b4a5fde9a374c074deddba1b84c8a4ba0860';

const API_LIVE = 'https://api.fedapay.com/v1';
const API_SANDBOX = 'https://sandbox-api.fedapay.com/v1';

/** Identique au correctif (lib/paiement/fedapay.ts). */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

interface Sonde {
  nom: string;
  statut: number | null;
  ms: number;
  type: string;
  extrait: string;
}

async function sonde(
  nom: string,
  url: string,
  init: RequestInit
): Promise<Sonde> {
  const debut = Date.now();
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 3_000);
  try {
    const reponse = await fetch(url, { ...init, signal: controleur.signal });
    const corps = (await reponse.text()).replace(/\s+/g, ' ').trim();
    return {
      nom,
      statut: reponse.status,
      ms: Date.now() - debut,
      type: reponse.headers.get('content-type') ?? '?',
      extrait: corps.slice(0, 140),
    };
  } catch (e) {
    return {
      nom,
      statut: null,
      ms: Date.now() - debut,
      type: 'exception',
      extrait: (e instanceof Error ? e.message : String(e)).slice(0, 140),
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/** Jeu d'en-têtes « vrai navigateur ». */
function enTetesNavigateurComplets(): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent': UA,
    'sec-ch-ua':
      '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if ((url.searchParams.get('cle') ?? '') !== SECRET) {
    return NextResponse.json({ erreur: 'Introuvable.' }, { status: 404 });
  }

  // Lecture directe des variables (sans importer fedapay.ts, qui tire
  // node:crypto — indisponible en runtime Edge).
  const env =
    process.env.FEDAPAY_ENV?.trim().toLowerCase() === 'live'
      ? 'live'
      : 'sandbox';
  const cle =
    (env === 'live'
      ? process.env.FEDAPAY_LIVE_SECRET_KEY
      : process.env.FEDAPAY_SANDBOX_SECRET_KEY
    )?.trim() ||
    process.env.FEDAPAY_SECRET_KEY?.trim() ||
    null;
  const baseApi = env === 'live' ? API_LIVE : API_SANDBOX;

  const [sansUa, uaSeul, uaComplet, avecCle, postSansCle, ancreSandbox] =
    await Promise.all([
      sonde(
        'GET /transactions sans User-Agent (repere de la panne)',
        `${API_LIVE}/transactions`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      ),
      sonde(
        'GET /transactions UA navigateur seul (correctif actuel)',
        `${API_LIVE}/transactions`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': UA },
        }
      ),
      sonde(
        'GET /transactions UA + en-tetes navigateur complets',
        `${API_LIVE}/transactions`,
        { method: 'GET', headers: enTetesNavigateurComplets() }
      ),
      sonde(
        `GET /transactions/0 avec la cle serveur (auth reelle, env ${env})`,
        `${baseApi}/transactions/0`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': UA,
            ...(cle ? { Authorization: `Bearer ${cle}` } : {}),
          },
        }
      ),
      sonde(
        'POST /transactions sans cle (Cloudflare laisse-t-il passer POST ?)',
        `${API_LIVE}/transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': UA,
          },
          body: '{}',
        }
      ),
      sonde(
        'GET sandbox /transactions avec UA (ancre : reseau Edge fonctionne ?)',
        `${API_SANDBOX}/transactions`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': UA },
        }
      ),
    ]);

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    runtime: 'edge',
    domaine: url.host,
    fedapay: {
      env,
      clePresente: !!cle,
      clePrefixe: cle ? cle.slice(0, 8) : null,
    },
    sondes: [sansUa, uaSeul, uaComplet, avecCle, postSansCle, ancreSandbox],
  });
}
