// ============================================================
// app/api/admin/alertes/route.ts — Qui reçoit les alertes de paiement.
//
// GET  → { paiementReussi, paiementEchoue } pour le compte connecté
// POST → { reussi, echoue, utilisateurId? } (soi-même ; un autre
//        administrateur pour le seul super-administrateur)
//
// Toute la sécurité est en base : definir_alertes() vérifie
// elle-même que l'on ne règle que ses propres alertes, sauf
// super-administrateur. Ici on ne fait que relayer la session.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurRequete } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('mes_alertes');
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 400 });
  }
  const ligne = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    paiementReussi: (ligne as { paiement_reussi?: boolean } | null)?.paiement_reussi ?? true,
    paiementEchoue: (ligne as { paiement_echoue?: boolean } | null)?.paiement_echoue ?? true,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  let corps: { reussi?: unknown; echoue?: unknown; utilisateurId?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const reussi = typeof corps.reussi === 'boolean' ? corps.reussi : true;
  const echoue = typeof corps.echoue === 'boolean' ? corps.echoue : true;
  const cible =
    typeof corps.utilisateurId === 'string' && corps.utilisateurId.trim()
      ? corps.utilisateurId.trim()
      : null;

  const { error } = await supabase.rpc('definir_alertes', {
    p_reussi: reussi,
    p_echoue: echoue,
    p_compte: cible,
  });

  if (error) {
    const reserve = /super-administrateur|super_admin/i.test(error.message);
    return NextResponse.json(
      {
        erreur: reserve
          ? 'Réservé au super-administrateur.'
          : 'Réglage impossible pour le moment.',
      },
      { status: reserve ? 403 : 400 }
    );
  }

  return NextResponse.json({ ok: true, reussi, echoue, utilisateurId: cible });
}
