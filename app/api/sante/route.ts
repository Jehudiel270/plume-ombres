// ============================================================
// app/api/sante/route.ts — Point d'état MACHINE (P1.6/P1.7).
//
// Destiné à un CRON EXTERNE (UptimeRobot, cron-job.org, healthcheck
// d'hébergeur…). Renvoie un état SIMPLE et STABLE :
//   * la base est-elle joignable (et en combien de millisecondes) ;
//   * la file de traduction est-elle en retard ;
//   * combien d'erreurs récentes (24 h).
//
// SÉCURITÉ : aucune clé, aucun identifiant interne, AUCUN CONTENU
// de livre n'est renvoyé. La RPC public.sante_machine() est la seule
// fonction de supervision ouverte à `anon` et ne produit que des
// nombres et des booléens.
//
// CODE HTTP (convention pour un moniteur naïf) :
//   200 = base joignable (état `ok` ou `degrade`, voir `alerte`) ;
//   503 = base injoignable ou état `panne`.
//
// Protection facultative : si SANTE_TOKEN est défini dans
// l'environnement, l'appel doit fournir ce jeton en en-tête
// `x-sante-token` ou en paramètre `?cle=`. Sans SANTE_TOKEN, la
// route reste ouverte (elle n'expose rien de sensible).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { collecterSanteMachine, etatGlobal } from '@/lib/sante';
import type { ClientRpc } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Forme exacte du corps (réutilisée par les tests). */
export interface CorpsSanteMachine {
  version: number;
  statut: 'ok' | 'degrade' | 'panne';
  quand: string;
  base: { joignable: boolean; latence_ms: number };
  file: { en_retard: boolean; en_cours: number; bloques: number };
  erreurs: { recentes_24h: number; chapitres: number; segments: number };
  alerte: boolean;
}

const ENTETES = { 'Cache-Control': 'no-store' } as const;

function corpsPanne(quand: string, latence: number): CorpsSanteMachine {
  return {
    version: 1,
    statut: 'panne',
    quand,
    base: { joignable: false, latence_ms: latence },
    file: { en_retard: false, en_cours: 0, bloques: 0 },
    erreurs: { recentes_24h: 0, chapitres: 0, segments: 0 },
    alerte: true,
  };
}

export async function GET(request: NextRequest) {
  const jeton = process.env.SANTE_TOKEN;
  const fourni =
    request.headers.get('x-sante-token') ??
    request.nextUrl.searchParams.get('cle') ??
    '';
  if (jeton && fourni !== jeton) {
    return NextResponse.json(
      { erreur: 'Non autorisé.' },
      { status: 401, headers: ENTETES }
    );
  }

  const quand = new Date().toISOString();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Base non configurée : traité comme une panne (le moniteur alerte).
  if (!url || !cle) {
    return NextResponse.json(corpsPanne(quand, 0), { status: 503, headers: ENTETES });
  }

  const supabase = createClient(url, cle);
  const clientRpc: ClientRpc = { rpc: (nom, args) => supabase.rpc(nom, args) };

  const debut = Date.now();
  const { donnees, erreur } = await collecterSanteMachine(clientRpc);
  const latence = Date.now() - debut;

  // Base injoignable (réseau, auth, RPC absente) → panne.
  if (!donnees || erreur) {
    return NextResponse.json(corpsPanne(quand, latence), {
      status: 503,
      headers: ENTETES,
    });
  }

  const statut = etatGlobal(donnees);
  const corps: CorpsSanteMachine = {
    version: 1,
    statut,
    quand,
    base: { joignable: true, latence_ms: latence },
    file: {
      en_retard: donnees.fileEnRetard,
      en_cours: donnees.segmentsEnCours,
      bloques: donnees.bloquesEnCours,
    },
    erreurs: {
      recentes_24h: donnees.erreurs24h,
      chapitres: donnees.chapitresErreur,
      segments: donnees.segmentsErreur,
    },
    alerte: statut !== 'ok',
  };
  return NextResponse.json(corps, { status: 200, headers: ENTETES });
}
