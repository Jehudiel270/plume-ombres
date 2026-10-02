// ============================================================
// app/api/translate/sante/route.ts — Contrôle de santé RÉEL des
// moteurs de traduction.
//
// ACCÈS ADMIN UNIQUEMENT : la réponse nomme les fournisseurs et
// révèle l'ordre de la chaîne. Ces détails ne doivent JAMAIS
// atteindre un utilisateur final (promesse produit « texte privé »).
// Le contrôle teste réellement chaque moteur par un appel court,
// mis en cache (voir lib/providers/sante).
//
//   GET /api/translate/sante          → état (cache)
//   GET /api/translate/sante?forcer=1 → état frais (ignore le cache)
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { verifierPermission } from '@/lib/roles-garde';
import { verifierChaine } from '@/lib/providers/sante';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const decision = await verifierPermission('admin.tableau_de_bord.voir');
  if (decision.statut === 401) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }
  if (decision.statut !== 200) {
    return NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 });
  }

  const forcer = new URL(request.url).searchParams.get('forcer') === '1';
  const sante = await verifierChaine(forcer);
  return NextResponse.json(sante);
}
