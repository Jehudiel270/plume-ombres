// ============================================================
// app/api/diagnostic-fedapay/route.ts — ⚠ TEMPORAIRE (diagnostic 502).
//
// Déployé le temps d'identifier la cause exacte du 502 de /api/paiement
// en production : blocage Cloudflare sur l'API live ? clé invalide ?
// incohérence FEDAPAY_ENV / clé ? À SUPPRIMER dès le verdict.
//
//   GET ?cle=<SECRET>          → sondes réseau en lecture seule
//                                 (aucune transaction créée, la clé
//                                 secrète n'est JAMAIS renvoyée) ;
//   GET ?cle=<SECRET>&essai=1  → création RÉELLE d'une transaction
//                                 test de 100 XOF, jamais encaissée.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  FedaPayFournisseur,
  cleCoherente,
  cleFedapay,
  fedapayEnv,
} from '@/lib/paiement/fedapay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

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

/** Jeu d'en-têtes « vrai navigateur » (au cas où Cloudflare va plus loin). */
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

  const cle = cleFedapay();
  const env = fedapayEnv();
  const baseApi = env === 'live' ? API_LIVE : API_SANDBOX;

  // Mode essai : création RÉELLE d'une transaction test (100 XOF, jamais
  // encaissée), en passant par le VRAI code de production (fedapay.ts).
  if (url.searchParams.get('essai') === '1') {
    if (!cle) {
      return NextResponse.json({
        ok: false,
        erreur: 'Clé FedaPay absente côté serveur.',
      });
    }
    try {
      const resultat = await new FedaPayFournisseur().creerPaiement({
        reference: `PLUME-DIAG-${Date.now()}`,
        plan: 'lecteur_mensuel',
        montant: 100,
        devise: 'XOF',
        moyen: 'carte',
        description: 'Diagnostic interne — transaction jamais encaissée',
        urlRetour: `${url.origin}/`,
        urlNotification: `${url.origin}/api/paiement/webhook`,
      });
      return NextResponse.json({
        ok: true,
        url: resultat.url,
        referenceFournisseur: resultat.referenceFournisseur,
        fournisseur: resultat.fournisseur,
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sondes réseau en lecture seule (en parallèle, 3 s max chacune).
  const [sansUa, uaSeul, uaComplet, avecCle, postSansCle] = await Promise.all([
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
  ]);

  return NextResponse.json({
    horodatage: new Date().toISOString(),
    domaine: url.host,
    fedapay: {
      env,
      clePresente: !!cle,
      clePrefixe: cle ? cle.slice(0, 8) : null,
      cleCoherente: cle ? cleCoherente(env, cle) : false,
    },
    sondes: [sansUa, uaSeul, uaComplet, avecCle, postSansCle],
  });
}
