// ============================================================
// app/api/cron/surveillance/route.ts — Filet de sécurité quotidien.
//
// Une fois par jour (cron Vercel), on vérifie ce que personne ne
// regarde à 3 h du matin :
//   * des paiements restés « en attente » (webhook jamais arrivé) ;
//   * l'activité des dernières 24 h (réussis / échoués / en attente).
//
// Les paiements bloqués déclenchent UNE notification par jour aux
// administrateurs abonnés aux échecs (fonction SQL surveiller_paiements,
// idempotente). Cette route ne modifie JAMAIS un statut de paiement.
//
// Protection : en-tête `Authorization: Bearer <CRON_SECRET>` (envoyé
// automatiquement par Vercel Cron) ou `?secret=` pour un appel manuel.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { clientServiceRole } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEUIL_HEURES = 2;

function secretValide(request: NextRequest): boolean {
  const attendu = process.env.CRON_SECRET?.trim();
  if (!attendu) return false;
  const entete = request.headers.get('authorization') ?? '';
  const porteur = entete.toLowerCase().startsWith('bearer ')
    ? entete.slice(7).trim()
    : '';
  const manuel = request.nextUrl.searchParams.get('secret')?.trim() ?? '';
  return porteur === attendu || manuel === attendu;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { erreur: 'Surveillance non configurée (CRON_SECRET manquant).' },
      { status: 503 }
    );
  }
  if (!secretValide(request)) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const client = clientServiceRole();
  if (!client) {
    return NextResponse.json(
      { erreur: 'Client serveur indisponible.' },
      { status: 503 }
    );
  }

  // 1. Paiements bloqués + alerte groupée (une par jour).
  let bloques: unknown[] = [];
  let erreurSurveillance: string | null = null;
  const { data, error } = await client.rpc('surveiller_paiements', {
    p_heures: SEUIL_HEURES,
  });
  if (error) {
    erreurSurveillance = error.message;
  } else if (Array.isArray(data)) {
    bloques = data;
  }

  // 2. Activité des dernières 24 h (constat, aucune écriture).
  const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recents } = await client
    .from('paiements')
    .select('statut, montant, devise')
    .gte('created_at', depuis);

  const lignes = (recents ?? []) as { statut: string; montant: number }[];
  const bilan = {
    reussis: lignes.filter((p) => p.statut === 'reussi').length,
    echoues: lignes.filter((p) => p.statut === 'echoue').length,
    enAttente: lignes.filter((p) => p.statut === 'en_attente').length,
    volume: lignes
      .filter((p) => p.statut === 'reussi')
      .reduce((somme, p) => somme + (p.montant ?? 0), 0),
  };

  return NextResponse.json({
    ok: !erreurSurveillance,
    seuilHeures: SEUIL_HEURES,
    paiementsBloques: bloques.length,
    bloques,
    derniere24h: bilan,
    erreur: erreurSurveillance,
  });
}
