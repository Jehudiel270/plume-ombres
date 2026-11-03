// ============================================================
// app/api/track/route.ts — Collecte d'audience (POST /api/track).
//
// Route PUBLIQUE et volontairement minimale :
//   * elle n'écrit QUE des comptages anonymes (voir lib/tracking.ts) ;
//   * elle ne lit aucune session, n'accepte aucun identifiant de compte ;
//   * elle répond 204 dans tous les cas d'erreur « normale » : un
//     visiteur ne doit jamais voir une erreur parce qu'une mesure a
//     échoué.
// Écriture via service_role : la table public.visites est muette pour
// les clients (RLS sans politique).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { clientServiceRole } from '@/lib/paiement/serveur';
import {
  MagasinRateLimitMemoire,
  entetesRateLimit,
  extraireIp,
  limiterRequete,
  type EtatRateLimit,
} from '@/lib/rate-limit';
import { construireEvenement } from '@/lib/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Un humain change de page quelques fois par minute ; au-delà de 60
// événements par minute et par IP, c'est un script.
const LIMITE_PAR_MINUTE = 60;
const magasin = new MagasinRateLimitMemoire();

function reponseVide(statut: number, entetes?: HeadersInit): NextResponse {
  return new NextResponse(null, { status: statut, headers: entetes });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = extraireIp(request);

  let etat: EtatRateLimit | null = null;
  try {
    etat = await limiterRequete(
      magasin,
      { ip, userId: null },
      { fenetreS: 60, limiteIp: LIMITE_PAR_MINUTE, limiteCompte: LIMITE_PAR_MINUTE }
    );
  } catch {
    etat = null; // le limiteur ne doit jamais bloquer la mesure
  }
  if (etat && !etat.autorise) {
    return reponseVide(429, entetesRateLimit(etat));
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return reponseVide(204);
  }
  if (typeof corps !== 'object' || corps === null) return reponseVide(204);

  const brut = corps as Record<string, unknown>;
  const evenement = construireEvenement({
    chemin: brut.chemin,
    referent: brut.referent,
    visiteur: brut.visiteur,
    userAgent: request.headers.get('user-agent'),
    hoteCourant: request.nextUrl.hostname,
  });

  // Chemin d'API, robot, identifiant absent : rien à enregistrer, mais le
  // client reçoit quand même un succès silencieux.
  if (!evenement) return reponseVide(204);

  const service = clientServiceRole();
  if (!service) return reponseVide(204);

  try {
    await service.from('visites').insert({
      chemin: evenement.chemin,
      source: evenement.source,
      appareil: evenement.appareil,
      visiteur: evenement.visiteur,
    });
  } catch {
    return reponseVide(204);
  }

  return reponseVide(204, etat ? entetesRateLimit(etat) : undefined);
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ erreur: 'Méthode non autorisée.' }, { status: 405 });
}
