// ============================================================
// app/api/statut/route.ts — État de disponibilité du service.
//
// Route PUBLIQUE et MINIMALE, pensée pour le MONITORING :
// elle ne dit QUE si le service peut traduire aujourd'hui.
//
//  • AUCUN nom de fournisseur (promesse produit : l'utilisateur ne
//    doit jamais savoir quel moteur traduit son texte) ;
//  • aucun détail interne, aucune latence, aucun ordre de chaîne ;
//  • 200 « ok » si au moins un moteur répond, 503 « degrade » sinon.
//
// Le contrôle est RÉEL mais mis en cache (voir lib/providers/sante) :
// un cron peut l'appeler souvent sans marteler les fournisseurs.
// ============================================================

import { NextResponse } from 'next/server';
import { verifierDisponibilite } from '@/lib/providers/sante';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // S'arrête au premier moteur qui répond : le quota des moteurs
    // tiers n'est consommé que si le moteur privé est tombé.
    const { disponible, horodatage } = await verifierDisponibilite();
    return NextResponse.json(
      {
        statut: disponible ? 'ok' : 'degrade',
        horodatage,
      },
      {
        status: disponible ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    // Une panne du contrôle lui-même n'est pas une panne du service :
    // on le signale comme dégradé, sans jamais faire échouer la route.
    return NextResponse.json(
      { statut: 'inconnu', horodatage: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
